// Pure lifecycle choreography for aihub agents (Phase 2).
//
// The hub roster is ephemeral: subagents spawn and despawn constantly. This module
// holds the *decision* logic for the office's spawn/despawn choreography so it can be
// unit-tested without React or three.js:
//   - which done agents walk out through the door vs. fade in place (flash agents),
//     with a cap on simultaneous walk-outs (the rest queue);
//   - when a whole session (a session node + its subagents) has fully left the roster,
//     so the janitors can be cued once per session end.
//
// Coordinates, materials, and A* routing live in the renderer; this file is coordinate-free.

import type { OfficeCleaningCue } from "@/lib/office/janitorReset";
import type { HubNodeStatus } from "@/lib/runtime/aihub/types";

// ---------------------------------------------------------------------------
// Walk-out / fade-out plan
// ---------------------------------------------------------------------------

export type LeavingAgentInput = {
  agentId: string;
  hubStatus: HubNodeStatus | null;
};

export type LeavingPlan = {
  // Granted a walk-out slot: route to the exit door and fade out.
  walkOutByAgentId: Record<string, boolean>;
  // Flash agents (lived < flash window): fade where they stand, no walk.
  fadeInPlaceByAgentId: Record<string, boolean>;
};

export type ResolveLeavingPlanInput = {
  agents: LeavingAgentInput[];
  // Client-side first-seen timestamp per agentId. The hub payload carries no spawn
  // time, so the renderer/host tracks when each agent first appeared in the roster.
  firstSeenByAgentId: Record<string, number>;
  now: number;
  maxSimultaneousWalkOuts?: number;
  flashLifetimeMs?: number;
};

export const DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS = 4;
export const DEFAULT_FLASH_LIFETIME_MS = 5_000;

export const resolveLeavingPlan = ({
  agents,
  firstSeenByAgentId,
  now,
  maxSimultaneousWalkOuts = DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS,
  flashLifetimeMs = DEFAULT_FLASH_LIFETIME_MS,
}: ResolveLeavingPlanInput): LeavingPlan => {
  const walkOutByAgentId: Record<string, boolean> = {};
  const fadeInPlaceByAgentId: Record<string, boolean> = {};

  const walkCandidates: { agentId: string; firstSeen: number }[] = [];
  for (const agent of agents) {
    if (agent.hubStatus !== "done") continue;
    const firstSeen = firstSeenByAgentId[agent.agentId] ?? now;
    const lifetime = now - firstSeen;
    if (lifetime < flashLifetimeMs) {
      fadeInPlaceByAgentId[agent.agentId] = true;
    } else {
      walkCandidates.push({ agentId: agent.agentId, firstSeen });
    }
  }

  // Oldest-arrived leave first. Stable ordering keeps an in-progress walk-out from
  // being yanked out of its slot as newer agents finish, and makes the cap deterministic.
  walkCandidates.sort(
    (a, b) => a.firstSeen - b.firstSeen || (a.agentId < b.agentId ? -1 : 1),
  );

  const grantCount = Math.min(walkCandidates.length, maxSimultaneousWalkOuts);
  for (let i = 0; i < grantCount; i += 1) {
    walkOutByAgentId[walkCandidates[i]!.agentId] = true;
  }
  // Candidates beyond the cap are queued: they appear in neither map and stay seated
  // until a slot frees or the hub drops them from the roster.

  return { walkOutByAgentId, fadeInPlaceByAgentId };
};

// ---------------------------------------------------------------------------
// Session-leave janitor cues
// ---------------------------------------------------------------------------

export type SessionAgentInput = {
  agentId: string;
  name: string;
  // Immediate spawn parent (hub metadata). Subagents carry no session_id, so the
  // session tree is reconstructed from the parent chain, not a shared session id.
  parentAgentId: string | null;
};

export type SessionGroupSnapshot = {
  key: string;
  agentId: string;
  agentName: string;
};

export const SESSION_LEAVE_CUE_PREFIX = "aihub-session-leave:";

// A "session" clusters a top-level session node with its entire subagent subtree.
// Each agent is folded into its root ancestor (walk the parent chain until the parent
// is null or outside the roster); the root's id is the group key. A group is present
// while any member remains, so a cue fires only once the whole tree has left.
export const buildSessionGroups = (
  agents: SessionAgentInput[],
): SessionGroupSnapshot[] => {
  const parentById = new Map<string, string | null>();
  const nameById = new Map<string, string>();
  for (const agent of agents) {
    parentById.set(agent.agentId, agent.parentAgentId);
    nameById.set(agent.agentId, agent.name);
  }
  const resolveRoot = (agentId: string): string => {
    let current = agentId;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const parent = parentById.get(current);
      if (!parent || !parentById.has(parent)) break;
      current = parent;
    }
    return current;
  };
  const byKey = new Map<string, SessionGroupSnapshot>();
  for (const agent of agents) {
    const rootId = resolveRoot(agent.agentId);
    if (byKey.has(rootId)) continue;
    byKey.set(rootId, {
      key: rootId,
      agentId: rootId,
      agentName: nameById.get(rootId) || agent.name || "Session",
    });
  }
  return [...byKey.values()];
};

export type ResolveSessionLeaveCuesInput = {
  previousSessions: SessionGroupSnapshot[];
  currentSessions: SessionGroupSnapshot[];
  emittedKeys: string[];
  now: number;
};

export type ResolveSessionLeaveCuesResult = {
  cues: OfficeCleaningCue[];
  emittedKeys: string[];
};

// Emits one cleaning cue per session that was present last poll and is now fully gone.
// `emittedKeys` guards against re-firing for the same session end (belt-and-suspenders
// alongside the renderer's own cue-id dedup, since the cue id is stable per session).
export const resolveSessionLeaveCues = ({
  previousSessions,
  currentSessions,
  emittedKeys,
  now,
}: ResolveSessionLeaveCuesInput): ResolveSessionLeaveCuesResult => {
  const currentKeys = new Set(currentSessions.map((session) => session.key));
  const emitted = new Set(emittedKeys);
  const cues: OfficeCleaningCue[] = [];

  for (const session of previousSessions) {
    if (currentKeys.has(session.key)) continue; // still present
    if (emitted.has(session.key)) continue; // already fired for this session end
    emitted.add(session.key);
    cues.push({
      id: `${SESSION_LEAVE_CUE_PREFIX}${session.key}`,
      agentId: session.agentId,
      agentName: session.agentName,
      ts: now,
    });
  }

  return { cues, emittedKeys: [...emitted] };
};

// ---------------------------------------------------------------------------
// Referential stabilization helper (keeps downstream memo/effect deps quiet)
// ---------------------------------------------------------------------------

export const shallowEqualBooleanRecord = (
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

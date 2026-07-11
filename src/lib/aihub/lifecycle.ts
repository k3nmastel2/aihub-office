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
  // Client-side timestamp of when each agent was first observed as `done`. Used to
  // give the walk-out animation to the *freshest* leavers (still mid-fade) rather
  // than long-done nodes the hub retains but that already faded to invisible.
  doneSinceByAgentId: Record<string, number>;
  now: number;
  maxSimultaneousWalkOuts?: number;
  flashLifetimeMs?: number;
};

export const DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS = 4;
export const DEFAULT_FLASH_LIFETIME_MS = 5_000;

// INVARIANT: every `done` agent lands in exactly one of the two maps, so it always
// fades. The cap limits how many *walk* to the door at once; the rest fade in place.
// (Regression guard for the ghost bug: an over-cap done node in NEITHER map never
// gets `leavingSince` set in the renderer and stays fully visible forever.)
export const resolveLeavingPlan = ({
  agents,
  firstSeenByAgentId,
  doneSinceByAgentId,
  now,
  maxSimultaneousWalkOuts = DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS,
  flashLifetimeMs = DEFAULT_FLASH_LIFETIME_MS,
}: ResolveLeavingPlanInput): LeavingPlan => {
  const walkOutByAgentId: Record<string, boolean> = {};
  const fadeInPlaceByAgentId: Record<string, boolean> = {};

  const walkCandidates: { agentId: string; doneSince: number }[] = [];
  for (const agent of agents) {
    if (agent.hubStatus !== "done") continue;
    const lifetime = now - (firstSeenByAgentId[agent.agentId] ?? now);
    if (lifetime < flashLifetimeMs) {
      // Flash agent — it barely existed; fade where it stands, no walk.
      fadeInPlaceByAgentId[agent.agentId] = true;
    } else {
      walkCandidates.push({
        agentId: agent.agentId,
        doneSince: doneSinceByAgentId[agent.agentId] ?? now,
      });
    }
  }

  // Freshest-done first: the agents currently mid-fade get the walk animation, while
  // long-done nodes (already faded to invisible) yield their slots. This keeps the cap
  // from being permanently starved by legacy done nodes the hub retains for minutes.
  walkCandidates.sort(
    (a, b) => b.doneSince - a.doneSince || (a.agentId < b.agentId ? -1 : 1),
  );

  walkCandidates.forEach((candidate, index) => {
    if (index < maxSimultaneousWalkOuts) {
      walkOutByAgentId[candidate.agentId] = true;
    } else {
      // Over the walk cap → still leaving, just fade in place (NEVER left unmapped).
      fadeInPlaceByAgentId[candidate.agentId] = true;
    }
  });

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

// Folds every agent to its session root by walking the parent chain until the parent
// is null or outside the roster; returns agentId → rootId for the whole set. Shared by
// session-leave cue detection (buildSessionGroups) and pod seating so both cluster a
// session tree the same way (subagents carry no session_id — the parent chain is the key).
export const resolveSessionRootByAgentId = (
  agents: SessionAgentInput[],
): Map<string, string> => {
  const parentById = new Map<string, string | null>();
  for (const agent of agents) {
    parentById.set(agent.agentId, agent.parentAgentId);
  }
  const rootById = new Map<string, string>();
  for (const agent of agents) {
    let current = agent.agentId;
    const seen = new Set<string>();
    while (!seen.has(current)) {
      seen.add(current);
      const parent = parentById.get(current);
      if (!parent || !parentById.has(parent)) break;
      current = parent;
    }
    rootById.set(agent.agentId, current);
  }
  return rootById;
};

// A "session" clusters a top-level session node with its entire subagent subtree.
// Each agent is folded into its root ancestor; the root's id is the group key. A group
// is present while any member remains, so a cue fires only once the whole tree has left.
export const buildSessionGroups = (
  agents: SessionAgentInput[],
): SessionGroupSnapshot[] => {
  const rootById = resolveSessionRootByAgentId(agents);
  const nameById = new Map<string, string>();
  for (const agent of agents) {
    nameById.set(agent.agentId, agent.name);
  }
  const byKey = new Map<string, SessionGroupSnapshot>();
  for (const agent of agents) {
    const rootId = rootById.get(agent.agentId) ?? agent.agentId;
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

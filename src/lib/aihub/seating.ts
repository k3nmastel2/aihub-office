// Pure pod-seating allocator for aihub agents (Phase 3).
//
// The office's aihub layout preset is a set of pods (a lead/anchor desk + 3 member
// desks). This module decides which agent sits at which desk so a hub session and its
// subagent subtree become a visible *team* clustered around one pod:
//   - each session lead (the root of a spawn subtree) claims a pod anchor desk;
//   - its subagents fold up the parent chain to that session and take member desks;
//   - overflow members (beyond the pod's 3 seats) and overflow sessions (beyond the
//     available pods) get no desk and roam near the crowd (upstream's no-desk fallback);
//   - done agents release their desk.
//
// STABILITY is a hard requirement: a lead must not swap pods across polls, and members
// must not shuffle desks as the roster churns. The allocator is a pure function of its
// inputs, and takes the previous poll's assignment so bindings stay sticky when the
// roster shifts (a new session gets a *free* pod; it never renumbers existing ones).
//
// Coordinate-free: desks are opaque uids grouped by pod. The renderer owns geometry.

import { resolveSessionRootByAgentId } from "@/lib/aihub/lifecycle";
import type { HubNodeStatus } from "@/lib/runtime/aihub/types";

export type SeatingAgentInput = {
  agentId: string;
  kind: "session" | "subagent";
  // Immediate spawn parent (hub metadata). Subagents carry no session_id, so the
  // session tree is reconstructed from the parent chain, not a shared session id.
  parentAgentId: string | null;
  hubStatus: HubNodeStatus | null;
};

// One desk within a pod. `seat: "lead"` is the pod anchor (a session lead sits here);
// `"member"` desks host the session's subagents. `deskUid` is the FurnitureItem `_uid`
// so the output keys line up with the renderer's desk routing.
export type PodDeskSlot = {
  deskUid: string;
  podIndex: number;
  seat: "lead" | "member";
};

export type ComputeAihubSeatingOptions = {
  // Client-side first-seen timestamp per agentId (the hub payload carries no spawn
  // time). Drives first-seen ordering for pod claims and member desk fills.
  firstSeenByAgentId?: Record<string, number>;
  // The previous poll's `deskUid -> agentId` assignment. Feeding it back keeps leads
  // in their pods and members at their desks as the roster churns.
  previousAssignment?: Record<string, string>;
};

type PodDesks = {
  leadDeskUid: string | null;
  memberDeskUids: string[];
};

// deskUid -> agentId. A desk absent from the map is empty; an agent absent from the
// values roams (no desk). Same roster + same previous in → same map out.
export const computeAihubSeating = (
  agents: SeatingAgentInput[],
  deskItems: PodDeskSlot[],
  options: ComputeAihubSeatingOptions = {},
): Record<string, string> => {
  const { firstSeenByAgentId = {}, previousAssignment = {} } = options;
  const result: Record<string, string> = {};

  // --- Pod descriptors (preserve authored member-desk order) ---
  const podOrder: number[] = [];
  const podDesks = new Map<number, PodDesks>();
  for (const slot of deskItems) {
    let pod = podDesks.get(slot.podIndex);
    if (!pod) {
      pod = { leadDeskUid: null, memberDeskUids: [] };
      podDesks.set(slot.podIndex, pod);
      podOrder.push(slot.podIndex);
    }
    if (slot.seat === "lead") {
      if (pod.leadDeskUid === null) pod.leadDeskUid = slot.deskUid;
    } else {
      pod.memberDeskUids.push(slot.deskUid);
    }
  }
  podOrder.sort((a, b) => a - b);
  if (podOrder.length === 0) return result;

  // --- Seatable agents (done releases its desk) ---
  const seatable = agents.filter((agent) => agent.hubStatus !== "done");
  const seatableIds = new Set(seatable.map((agent) => agent.agentId));

  // --- Fold every agent to its session root. Done agents stay in the chain map so a
  // still-running subagent keeps its session root while its lead winds down (rather
  // than orphaning into its own pod); only seatable agents are actually seated. ---
  const rootById = resolveSessionRootByAgentId(
    agents.map((agent) => ({
      agentId: agent.agentId,
      name: "",
      parentAgentId: agent.parentAgentId,
    })),
  );
  const rootOf = (agentId: string) => rootById.get(agentId) ?? agentId;

  const groupMembers = new Map<string, string[]>();
  for (const agent of seatable) {
    const root = rootOf(agent.agentId);
    const members = groupMembers.get(root);
    if (members) members.push(agent.agentId);
    else groupMembers.set(root, [agent.agentId]);
  }

  const firstSeen = (agentId: string) =>
    firstSeenByAgentId[agentId] ?? Number.MAX_SAFE_INTEGER;
  const byFirstSeen = (a: string, b: string) => {
    const fa = firstSeen(a);
    const fb = firstSeen(b);
    if (fa !== fb) return fa - fb;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  // --- Sticky pod ownership: which session held each pod last poll (by any of its
  // desks, lead first) — so a lead keeps its pod even after a lower-index pod frees. ---
  const podForRoot = new Map<string, number>();
  const usedPods = new Set<number>();
  for (const podIndex of podOrder) {
    const pod = podDesks.get(podIndex)!;
    const desks = pod.leadDeskUid
      ? [pod.leadDeskUid, ...pod.memberDeskUids]
      : pod.memberDeskUids;
    for (const deskUid of desks) {
      const prevOccupant = previousAssignment[deskUid];
      if (!prevOccupant || !seatableIds.has(prevOccupant)) continue;
      const owner = rootOf(prevOccupant);
      if (!groupMembers.has(owner) || podForRoot.has(owner)) continue;
      podForRoot.set(owner, podIndex);
      usedPods.add(podIndex);
      break;
    }
  }

  // --- New sessions claim free pods in first-seen order (leads never renumber) ---
  const newRoots = [...groupMembers.keys()]
    .filter((root) => !podForRoot.has(root))
    .sort(byFirstSeen);
  const freePods = podOrder.filter((podIndex) => !usedPods.has(podIndex));
  let freeCursor = 0;
  for (const root of newRoots) {
    if (freeCursor >= freePods.length) break; // overflow session → roam
    podForRoot.set(root, freePods[freeCursor]);
    freeCursor += 1;
  }

  // --- Seat each pod's session: lead at the anchor, subagents at member desks ---
  for (const [root, podIndex] of podForRoot) {
    const pod = podDesks.get(podIndex)!;
    const members = [...(groupMembers.get(root) ?? [])].sort(byFirstSeen);

    // Anchor occupant: the session lead (the root) if seatable, else the earliest
    // member so a lead-winding-down pod still keeps its team clustered.
    const anchorAgent = seatableIds.has(root) ? root : members[0];
    let pool = members.filter((id) => id !== anchorAgent);
    if (pod.leadDeskUid && anchorAgent) {
      result[pod.leadDeskUid] = anchorAgent;
    } else if (anchorAgent) {
      pool = [anchorAgent, ...pool];
    }

    // Sticky pass: keep members who sat at this pod's member desks last poll.
    const freeMemberDesks = [...pod.memberDeskUids];
    const seated = new Set<string>();
    for (const deskUid of pod.memberDeskUids) {
      const prev = previousAssignment[deskUid];
      if (!prev || seated.has(prev) || !pool.includes(prev)) continue;
      result[deskUid] = prev;
      seated.add(prev);
      const idx = freeMemberDesks.indexOf(deskUid);
      if (idx >= 0) freeMemberDesks.splice(idx, 1);
    }

    // Fill pass: remaining members take remaining desks in first-seen order.
    for (const member of pool) {
      if (seated.has(member)) continue;
      const deskUid = freeMemberDesks.shift();
      if (!deskUid) break; // overflow member → roam near the pod
      result[deskUid] = member;
    }
  }

  return result;
};

export const shallowEqualStringRecord = (
  a: Record<string, string>,
  b: Record<string, string>,
): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

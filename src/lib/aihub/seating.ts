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
  // Shared focus keys: within a pod, members sharing a workflow (then a group) sit
  // adjacent, ahead of loose members. Both are optional/nullable — when absent the fill
  // falls back to first-seen order (the current live payload emits neither).
  workflow?: string | null;
  group?: string | null;
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

  // --- Focus clustering: workflow-mates together, then group-mates, then loose. Applied
  // only to the fill order of not-yet-seated members, so it refines adjacency WITHOUT
  // overriding sticky seats (stability wins over adjacency). ---
  const workflowByAgent = new Map<string, string | null>();
  const groupByAgent = new Map<string, string | null>();
  for (const agent of agents) {
    workflowByAgent.set(agent.agentId, agent.workflow ?? null);
    groupByAgent.set(agent.agentId, agent.group ?? null);
  }
  const orderByFocusThenFirstSeen = (ids: string[]): string[] => {
    // tier 0 = shares a workflow, 1 = shares a group, 2 = loose (own singleton).
    const tierOf = (id: string): 0 | 1 | 2 =>
      workflowByAgent.get(id) ? 0 : groupByAgent.get(id) ? 1 : 2;
    const clusterKeyOf = (id: string): string => {
      const workflow = workflowByAgent.get(id);
      if (workflow) return `w:${workflow}`;
      const group = groupByAgent.get(id);
      if (group) return `g:${group}`;
      return `x:${id}`;
    };
    const clusters = new Map<string, string[]>();
    for (const id of ids) {
      const key = clusterKeyOf(id);
      const bucket = clusters.get(key);
      if (bucket) bucket.push(id);
      else clusters.set(key, [id]);
    }
    return [...clusters.entries()]
      .map(([key, members]) => {
        const sorted = [...members].sort(byFirstSeen);
        return { key, sorted, tier: tierOf(sorted[0]), earliest: firstSeen(sorted[0]) };
      })
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          a.earliest - b.earliest ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      )
      .flatMap((cluster) => cluster.sorted);
  };

  // --- Multi-pod capacity. A session's PRIMARY pod seats its lead at the anchor and up
  // to 3 members; each ADDITIONAL adjacent pod adds seats at ALL of its desks (the extra
  // pod's lead desk holds a member, since the session lead stays on the primary anchor). ---
  const memberDeskCount = (podIndex: number) =>
    podDesks.get(podIndex)!.memberDeskUids.length;
  const totalDeskCount = (podIndex: number) => {
    const pod = podDesks.get(podIndex)!;
    return (pod.leadDeskUid ? 1 : 0) + pod.memberDeskUids.length;
  };
  const memberCountOf = (root: string) =>
    Math.max(0, (groupMembers.get(root)?.length ?? 0) - 1);
  const capacityOf = (podSet: number[]) => {
    if (podSet.length === 0) return 0;
    let capacity = memberDeskCount(podSet[0]);
    for (let i = 1; i < podSet.length; i += 1) capacity += totalDeskCount(podSet[i]);
    return capacity;
  };

  // --- Sticky pod ownership: which session held each pod last poll, and where each
  // session's lead sat (its primary pod) — so a session keeps its pods and its lead
  // never changes pod across polls. ---
  const prevOwnerByPod = new Map<number, string>();
  const prevPrimaryByRoot = new Map<string, number>();
  for (const podIndex of podOrder) {
    const pod = podDesks.get(podIndex)!;
    const desks = pod.leadDeskUid
      ? [pod.leadDeskUid, ...pod.memberDeskUids]
      : pod.memberDeskUids;
    for (const deskUid of desks) {
      const prev = previousAssignment[deskUid];
      if (!prev || !seatableIds.has(prev)) continue;
      const owner = rootOf(prev);
      if (!groupMembers.has(owner)) continue;
      if (!prevOwnerByPod.has(podIndex)) prevOwnerByPod.set(podIndex, owner);
      break;
    }
    const leadDesk = pod.leadDeskUid;
    if (!leadDesk) continue;
    const prevLead = previousAssignment[leadDesk];
    if (!prevLead || !seatableIds.has(prevLead)) continue;
    const leadOwner = rootOf(prevLead);
    if (groupMembers.has(leadOwner) && !prevPrimaryByRoot.has(leadOwner)) {
      prevPrimaryByRoot.set(leadOwner, podIndex);
    }
  }

  const rootsByFirstSeen = [...groupMembers.keys()].sort(byFirstSeen);
  const usedPods = new Set<number>();
  const podSetByRoot = new Map<string, number[]>();

  // Pass 1 — reclaim previously-owned pods (primary first) up to what the session needs,
  // so a shrinking session releases its excess pods and a growing one keeps its base.
  for (const root of rootsByFirstSeen) {
    const need = memberCountOf(root);
    const claimed: number[] = [];
    const prevPrimary = prevPrimaryByRoot.get(root);
    if (prevPrimary != null && !usedPods.has(prevPrimary)) {
      claimed.push(prevPrimary);
      usedPods.add(prevPrimary);
    }
    const prevExtras = podOrder.filter(
      (podIndex) => prevOwnerByPod.get(podIndex) === root && !usedPods.has(podIndex),
    );
    for (const podIndex of prevExtras) {
      if (claimed.length > 0 && capacityOf(claimed) >= need) break;
      claimed.push(podIndex);
      usedPods.add(podIndex);
    }
    if (claimed.length > 0) podSetByRoot.set(root, claimed);
  }

  // Pass 2 — every present session gets at least a primary pod (first-seen order); when
  // pods run out the remaining sessions roam.
  for (const root of rootsByFirstSeen) {
    if ((podSetByRoot.get(root)?.length ?? 0) > 0) continue;
    const free = podOrder.find((podIndex) => !usedPods.has(podIndex));
    if (free == null) continue; // overflow session → roam
    podSetByRoot.set(root, [free]);
    usedPods.add(free);
  }

  // Pass 3 — expand under-capacity sessions into the nearest free pod (adjacency by pod
  // index), round-robin by first-seen so a big session grows without starving others.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const root of rootsByFirstSeen) {
      const podSet = podSetByRoot.get(root);
      if (!podSet || podSet.length === 0) continue;
      if (capacityOf(podSet) >= memberCountOf(root)) continue;
      let best: number | null = null;
      let bestDist = Infinity;
      for (const podIndex of podOrder) {
        if (usedPods.has(podIndex)) continue;
        const dist = Math.min(...podSet.map((p) => Math.abs(p - podIndex)));
        if (dist < bestDist) {
          bestDist = dist;
          best = podIndex;
        }
      }
      if (best == null) continue;
      podSet.push(best);
      usedPods.add(best);
      expanded = true;
    }
  }

  // --- Seat each session across its pod set: lead at the primary anchor, members fill
  // the primary's member desks then every desk of the additional pods. ---
  for (const [root, podSet] of podSetByRoot) {
    if (podSet.length === 0) continue;
    const primaryPod = podDesks.get(podSet[0])!;
    const members = [...(groupMembers.get(root) ?? [])].sort(byFirstSeen);

    // Anchor occupant: the session lead (the root) if seatable, else the earliest member
    // so a lead-winding-down pod still keeps its team clustered.
    const anchorAgent = seatableIds.has(root) ? root : members[0];
    let pool = members.filter((id) => id !== anchorAgent);

    const memberDesks: string[] = [...primaryPod.memberDeskUids];
    if (primaryPod.leadDeskUid && anchorAgent) {
      result[primaryPod.leadDeskUid] = anchorAgent;
    } else if (anchorAgent) {
      pool = [anchorAgent, ...pool];
      if (primaryPod.leadDeskUid) memberDesks.unshift(primaryPod.leadDeskUid);
    }
    for (let i = 1; i < podSet.length; i += 1) {
      const extra = podDesks.get(podSet[i])!;
      if (extra.leadDeskUid) memberDesks.push(extra.leadDeskUid);
      memberDesks.push(...extra.memberDeskUids);
    }

    // Sticky pass: keep members at the exact desks they held last poll.
    const freeMemberDesks = [...memberDesks];
    const seated = new Set<string>();
    for (const deskUid of memberDesks) {
      const prev = previousAssignment[deskUid];
      if (!prev || seated.has(prev) || !pool.includes(prev)) continue;
      result[deskUid] = prev;
      seated.add(prev);
      const idx = freeMemberDesks.indexOf(deskUid);
      if (idx >= 0) freeMemberDesks.splice(idx, 1);
    }

    // Fill pass: remaining members take remaining desks, focus-clustered (workflow-mates,
    // then group-mates, then loose by first-seen) so shared-focus members land adjacent.
    for (const member of orderByFocusThenFirstSeen(pool)) {
      if (seated.has(member)) continue;
      const deskUid = freeMemberDesks.shift();
      if (!deskUid) break; // overflow beyond the session's pods → roam
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

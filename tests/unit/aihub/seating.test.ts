import { describe, expect, it } from "vitest";

import {
  AIHUB_POD_DESK_SLOTS,
} from "@/features/retro-office/core/furnitureDefaults";
import {
  computeAihubSeating,
  shallowEqualStringRecord,
  type PodDeskSlot,
  type SeatingAgentInput,
} from "@/lib/aihub/seating";
import type { HubNodeStatus } from "@/lib/runtime/aihub/types";

// A session lead (kind "session") folds its subagent subtree (kind "subagent", linked by
// parentAgentId) into one pod. Fixtures are plain objects so the allocator is exercised
// without any renderer/store.
const lead = (
  agentId: string,
  hubStatus: HubNodeStatus = "active",
): SeatingAgentInput => ({
  agentId,
  kind: "session",
  parentAgentId: null,
  hubStatus,
});

const sub = (
  agentId: string,
  parentAgentId: string,
  hubStatus: HubNodeStatus = "active",
  focus: { workflow?: string | null; group?: string | null } = {},
): SeatingAgentInput => ({
  agentId,
  kind: "subagent",
  parentAgentId,
  hubStatus,
  workflow: focus.workflow ?? null,
  group: focus.group ?? null,
});

// Build `podCount` pods, each a lead anchor + `membersPerPod` member desks, with uids
// `p<pod>-lead` / `p<pod>-m<n>` so assertions read clearly.
const makePods = (podCount: number, membersPerPod = 3): PodDeskSlot[] => {
  const slots: PodDeskSlot[] = [];
  for (let p = 0; p < podCount; p += 1) {
    slots.push({ deskUid: `p${p}-lead`, podIndex: p, seat: "lead" });
    for (let m = 1; m <= membersPerPod; m += 1) {
      slots.push({ deskUid: `p${p}-m${m}`, podIndex: p, seat: "member" });
    }
  }
  return slots;
};

const valuesOf = (assignment: Record<string, string>) =>
  new Set(Object.values(assignment));

describe("computeAihubSeating — correctness", () => {
  it("seats session leads at pod anchors in first-seen order", () => {
    const seating = computeAihubSeating(
      [lead("s2"), lead("s1")],
      makePods(3),
      { firstSeenByAgentId: { s1: 1, s2: 2 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(seating["p1-lead"]).toBe("s2");
  });

  it("seats a session's subagents at its own pod's member desks", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), sub("a2", "s1")],
      makePods(2),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(seating["p0-m1"]).toBe("a1");
    expect(seating["p0-m2"]).toBe("a2");
    // Nothing spilled into the second pod.
    expect(seating["p1-lead"]).toBeUndefined();
  });

  it("folds a nested subagent chain up to its session pod", () => {
    // s1 → a1 → a2 : all three belong to s1's pod.
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), sub("a2", "a1")],
      makePods(2),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(new Set([seating["p0-m1"], seating["p0-m2"]])).toEqual(
      new Set(["a1", "a2"]),
    );
  });

  it("keeps two sessions in two separate pods", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), lead("s2"), sub("b1", "s2")],
      makePods(4),
      { firstSeenByAgentId: { s1: 1, a1: 2, s2: 3, b1: 4 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(seating["p0-m1"]).toBe("a1");
    expect(seating["p1-lead"]).toBe("s2");
    expect(seating["p1-m1"]).toBe("b1");
  });

  it("roams overflow members when the session's pods are all full", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), sub("a2", "s1"), sub("a3", "s1"), sub("a4", "s1")],
      makePods(1), // only one pod (3 member desks) — nowhere to expand
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5 } },
    );
    // Lead + exactly 3 members seated; the 4th (latest) roams.
    expect(Object.keys(seating)).toHaveLength(4);
    expect(valuesOf(seating).has("a4")).toBe(false);
  });

  it("roams overflow sessions beyond the available pods (no pod)", () => {
    const seating = computeAihubSeating(
      [lead("s1"), lead("s2"), lead("s3")],
      makePods(2), // only two pods
      { firstSeenByAgentId: { s1: 1, s2: 2, s3: 3 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(seating["p1-lead"]).toBe("s2");
    // s3 got no pod — it is absent from every desk.
    expect(valuesOf(seating).has("s3")).toBe(false);
  });

  it("releases desks held by done agents", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1", "done"), sub("a2", "s1")],
      makePods(2),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 } },
    );
    expect(seating["p0-lead"]).toBe("s1");
    expect(valuesOf(seating).has("a1")).toBe(false); // done → released
    expect(valuesOf(seating).has("a2")).toBe(true);
  });

  it("promotes a surviving subagent to the anchor when its lead is done", () => {
    const seating = computeAihubSeating(
      [lead("s1", "done"), sub("a1", "s1"), sub("a2", "s1")],
      makePods(2),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 } },
    );
    // s1 released; the earliest-seen surviving member takes the anchor, team stays in pod 0.
    expect(seating["p0-lead"]).toBe("a1");
    expect(seating["p0-m1"]).toBe("a2");
    expect(valuesOf(seating).has("s1")).toBe(false);
  });
});

describe("computeAihubSeating — stability", () => {
  const roster: SeatingAgentInput[] = [
    lead("s1"),
    sub("a1", "s1"),
    sub("a2", "s1"),
    lead("s2"),
    sub("b1", "s2"),
  ];
  const firstSeenByAgentId = { s1: 1, a1: 2, a2: 3, s2: 4, b1: 5 };

  it("is deterministic: same roster in, same seating out (no previous)", () => {
    const once = computeAihubSeating(roster, makePods(4), { firstSeenByAgentId });
    const twice = computeAihubSeating(roster, makePods(4), { firstSeenByAgentId });
    expect(twice).toEqual(once);
  });

  it("is a fixed point when the previous assignment is fed back", () => {
    const first = computeAihubSeating(roster, makePods(4), { firstSeenByAgentId });
    const second = computeAihubSeating(roster, makePods(4), {
      firstSeenByAgentId,
      previousAssignment: first,
    });
    expect(second).toEqual(first);
    expect(shallowEqualStringRecord(second, first)).toBe(true);
  });

  it("does not renumber existing leads when a new session appears", () => {
    const pods = makePods(4);
    const before = computeAihubSeating([lead("s1")], pods, {
      firstSeenByAgentId: { s1: 1 },
    });
    const after = computeAihubSeating([lead("s1"), lead("s2")], pods, {
      firstSeenByAgentId: { s1: 1, s2: 2 },
      previousAssignment: before,
    });
    expect(after["p0-lead"]).toBe("s1"); // unchanged
    expect(after["p1-lead"]).toBe("s2"); // new session takes a free pod
  });

  it("keeps a lead in its pod after an earlier-pod session leaves", () => {
    const pods = makePods(4);
    const before = computeAihubSeating([lead("s1"), lead("s2")], pods, {
      firstSeenByAgentId: { s1: 1, s2: 2 },
    });
    expect(before["p0-lead"]).toBe("s1");
    expect(before["p1-lead"]).toBe("s2");
    // s1 leaves the roster entirely; s2 must NOT slide down into pod 0.
    const after = computeAihubSeating([lead("s2")], pods, {
      firstSeenByAgentId: { s1: 1, s2: 2 },
      previousAssignment: before,
    });
    expect(after["p1-lead"]).toBe("s2");
    expect(after["p0-lead"]).toBeUndefined();
  });

  it("keeps existing members at their desks when a new member spawns", () => {
    const pods = makePods(2);
    const before = computeAihubSeating([lead("s1"), sub("a1", "s1")], pods, {
      firstSeenByAgentId: { s1: 1, a1: 2 },
    });
    expect(before["p0-m1"]).toBe("a1");
    const after = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), sub("a2", "s1")],
      pods,
      {
        firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 },
        previousAssignment: before,
      },
    );
    expect(after["p0-lead"]).toBe("s1");
    expect(after["p0-m1"]).toBe("a1"); // existing member unmoved
    expect(after["p0-m2"]).toBe("a2"); // new member fills the next free desk
  });
});

describe("computeAihubSeating — multi-pod claiming", () => {
  const subs = (parent: string, ...ids: string[]) =>
    ids.map((id) => sub(id, parent));

  it("claims a second pod when a session has more than 3 members", () => {
    const seating = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4")],
      makePods(3),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5 } },
    );
    // Primary pod holds lead + 3; the 4th member spills into the adjacent pod.
    expect(seating["p0-lead"]).toBe("s1");
    expect(seating["p0-m1"]).toBe("a1");
    expect(seating["p0-m2"]).toBe("a2");
    expect(seating["p0-m3"]).toBe("a3");
    expect(seating["p1-lead"]).toBe("a4");
    expect(new Set(Object.values(seating)).size).toBe(5); // all seated, none roam
  });

  it("fills every desk of the additional pod before roaming", () => {
    const seating = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4", "a5", "a6", "a7")],
      makePods(3),
      {
        firstSeenByAgentId: {
          s1: 1, a1: 2, a2: 3, a3: 4, a4: 5, a5: 6, a6: 7, a7: 8,
        },
      },
    );
    // 7 members: 3 in the primary, 4 across all desks of the second pod.
    expect(seating["p1-lead"]).toBe("a4");
    expect(seating["p1-m1"]).toBe("a5");
    expect(seating["p1-m2"]).toBe("a6");
    expect(seating["p1-m3"]).toBe("a7");
    expect(new Set(Object.values(seating)).size).toBe(8);
  });

  it("does not renumber the lead or existing members when expanding to a new pod", () => {
    const pods = makePods(3);
    const before = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3")],
      pods,
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 } },
    );
    expect(before["p0-m3"]).toBe("a3");
    const after = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4")],
      pods,
      {
        firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5 },
        previousAssignment: before,
      },
    );
    // Lead + first three members are untouched; only the new member takes the new pod.
    expect(after["p0-lead"]).toBe("s1");
    expect(after["p0-m1"]).toBe("a1");
    expect(after["p0-m2"]).toBe("a2");
    expect(after["p0-m3"]).toBe("a3");
    expect(after["p1-lead"]).toBe("a4");
  });

  it("is a fixed point for a multi-pod session when previous is fed back", () => {
    const pods = makePods(3);
    const firstSeenByAgentId = {
      s1: 1, a1: 2, a2: 3, a3: 4, a4: 5, a5: 6,
    };
    const roster = [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4", "a5")];
    const first = computeAihubSeating(roster, pods, { firstSeenByAgentId });
    const second = computeAihubSeating(roster, pods, {
      firstSeenByAgentId,
      previousAssignment: first,
    });
    expect(second).toEqual(first);
  });

  it("gives every concurrent session a primary pod before a big one expands", () => {
    const seating = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4"), lead("s2")],
      makePods(4),
      {
        firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5, s2: 6 },
      },
    );
    // s1 (5-member team) keeps its primary; s2 still gets its own pod; s1 expands into a
    // free pod for the overflow member — nobody roams.
    expect(seating["p0-lead"]).toBe("s1");
    expect(Object.values(seating)).toContain("s2");
    expect(new Set(Object.values(seating)).size).toBe(6); // s1, s2, a1..a4
  });

  it("releases an extra pod when a session shrinks, freeing it for others", () => {
    const pods = makePods(3);
    const before = computeAihubSeating(
      [lead("s1"), ...subs("s1", "a1", "a2", "a3", "a4")],
      pods,
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5 } },
    );
    expect(before["p1-lead"]).toBe("a4"); // s1 held a second pod
    // a3/a4 finish; a new session s2 appears and should be able to take the freed pod.
    const after = computeAihubSeating(
      [
        lead("s1"),
        sub("a1", "s1"),
        sub("a2", "s1"),
        sub("a3", "s1", "done"),
        sub("a4", "s1", "done"),
        lead("s2"),
      ],
      pods,
      {
        firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4, a4: 5, s2: 6 },
        previousAssignment: before,
      },
    );
    // s1 shrank to 2 members (needs 1 pod); the freed pod lets s2 seat rather than roam.
    expect(Object.values(after)).toContain("s2");
    expect(valuesOf(after).has("a3")).toBe(false); // done → released
    expect(valuesOf(after).has("a4")).toBe(false);
  });
});

describe("computeAihubSeating — focus clustering", () => {
  it("seats workflow-mates in adjacent desks ahead of loose members", () => {
    // a1 is earliest-seen but loose; a2+a3 share a workflow → they take the first desks.
    const seating = computeAihubSeating(
      [
        lead("s1"),
        sub("a1", "s1", "active"),
        sub("a2", "s1", "active", { workflow: "wf-1" }),
        sub("a3", "s1", "active", { workflow: "wf-1" }),
      ],
      makePods(1),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 } },
    );
    expect(seating["p0-m1"]).toBe("a2");
    expect(seating["p0-m2"]).toBe("a3");
    expect(seating["p0-m3"]).toBe("a1");
  });

  it("clusters group-mates when no workflow is present", () => {
    const seating = computeAihubSeating(
      [
        lead("s1"),
        sub("a1", "s1", "active"),
        sub("a2", "s1", "active", { group: "g-1" }),
        sub("a3", "s1", "active", { group: "g-1" }),
      ],
      makePods(1),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 } },
    );
    expect(seating["p0-m1"]).toBe("a2");
    expect(seating["p0-m2"]).toBe("a3");
    expect(seating["p0-m3"]).toBe("a1");
  });

  it("prioritizes workflow over group over first-seen", () => {
    const seating = computeAihubSeating(
      [
        lead("s1"),
        sub("a1", "s1", "active", { group: "g-1" }),
        sub("a2", "s1", "active", { workflow: "wf-1" }),
        sub("a3", "s1", "active", { workflow: "wf-1" }),
      ],
      makePods(1),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 } },
    );
    // workflow cluster (a2,a3) first, then the group member (a1).
    expect(seating["p0-m1"]).toBe("a2");
    expect(seating["p0-m2"]).toBe("a3");
    expect(seating["p0-m3"]).toBe("a1");
  });

  it("lets stability win over adjacency (sticky seats are not reshuffled)", () => {
    const pods = makePods(1);
    const before = computeAihubSeating([lead("s1"), sub("a1", "s1")], pods, {
      firstSeenByAgentId: { s1: 1, a1: 2 },
    });
    expect(before["p0-m1"]).toBe("a1"); // loose member seated first
    const after = computeAihubSeating(
      [
        lead("s1"),
        sub("a1", "s1"),
        sub("a2", "s1", "active", { workflow: "wf-1" }),
        sub("a3", "s1", "active", { workflow: "wf-1" }),
      ],
      pods,
      {
        firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 },
        previousAssignment: before,
      },
    );
    // a1 keeps its desk despite the workflow pair arriving; the pair fills the rest.
    expect(after["p0-m1"]).toBe("a1");
    expect(after["p0-m2"]).toBe("a2");
    expect(after["p0-m3"]).toBe("a3");
  });

  it("falls back to first-seen when no focus fields are present (today's payload)", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a2", "s1"), sub("a1", "s1")],
      makePods(1),
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3 } },
    );
    expect(seating["p0-m1"]).toBe("a1"); // earliest first-seen
    expect(seating["p0-m2"]).toBe("a2");
  });
});

describe("computeAihubSeating — real aihub pod layout", () => {
  it("exposes 6 pods of 4 desks (1 lead + 3 members each)", () => {
    const leads = AIHUB_POD_DESK_SLOTS.filter((slot) => slot.seat === "lead");
    const members = AIHUB_POD_DESK_SLOTS.filter((slot) => slot.seat === "member");
    expect(leads).toHaveLength(6);
    expect(members).toHaveLength(18);
    // Exactly one lead per pod.
    expect(new Set(leads.map((slot) => slot.podIndex)).size).toBe(6);
  });

  it("seats a live session + 3 subagents onto one real pod", () => {
    const seating = computeAihubSeating(
      [lead("s1"), sub("a1", "s1"), sub("a2", "s1"), sub("a3", "s1")],
      AIHUB_POD_DESK_SLOTS,
      { firstSeenByAgentId: { s1: 1, a1: 2, a2: 3, a3: 4 } },
    );
    const firstPod = AIHUB_POD_DESK_SLOTS.filter((slot) => slot.podIndex === 0);
    const leadUid = firstPod.find((slot) => slot.seat === "lead")!.deskUid;
    const memberUids = firstPod
      .filter((slot) => slot.seat === "member")
      .map((slot) => slot.deskUid);
    expect(seating[leadUid]).toBe("s1");
    expect(memberUids.map((uid) => seating[uid])).toEqual(["a1", "a2", "a3"]);
  });
});

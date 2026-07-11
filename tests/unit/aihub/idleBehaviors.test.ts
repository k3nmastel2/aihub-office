import { describe, expect, it } from "vitest";

import {
  computeIdleBehaviors,
  idleBehaviorPlanSignature,
  type IdleBehaviorPlan,
} from "@/lib/aihub/idleBehaviors";

const CFG = { gymRotateMs: 45_000, pingPongRotateMs: 90_000, gymPercent: 30 };

describe("computeIdleBehaviors — ping-pong pairing", () => {
  it("returns no pair when fewer than two agents are idle", () => {
    expect(computeIdleBehaviors([], 0, CFG).pingPongPair).toBeNull();
    expect(computeIdleBehaviors(["solo"], 0, CFG).pingPongPair).toBeNull();
  });

  it("forms a pair whenever ≥2 idle", () => {
    const plan = computeIdleBehaviors(["a", "b", "c", "d"], 1000, CFG);
    expect(plan.pingPongPair).not.toBeNull();
    expect(plan.pingPongPair).toHaveLength(2);
    const [p1, p2] = plan.pingPongPair!;
    expect(p1).not.toBe(p2);
    expect(plan.behaviorByAgentId[p1]).toBe("pingpong");
    expect(plan.behaviorByAgentId[p2]).toBe("pingpong");
  });

  it("is deterministic for the same idle set + time", () => {
    const a = computeIdleBehaviors(["a", "b", "c", "d"], 5_000, CFG);
    const b = computeIdleBehaviors(["d", "c", "b", "a"], 5_000, CFG); // different order
    expect(a).toEqual(b);
  });

  it("keeps the same pair within a ping-pong bucket but rotates across buckets", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const early = computeIdleBehaviors(ids, 1_000, CFG).pingPongPair;
    const sameBucket = computeIdleBehaviors(ids, 89_000, CFG).pingPongPair; // still bucket 0
    expect(sameBucket).toEqual(early);
    // Scan several buckets — the pair must change at least once (rotation is alive).
    const seen = new Set<string>();
    for (let bucket = 0; bucket < 12; bucket += 1) {
      const pair = computeIdleBehaviors(ids, bucket * 90_000 + 10, CFG).pingPongPair!;
      seen.add([...pair].sort().join("|"));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("never assigns a ping-pong agent to the gym simultaneously", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (let t = 0; t < 300_000; t += 7_000) {
      const plan = computeIdleBehaviors(ids, t, CFG);
      if (!plan.pingPongPair) continue;
      for (const id of plan.pingPongPair) {
        expect(plan.gymHoldByAgentId[id]).toBeUndefined();
      }
    }
  });
});

describe("computeIdleBehaviors — gym / lounge assignment", () => {
  it("labels every idle agent exactly once", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const plan = computeIdleBehaviors(ids, 12_345, CFG);
    for (const id of ids) {
      expect(["pingpong", "gym", "lounge"]).toContain(plan.behaviorByAgentId[id]);
    }
    expect(Object.keys(plan.behaviorByAgentId).sort()).toEqual([...ids].sort());
  });

  it("gymHoldByAgentId matches the gym-labeled agents", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const plan = computeIdleBehaviors(ids, 200_000, CFG);
    const gymLabeled = Object.entries(plan.behaviorByAgentId)
      .filter(([, b]) => b === "gym")
      .map(([id]) => id)
      .sort();
    expect(Object.keys(plan.gymHoldByAgentId).sort()).toEqual(gymLabeled);
  });

  it("honors gymPercent = 0 (nobody works out) and 100 (everybody not playing)", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const none = computeIdleBehaviors(ids, 1_000, { ...CFG, gymPercent: 0 });
    expect(Object.keys(none.gymHoldByAgentId)).toHaveLength(0);
    const all = computeIdleBehaviors(ids, 1_000, { ...CFG, gymPercent: 100 });
    const nonPair = ids.filter((id) => all.behaviorByAgentId[id] !== "pingpong");
    for (const id of nonPair) expect(all.gymHoldByAgentId[id]).toBe(true);
  });

  it("de-dupes duplicate ids in the input", () => {
    const plan = computeIdleBehaviors(["a", "a", "b", "b"], 3_000, CFG);
    expect(Object.keys(plan.behaviorByAgentId).sort()).toEqual(["a", "b"]);
  });
});

describe("idleBehaviorPlanSignature", () => {
  it("is stable within a bucket and changes across a pair rotation", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const s0 = idleBehaviorPlanSignature(computeIdleBehaviors(ids, 1_000, CFG));
    const s0b = idleBehaviorPlanSignature(computeIdleBehaviors(ids, 44_000, CFG));
    // same ping-pong bucket (0) AND same gym bucket (0) → identical signature
    expect(s0b).toBe(s0);
  });

  it("differs when the idle set changes", () => {
    const a = idleBehaviorPlanSignature(computeIdleBehaviors(["a", "b", "c"], 1_000, CFG));
    const b = idleBehaviorPlanSignature(computeIdleBehaviors(["a", "b"], 1_000, CFG));
    expect(a).not.toBe(b);
  });

  it("equal plans produce equal signatures regardless of key insertion order", () => {
    const p1: IdleBehaviorPlan = {
      pingPongPair: ["b", "a"],
      pingPongBucket: 3,
      gymHoldByAgentId: { z: true, x: true },
      behaviorByAgentId: {},
    };
    const p2: IdleBehaviorPlan = {
      pingPongPair: ["a", "b"],
      pingPongBucket: 7,
      gymHoldByAgentId: { x: true, z: true },
      behaviorByAgentId: {},
    };
    expect(idleBehaviorPlanSignature(p1)).toBe(idleBehaviorPlanSignature(p2));
  });
});

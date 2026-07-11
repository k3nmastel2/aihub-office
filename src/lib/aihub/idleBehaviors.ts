// Honest idle behaviors for aihub agents (Phase 7b).
//
// Idle agents should look ALIVE and off-duty — playing ping-pong, working out — not roaming
// aimlessly. This is a PURE, deterministic scheduler: given the set of currently-idle agents
// and the clock, it decides who is doing what, rotating behaviors over time buckets so the
// floor looks lively without frame-to-frame jitter. Same (idle set, time) → same plan.
//
// It drives ONLY the office's EXISTING hold/route systems — no new navigation:
//   • ping-pong  → the existing pairing system (claw3d assigns pingPong* fields to 2 idle
//                  agents; here we pick the pair, the renderer starts the session).
//   • gym        → the existing `gymHoldByAgentId` → gym route + workout animation.
//   • lounge     → left to the existing idle roam, which already drifts toward the lounge
//                  couches / social furniture (the honest "hanging out" behavior).
//
// Only ONE ping-pong table exists, so at most one pair is active. Gym has multiple stations,
// so any number of idle agents can work out. The pair rotates on a slower bucket than the
// gym/lounge rotation so a pair plays a full session (60s) with a short rest before the next
// pair, and a ping-pong agent is never simultaneously pulled to the gym.

export type IdleBehavior = "pingpong" | "gym" | "lounge";

export type IdleBehaviorPlan = {
  // The two idle agents currently playing ping-pong (deterministically chosen + rotated), or
  // null when fewer than two agents are idle.
  pingPongPair: readonly [string, string] | null;
  // The ping-pong rotation bucket index. Lets the renderer re-arm a rally each bucket even when
  // the same two agents stay paired (their previous rally has expired by then).
  pingPongBucket: number;
  // Idle agents assigned a gym workout this bucket (feeds the existing gym hold map).
  gymHoldByAgentId: Readonly<Record<string, true>>;
  // Full labeling of every idle agent — for tests, introspection, and future wiring.
  behaviorByAgentId: Readonly<Record<string, IdleBehavior>>;
};

export type IdleBehaviorConfig = {
  // How often the gym/lounge assignment rotates (ms).
  gymRotateMs?: number;
  // How often the ping-pong pair rotates (ms). Should exceed the ping-pong session length so
  // pairs don't overlap at the single table.
  pingPongRotateMs?: number;
  // Percentage (0-100) of non-ping-pong idle agents sent to the gym each bucket.
  gymPercent?: number;
};

const DEFAULT_GYM_ROTATE_MS = 45_000;
const DEFAULT_PINGPONG_ROTATE_MS = 90_000;
const DEFAULT_GYM_PERCENT = 30;

export const EMPTY_IDLE_BEHAVIOR_PLAN: IdleBehaviorPlan = {
  pingPongPair: null,
  pingPongBucket: 0,
  gymHoldByAgentId: {},
  behaviorByAgentId: {},
};

// FNV-1a — small, stable, non-cryptographic string hash (matches the avatar-profile seed hash).
const hashStr = (str: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const computeIdleBehaviors = (
  idleAgentIds: readonly string[],
  nowMs: number,
  config: IdleBehaviorConfig = {},
): IdleBehaviorPlan => {
  const gymRotateMs = config.gymRotateMs ?? DEFAULT_GYM_ROTATE_MS;
  const pingPongRotateMs = config.pingPongRotateMs ?? DEFAULT_PINGPONG_ROTATE_MS;
  const gymPercent = config.gymPercent ?? DEFAULT_GYM_PERCENT;

  // De-dupe + sort for determinism regardless of roster ordering.
  const ids = [...new Set(idleAgentIds)].sort();
  const ppBucket = Math.floor(nowMs / pingPongRotateMs);
  if (ids.length === 0) return { ...EMPTY_IDLE_BEHAVIOR_PLAN, pingPongBucket: ppBucket };

  const gymBucket = Math.floor(nowMs / gymRotateMs);

  // Ping-pong: whenever ≥2 idle, deterministically pick the two agents ranked first by a
  // bucket-salted hash → the pair rotates each ping-pong bucket.
  let pingPongPair: readonly [string, string] | null = null;
  const pairSet = new Set<string>();
  if (ids.length >= 2) {
    const ranked = [...ids].sort((a, b) => {
      const ha = hashStr(`${a}:pp:${ppBucket}`);
      const hb = hashStr(`${b}:pp:${ppBucket}`);
      if (ha !== hb) return ha - hb;
      return a < b ? -1 : 1;
    });
    pingPongPair = [ranked[0], ranked[1]] as const;
    pairSet.add(ranked[0]);
    pairSet.add(ranked[1]);
  }

  // Gym / lounge for everyone not at the table.
  const gymHoldByAgentId: Record<string, true> = {};
  const behaviorByAgentId: Record<string, IdleBehavior> = {};
  for (const id of ids) {
    if (pairSet.has(id)) {
      behaviorByAgentId[id] = "pingpong";
      continue;
    }
    const goesToGym = hashStr(`${id}:gym:${gymBucket}`) % 100 < gymPercent;
    if (goesToGym) {
      gymHoldByAgentId[id] = true;
      behaviorByAgentId[id] = "gym";
    } else {
      behaviorByAgentId[id] = "lounge";
    }
  }

  return { pingPongPair, pingPongBucket: ppBucket, gymHoldByAgentId, behaviorByAgentId };
};

// Order-independent structural signature so the caller can hold a stable reference across polls
// (the plan only changes across buckets / when the idle set changes). Keeps the office's
// hold-map + ping-pong props identity-stable → no churn within a bucket.
export const idleBehaviorPlanSignature = (plan: IdleBehaviorPlan): string => {
  const pair = plan.pingPongPair ? [...plan.pingPongPair].sort().join("|") : "-";
  const gym = Object.keys(plan.gymHoldByAgentId).sort().join(",");
  return `${pair}::${gym}`;
};

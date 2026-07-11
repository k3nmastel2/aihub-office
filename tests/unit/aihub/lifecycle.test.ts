import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLASH_LIFETIME_MS,
  DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS,
  SESSION_LEAVE_CUE_PREFIX,
  buildSessionGroups,
  resolveLeavingPlan,
  resolveSessionLeaveCues,
  shallowEqualBooleanRecord,
  type LeavingAgentInput,
  type SessionGroupSnapshot,
} from "@/lib/aihub/lifecycle";
import type { HubNodeStatus } from "@/lib/runtime/aihub/types";

const NOW = 1_000_000;

const agent = (
  agentId: string,
  hubStatus: HubNodeStatus | null,
): LeavingAgentInput => ({ agentId, hubStatus });

describe("resolveLeavingPlan", () => {
  it("only considers done agents; active/idle/winding are never leaving", () => {
    const plan = resolveLeavingPlan({
      agents: [
        agent("a", "active"),
        agent("b", "idle"),
        agent("c", "winding"),
        agent("d", null),
      ],
      firstSeenByAgentId: { a: 0, b: 0, c: 0, d: 0 },
      now: NOW,
    });
    expect(plan.walkOutByAgentId).toEqual({});
    expect(plan.fadeInPlaceByAgentId).toEqual({});
  });

  it("walks out a done agent that has lived past the flash window", () => {
    const plan = resolveLeavingPlan({
      agents: [agent("a", "done")],
      firstSeenByAgentId: { a: NOW - 60_000 },
      now: NOW,
    });
    expect(plan.walkOutByAgentId).toEqual({ a: true });
    expect(plan.fadeInPlaceByAgentId).toEqual({});
  });

  it("fades a flash agent (lived < 5s) in place instead of walking it out", () => {
    const plan = resolveLeavingPlan({
      agents: [agent("flash", "done")],
      firstSeenByAgentId: { flash: NOW - 2_000 },
      now: NOW,
    });
    expect(plan.fadeInPlaceByAgentId).toEqual({ flash: true });
    expect(plan.walkOutByAgentId).toEqual({});
  });

  it("treats the flash boundary as exclusive (exactly 5s walks out)", () => {
    const plan = resolveLeavingPlan({
      agents: [agent("edge", "done")],
      firstSeenByAgentId: { edge: NOW - DEFAULT_FLASH_LIFETIME_MS },
      now: NOW,
    });
    expect(plan.walkOutByAgentId).toEqual({ edge: true });
  });

  it("treats a missing first-seen as just-arrived (fades in place, never walks)", () => {
    const plan = resolveLeavingPlan({
      agents: [agent("ghost", "done")],
      firstSeenByAgentId: {},
      now: NOW,
    });
    expect(plan.fadeInPlaceByAgentId).toEqual({ ghost: true });
    expect(plan.walkOutByAgentId).toEqual({});
  });

  it("caps simultaneous walk-outs and queues the rest (oldest-arrived win slots)", () => {
    const agents = ["a", "b", "c", "d", "e", "f"].map((id) => agent(id, "done"));
    // firstSeen ascending by letter so ordering is unambiguous; all past the flash window.
    const firstSeenByAgentId = {
      a: NOW - 60_000,
      b: NOW - 50_000,
      c: NOW - 40_000,
      d: NOW - 30_000,
      e: NOW - 20_000,
      f: NOW - 10_000,
    };
    const plan = resolveLeavingPlan({ agents, firstSeenByAgentId, now: NOW });
    expect(Object.keys(plan.walkOutByAgentId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(Object.keys(plan.walkOutByAgentId)).toHaveLength(
      DEFAULT_MAX_SIMULTANEOUS_WALK_OUTS,
    );
    // e and f are queued — in neither map.
    expect(plan.walkOutByAgentId.e).toBeUndefined();
    expect(plan.fadeInPlaceByAgentId.e).toBeUndefined();
  });

  it("keeps slot assignment stable when a newer agent also goes done", () => {
    const base = {
      agents: [agent("old", "done"), agent("mid", "done"), agent("new", "done")],
      firstSeenByAgentId: { old: NOW - 60_000, mid: NOW - 40_000, new: NOW - 20_000 },
      now: NOW,
      maxSimultaneousWalkOuts: 2,
    };
    const plan = resolveLeavingPlan(base);
    // Oldest two hold the slots; the newest is queued.
    expect(plan.walkOutByAgentId).toEqual({ old: true, mid: true });
    expect(plan.walkOutByAgentId.new).toBeUndefined();
  });

  it("respects an explicit maxSimultaneousWalkOuts override", () => {
    const agents = ["a", "b", "c"].map((id) => agent(id, "done"));
    const plan = resolveLeavingPlan({
      agents,
      firstSeenByAgentId: { a: 0, b: 0, c: 0 },
      now: NOW,
      maxSimultaneousWalkOuts: 1,
    });
    expect(Object.keys(plan.walkOutByAgentId)).toHaveLength(1);
  });
});

describe("buildSessionGroups", () => {
  it("folds a session node and its subagent subtree into one group keyed by the root", () => {
    const groups = buildSessionGroups([
      { agentId: "claude-1", name: "Claude", parentAgentId: null },
      { agentId: "claude-1-sub-a", name: "explore", parentAgentId: "claude-1" },
      { agentId: "claude-1-sub-b", name: "build", parentAgentId: "claude-1" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "claude-1",
      agentId: "claude-1",
      agentName: "Claude",
    });
  });

  it("folds nested (grand-child) subagents up to the root session", () => {
    const groups = buildSessionGroups([
      { agentId: "root", name: "Root", parentAgentId: null },
      { agentId: "child", name: "Child", parentAgentId: "root" },
      { agentId: "grandchild", name: "Grandchild", parentAgentId: "child" },
    ]);
    expect(groups.map((group) => group.key)).toEqual(["root"]);
  });

  it("keeps distinct session trees in separate groups", () => {
    const groups = buildSessionGroups([
      { agentId: "claude-1", name: "Claude", parentAgentId: null },
      { agentId: "claude-1-sub", name: "sub", parentAgentId: "claude-1" },
      { agentId: "hermes", name: "Hermes", parentAgentId: null },
    ]);
    expect(groups.map((group) => group.key).sort()).toEqual(["claude-1", "hermes"]);
  });

  it("treats a parent outside the roster as a root (orphaned subagent)", () => {
    const groups = buildSessionGroups([
      { agentId: "orphan", name: "Orphan", parentAgentId: "gone-session" },
    ]);
    expect(groups).toEqual([
      { key: "orphan", agentId: "orphan", agentName: "Orphan" },
    ]);
  });
});

describe("resolveSessionLeaveCues", () => {
  const session = (
    key: string,
    agentId = key,
    agentName = key,
  ): SessionGroupSnapshot => ({ key, agentId, agentName });

  it("emits one cue when a session fully leaves the roster", () => {
    const result = resolveSessionLeaveCues({
      previousSessions: [session("sess-1", "claude-1", "Claude")],
      currentSessions: [],
      emittedKeys: [],
      now: NOW,
    });
    expect(result.cues).toHaveLength(1);
    expect(result.cues[0]).toMatchObject({
      id: `${SESSION_LEAVE_CUE_PREFIX}sess-1`,
      agentId: "claude-1",
      agentName: "Claude",
      ts: NOW,
    });
    expect(result.emittedKeys).toContain("sess-1");
  });

  it("does not emit while any member of the session is still present", () => {
    const result = resolveSessionLeaveCues({
      previousSessions: [session("sess-1")],
      currentSessions: [session("sess-1")],
      emittedKeys: [],
      now: NOW,
    });
    expect(result.cues).toEqual([]);
  });

  it("dedupes a single session end to one cue across polls", () => {
    const first = resolveSessionLeaveCues({
      previousSessions: [session("sess-1")],
      currentSessions: [],
      emittedKeys: [],
      now: NOW,
    });
    // Next poll: still gone, still remembered — no second cue.
    const second = resolveSessionLeaveCues({
      previousSessions: [session("sess-1")],
      currentSessions: [],
      emittedKeys: first.emittedKeys,
      now: NOW + 3_000,
    });
    expect(first.cues).toHaveLength(1);
    expect(second.cues).toEqual([]);
  });

  it("uses a stable cue id per session so the renderer can dedup too", () => {
    const result = resolveSessionLeaveCues({
      previousSessions: [session("sess-42")],
      currentSessions: [],
      emittedKeys: [],
      now: NOW,
    });
    expect(result.cues[0]!.id).toBe(`${SESSION_LEAVE_CUE_PREFIX}sess-42`);
  });

  it("emits a cue per session when several leave at once", () => {
    const result = resolveSessionLeaveCues({
      previousSessions: [session("sess-1"), session("sess-2")],
      currentSessions: [],
      emittedKeys: [],
      now: NOW,
    });
    expect(result.cues.map((cue) => cue.id).sort()).toEqual([
      `${SESSION_LEAVE_CUE_PREFIX}sess-1`,
      `${SESSION_LEAVE_CUE_PREFIX}sess-2`,
    ]);
  });
});

describe("shallowEqualBooleanRecord", () => {
  it("is true for records with identical keys and values", () => {
    expect(shallowEqualBooleanRecord({ a: true, b: false }, { a: true, b: false })).toBe(
      true,
    );
  });

  it("is false when a value flips", () => {
    expect(shallowEqualBooleanRecord({ a: true }, { a: false })).toBe(false);
  });

  it("is false when key sets differ", () => {
    expect(shallowEqualBooleanRecord({ a: true }, { a: true, b: true })).toBe(false);
    expect(shallowEqualBooleanRecord({ a: true, b: true }, { a: true })).toBe(false);
  });

  it("is true for two empty records", () => {
    expect(shallowEqualBooleanRecord({}, {})).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  DESK_STACK_CAP,
  computeDeskStackCount,
  computeNameplateChips,
  resolveAgentBadge,
} from "@/lib/aihub/badges";
import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";

const hub = (over: Partial<AgentHubMetadata>): AgentHubMetadata => ({
  parentAgentId: null,
  tier: 0,
  group: null,
  workflow: null,
  kind: "session",
  tool: "claude",
  hubStatus: "active",
  badge: null,
  detail: null,
  project: null,
  currentTool: null,
  taskCounts: null,
  taskItems: null,
  bgTasks: null,
  canNudge: false,
  hubSessionId: null,
  task: null,
  activity: [],
  activityS: 0,
  ...over,
});

describe("computeNameplateChips", () => {
  it("shows remaining/total task chip (pending + in_progress over total)", () => {
    const chips = computeNameplateChips(
      hub({ taskCounts: { pending: 7, inProgress: 1, completed: 2 } }),
    );
    expect(chips.task).toBe("8/10");
  });

  it("hides the task chip when there are no tasks", () => {
    expect(
      computeNameplateChips(hub({ taskCounts: { pending: 0, inProgress: 0, completed: 0 } }))
        .task,
    ).toBeNull();
    expect(computeNameplateChips(hub({ taskCounts: null })).task).toBeNull();
    expect(computeNameplateChips(null).task).toBeNull();
  });

  it("shows the bg chip only when a background task is running", () => {
    expect(computeNameplateChips(hub({ bgTasks: { count: 3, running: 2 } })).bg).toBe("2");
    expect(computeNameplateChips(hub({ bgTasks: { count: 3, running: 0 } })).bg).toBeNull();
    expect(computeNameplateChips(hub({ bgTasks: null })).bg).toBeNull();
  });

  it("all-completed tasks still show a chip (0/total) but no bg chip", () => {
    const chips = computeNameplateChips(
      hub({ taskCounts: { pending: 0, inProgress: 0, completed: 4 } }),
    );
    expect(chips.task).toBe("0/4");
    expect(chips.bg).toBeNull();
  });
});

describe("resolveAgentBadge", () => {
  it("returns a blocked badge with the detail string when hub is blocked", () => {
    const badge = resolveAgentBadge(hub({ badge: "blocked", detail: "rate limited until 3pm" }));
    expect(badge.badge).toBe("blocked");
    expect(badge.detail).toBe("rate limited until 3pm");
  });

  it("blocked with empty detail yields null detail", () => {
    expect(resolveAgentBadge(hub({ badge: "blocked", detail: "  " })).detail).toBeNull();
  });

  it("returns no badge when not blocked", () => {
    expect(resolveAgentBadge(hub({ badge: null })).badge).toBeNull();
    expect(resolveAgentBadge(null).badge).toBeNull();
  });
});

describe("computeDeskStackCount", () => {
  it("scales by outstanding work (pending + in_progress) and caps at DESK_STACK_CAP", () => {
    expect(computeDeskStackCount(hub({ taskCounts: { pending: 2, inProgress: 1, completed: 9 } }))).toBe(3);
    expect(computeDeskStackCount(hub({ taskCounts: { pending: 7, inProgress: 1, completed: 2 } }))).toBe(
      DESK_STACK_CAP,
    );
  });

  it("is zero when there is no outstanding work", () => {
    expect(computeDeskStackCount(hub({ taskCounts: { pending: 0, inProgress: 0, completed: 5 } }))).toBe(0);
    expect(computeDeskStackCount(hub({ taskCounts: null }))).toBe(0);
    expect(computeDeskStackCount(null)).toBe(0);
  });
});

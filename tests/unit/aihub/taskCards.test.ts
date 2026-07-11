import { describe, expect, it } from "vitest";

import {
  buildAihubTaskCards,
  buildAihubTaskCardsByStatus,
  mapHubTaskStatusToBoard,
  resolveAihubBoardError,
  shouldFetchRemoteGatewayTasks,
} from "@/lib/aihub/taskCards";
import { normalizeHubSnapshot, buildAgentSeeds } from "@/lib/runtime/aihub/snapshot";
import type { AgentHubMetadata, HubTaskItem } from "@/lib/runtime/aihub/types";

import liveReal from "../../fixtures/aihub/live-real.json";

const hub = (items: HubTaskItem[] | null): AgentHubMetadata => ({
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
  taskItems: items,
  bgTasks: null,
  canNudge: false,
  hubSessionId: null,
});

describe("resolveAihubBoardError", () => {
  it("suppresses gateway/store/cron errors on the aihub floor (read-only mirror)", () => {
    expect(
      resolveAihubBoardError("aihub", {
        sharedTasksError: "Shared task store route is unavailable.",
        gatewayTasksError: "Gateway is not connected.",
        cronError: "boom",
      }),
    ).toBeNull();
  });

  it("passes the first real error through on other adapters", () => {
    expect(
      resolveAihubBoardError("openclaw", {
        sharedTasksError: null,
        gatewayTasksError: "Gateway is not connected.",
        cronError: "boom",
      }),
    ).toBe("Gateway is not connected.");
    expect(
      resolveAihubBoardError("demo", { sharedTasksError: null, gatewayTasksError: null, cronError: null }),
    ).toBeNull();
  });
});

describe("shouldFetchRemoteGatewayTasks", () => {
  it("is false only for the aihub runtime (no gateway tasks.* methods)", () => {
    expect(shouldFetchRemoteGatewayTasks("aihub")).toBe(false);
    expect(shouldFetchRemoteGatewayTasks("openclaw")).toBe(true);
    expect(shouldFetchRemoteGatewayTasks("demo")).toBe(true);
    expect(shouldFetchRemoteGatewayTasks(null)).toBe(true);
  });
});

describe("mapHubTaskStatusToBoard", () => {
  it("maps hub statuses onto board columns", () => {
    expect(mapHubTaskStatusToBoard("pending")).toBe("todo");
    expect(mapHubTaskStatusToBoard("in_progress")).toBe("in_progress");
    expect(mapHubTaskStatusToBoard("completed")).toBe("done");
    expect(mapHubTaskStatusToBoard("blocked")).toBe("blocked");
    expect(mapHubTaskStatusToBoard("weird-unknown")).toBe("todo");
  });
});

describe("buildAihubTaskCards", () => {
  it("emits one card per task item, assigned to the agent, with a stable id", () => {
    const cards = buildAihubTaskCards([
      {
        agentId: "claude-abc",
        name: "Claude Code",
        hub: hub([
          { id: "1", subject: "Wire the provider", status: "in_progress" },
          { id: "2", subject: "Write the tests", status: "pending" },
          { id: "3", subject: "Ship it", status: "completed" },
        ]),
      },
    ]);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({
      id: "aihub-task:claude-abc:1",
      title: "Wire the provider",
      status: "in_progress",
      assignedAgentId: "claude-abc",
      isInferred: true,
    });
    expect(cards[1].status).toBe("todo");
    expect(cards[2].status).toBe("done");
  });

  it("ignores agents with no task items and is deterministic across calls (stable ids/ts)", () => {
    const agents = [
      { agentId: "a", name: "A", hub: hub(null) },
      { agentId: "b", name: "B", hub: hub([{ id: "x", subject: "Do thing", status: "pending" }]) },
    ];
    const first = buildAihubTaskCards(agents);
    const second = buildAihubTaskCards(agents);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first); // fixed timestamps → identical output, no churn
  });

  it("sanitizes subjects that would trip the office movement-directive parser", () => {
    const cards = buildAihubTaskCards([
      { agentId: "a", name: "A", hub: hub([{ id: "1", subject: "go to the gym", status: "pending" }]) },
    ]);
    // The raw phrase is a movement directive; the sanitizer must neutralize it.
    expect(cards[0].title).not.toBe("go to the gym");
    expect(cards[0].title.length).toBeGreaterThan(0);
  });

  it("groups the real fixture roster's task items by board column", () => {
    const snapshot = normalizeHubSnapshot(liveReal);
    const seeds = buildAgentSeeds(snapshot);
    const grouped = buildAihubTaskCardsByStatus(
      seeds.map((seed) => ({ agentId: seed.agentId, name: seed.name, hub: seed.hub })),
    );
    // The Claude Code node in the fixture carries 10 items: 7 pending, 1 in_progress, 2 completed.
    expect(grouped.todo.length).toBeGreaterThanOrEqual(7);
    expect(grouped.in_progress.length).toBeGreaterThanOrEqual(1);
    expect(grouped.done.length).toBeGreaterThanOrEqual(2);
  });
});

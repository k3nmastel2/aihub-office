import { describe, expect, it } from "vitest";

import { resolveOfficeIntentSnapshot } from "@/lib/office/deskDirectives";
import {
  buildAgentSeeds,
  buildChatHistoryMessages,
  buildSessionsListResult,
  buildSessionsPreviewResult,
  buildStatusResult,
  isHubNodeWorking,
  normalizeHubSnapshot,
  sanitizeTaskTextForOffice,
} from "@/lib/runtime/aihub/snapshot";

import liveReal from "../../fixtures/aihub/live-real.json";

type RawNode = Record<string, unknown>;
type RawLink = { source: string; target: string; kind?: string; active?: boolean };

const makeRaw = (nodes: RawNode[], links: RawLink[] = []) => ({
  nodes,
  links,
  services: [],
  service_links: [],
  generated_at: null,
});

const key = (id: string) => `agent:${id}:main`;

const lastItem = (items: Array<{ role: string; text: string }>) => items[items.length - 1];

describe("normalizeHubSnapshot", () => {
  it("maps hub-shaped fields into the normalized node", () => {
    const snapshot = normalizeHubSnapshot(
      makeRaw([
        {
          id: "s1",
          kind: "session",
          label: "Claude",
          tool: "claude",
          persona: "lead",
          model: "opus",
          task: "build it",
          project: "ai-hub",
          status: "active",
          activity_s: 4,
          tier: 1,
          can_nudge: true,
          session_id: "sess-1",
          current_tool: "Bash",
          tasks: {
            pending: 2,
            in_progress: 1,
            completed: 3,
            items: [{ id: "1", subject: "do thing", status: "in_progress" }],
          },
          bg_tasks: { count: 1, running: 1 },
          activity: [{ tool: "Bash", detail: "ls", service: null, age_s: 0 }],
        },
      ])
    );
    expect(snapshot.nodes).toHaveLength(1);
    const node = snapshot.nodes[0];
    expect(node.taskCounts).toEqual({ pending: 2, inProgress: 1, completed: 3 });
    expect(node.taskItems).toEqual([{ id: "1", subject: "do thing", status: "in_progress" }]);
    expect(node.bgTasks).toEqual({ count: 1, running: 1 });
    expect(node.canNudge).toBe(true);
    expect(node.sessionId).toBe("sess-1");
    expect(node.activity[0]).toEqual({ tool: "Bash", detail: "ls", service: null, ageS: 0 });
  });
});

describe("buildAgentSeeds", () => {
  const snapshot = normalizeHubSnapshot(
    makeRaw(
      [
        { id: "hub", kind: "hub", label: "AI HUB OS", tool: "hub", status: "active", tier: 0 },
        { id: "s1", kind: "session", label: "S1", tool: "claude", persona: "lead", task: "t1", status: "active", tier: 1 },
        { id: "s1-a", kind: "subagent", label: "A", tool: "claude", status: "active", tier: 2 },
        { id: "s1-b", kind: "subagent", label: "B", tool: "claude", status: "done", tier: 2 },
        { id: "s2", kind: "session", label: "S2", tool: "hermes", status: "idle", tier: 1 },
      ],
      [
        { source: "hub", target: "s1", kind: "spawn", active: true },
        { source: "hub", target: "s2", kind: "spawn", active: true },
        { source: "s1", target: "s1-a", kind: "spawn", active: true },
        { source: "s1", target: "s1-b", kind: "spawn", active: true },
      ]
    )
  );

  it("skips the hub node", () => {
    const seeds = buildAgentSeeds(snapshot);
    expect(seeds.some((seed) => seed.agentId === "hub")).toBe(false);
  });

  it("orders depth-first: parent immediately followed by its subtree, sessions contiguous", () => {
    const seeds = buildAgentSeeds(snapshot);
    expect(seeds.map((seed) => seed.agentId)).toEqual(["s1", "s1-a", "s1-b", "s2"]);
  });

  it("derives parent/tier/kind hub metadata from spawn links", () => {
    const seeds = buildAgentSeeds(snapshot);
    const byId = new Map(seeds.map((seed) => [seed.agentId, seed]));
    expect(byId.get("s1")?.hub.parentAgentId).toBeNull();
    expect(byId.get("s1-a")?.hub.parentAgentId).toBe("s1");
    expect(byId.get("s1-a")?.hub.kind).toBe("subagent");
    expect(byId.get("s1")?.role).toBe("lead");
    expect(byId.get("s2")?.role).toBe("hermes");
  });
});

describe("preview / status tail consistency", () => {
  const snapshot = normalizeHubSnapshot(
    makeRaw([
      { id: "act", kind: "session", label: "Active", tool: "claude", task: "ship phase one", status: "active", tier: 1 },
      { id: "wind", kind: "session", label: "Winding", tool: "claude", task: "wrap up", status: "winding", tier: 1 },
      { id: "idle", kind: "session", label: "Idle", tool: "claude", detail: "waiting", status: "idle", tier: 1 },
      { id: "done", kind: "subagent", label: "Done", tool: "claude", detail: "finished", status: "done", tier: 2 },
      {
        id: "blk",
        kind: "session",
        label: "Blocked",
        tool: "claude",
        status: "active",
        badge: "blocked",
        detail: "needs input",
        tier: 1,
      },
    ])
  );

  it("ends working nodes with a role:user tail so the run-state heuristic reads running", () => {
    const preview = buildSessionsPreviewResult(snapshot, [key("act"), key("wind")]);
    for (const entry of preview.previews) {
      expect(entry.status).toBe("ok");
      expect(lastItem(entry.items).role).toBe("user");
    }
  });

  it("ends idle/done/blocked nodes with a role:assistant tail (not running)", () => {
    const preview = buildSessionsPreviewResult(snapshot, [key("idle"), key("done"), key("blk")]);
    for (const entry of preview.previews) {
      expect(lastItem(entry.items).role).toBe("assistant");
    }
  });

  it("treats blocked nodes as not working", () => {
    const blocked = snapshot.nodes.find((node) => node.id === "blk");
    expect(blocked && isHubNodeWorking(blocked)).toBe(false);
  });

  it("returns missing preview status for unknown keys", () => {
    const preview = buildSessionsPreviewResult(snapshot, ["agent:ghost:main"]);
    expect(preview.previews[0].status).toBe("missing");
    expect(preview.previews[0].items).toHaveLength(0);
  });

  it("emits a session per node with the canonical main key", () => {
    const sessions = buildSessionsListResult(snapshot).sessions;
    expect(sessions.map((s) => s.key)).toContain(key("act"));
    const status = buildStatusResult(snapshot);
    expect(status.sessions.byAgent.map((entry) => entry.agentId)).toContain("act");
  });
});

describe("sanitizeTaskTextForOffice", () => {
  const triggers = (text: string): boolean => {
    const snap = resolveOfficeIntentSnapshot(text);
    return Boolean(snap.desk || snap.github || snap.gym || snap.qa || snap.standup || snap.call || snap.text);
  };

  it("passes benign task text through unchanged", () => {
    expect(sanitizeTaskTextForOffice("Implement the aihub provider")).toBe(
      "Implement the aihub provider"
    );
  });

  it("neutralizes movement-directive phrasing", () => {
    for (const phrase of [
      "go to the gym",
      "review PRs and check github",
      "verify the build then run tests",
      "let's have a standup meeting",
      "call bob and tell him it shipped",
      "go to your desk",
    ]) {
      expect(triggers(phrase)).toBe(true);
      expect(triggers(sanitizeTaskTextForOffice(phrase))).toBe(false);
    }
  });

  it("falls back to a benign phrase when nothing survives", () => {
    const result = sanitizeTaskTextForOffice("standup");
    expect(result.length).toBeGreaterThan(0);
    expect(triggers(result)).toBe(false);
  });
});

describe("buildChatHistoryMessages", () => {
  it("synthesizes an assistant-only read-only transcript (never role:user)", () => {
    const snapshot = normalizeHubSnapshot(
      makeRaw([
        {
          id: "s1",
          kind: "session",
          label: "S1",
          tool: "claude",
          status: "active",
          tier: 1,
          detail: "go to the gym",
          tasks: { pending: 1, in_progress: 0, completed: 0, items: [{ id: "1", subject: "x", status: "pending" }] },
          activity: [{ tool: "Bash", detail: "ls", service: null, age_s: 1 }],
        },
      ])
    );
    const messages = buildChatHistoryMessages(snapshot, key("s1"));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.role === "assistant")).toBe(true);
  });
});

describe("real /api/live fixture", () => {
  const snapshot = normalizeHubSnapshot(liveReal);

  it("skips the hub root and seeds every session/subagent", () => {
    const seeds = buildAgentSeeds(snapshot);
    expect(seeds.some((seed) => seed.agentId === "hub")).toBe(false);
    expect(seeds.some((seed) => seed.agentId === "claude-f015ccaa")).toBe(true);
  });

  it("seats each session's subagents immediately after it (contiguous subtree)", () => {
    const order = buildAgentSeeds(snapshot).map((seed) => seed.agentId);
    const parentIndex = order.indexOf("claude-f015ccaa");
    const childIndex = order.indexOf("f015ccaa-sub-phase1-provider");
    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBe(parentIndex + 1);
  });

  it("keeps the active session's preview tail status-consistent", () => {
    const preview = buildSessionsPreviewResult(snapshot, [key("claude-f015ccaa")]);
    expect(lastItem(preview.previews[0].items).role).toBe("user");
  });
});

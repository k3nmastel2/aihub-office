import { describe, expect, it } from "vitest";

import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";
import {
  computeHuddles,
  extractRecipient,
  isSendMessageTool,
  resolveCollaborationBubble,
  type HuddleAgentInput,
} from "@/lib/aihub/collaboration";

const hub = (over: Partial<AgentHubMetadata> = {}): AgentHubMetadata => ({
  parentAgentId: null,
  tier: 1,
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

describe("isSendMessageTool", () => {
  it("matches SendMessage in various casings/spacings", () => {
    expect(isSendMessageTool("SendMessage")).toBe(true);
    expect(isSendMessageTool("send_message")).toBe(true);
    expect(isSendMessageTool("send-message")).toBe(true);
    expect(isSendMessageTool("Send Message")).toBe(true);
  });
  it("rejects other tools / empties", () => {
    expect(isSendMessageTool("Read")).toBe(false);
    expect(isSendMessageTool(null)).toBe(false);
    expect(isSendMessageTool("")).toBe(false);
  });
});

describe("extractRecipient", () => {
  it("parses common recipient formats", () => {
    expect(extractRecipient("→ churn-7a")).toBe("churn-7a");
    expect(extractRecipient("-> main")).toBe("main");
    expect(extractRecipient("to phase3-pods")).toBe("phase3-pods");
    expect(extractRecipient("@rack-hammer")).toBe("rack-hammer");
    expect(extractRecipient("main: start on task 1")).toBe("main");
  });
  it("returns null when nothing parseable", () => {
    expect(extractRecipient(null)).toBeNull();
    expect(extractRecipient("")).toBeNull();
    expect(extractRecipient("just some prose without a target")).toBeNull();
  });
});

describe("resolveCollaborationBubble", () => {
  it("returns null when not messaging", () => {
    expect(resolveCollaborationBubble(null)).toBeNull();
    expect(resolveCollaborationBubble(hub({ currentTool: "Read" }))).toBeNull();
  });

  it("fires on the live currentTool = SendMessage", () => {
    expect(
      resolveCollaborationBubble(
        hub({ currentTool: "SendMessage", detail: "→ churn-7a" }),
      ),
    ).toBe("💬 → churn-7a");
  });

  it("fires on a fresh SendMessage activity entry and pulls the recipient from it", () => {
    const bubble = resolveCollaborationBubble(
      hub({
        currentTool: "Read",
        activity: [
          { tool: "Read", detail: "file.ts", service: null, ageS: 1 },
          { tool: "SendMessage", detail: "to main: done", service: null, ageS: 8 },
        ],
      }),
    );
    expect(bubble).toBe("💬 → main");
  });

  it("ignores a stale SendMessage activity entry", () => {
    expect(
      resolveCollaborationBubble(
        hub({
          currentTool: "Read",
          activity: [
            { tool: "SendMessage", detail: "to main", service: null, ageS: 120 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("falls back to a plain bubble when no recipient parseable", () => {
    expect(
      resolveCollaborationBubble(hub({ currentTool: "SendMessage", detail: null })),
    ).toBe("💬");
  });
});

describe("computeHuddles", () => {
  const a = (over: Partial<HuddleAgentInput>): HuddleAgentInput => ({
    agentId: "x",
    workflow: null,
    group: null,
    firstSeen: 0,
    ...over,
  });

  it("is empty when no workflow/group present (the current live reality)", () => {
    expect(
      computeHuddles([a({ agentId: "a" }), a({ agentId: "b" })]),
    ).toEqual({});
  });

  it("groups ≥2 shared-workflow agents and anchors on the earliest-seen member", () => {
    const plan = computeHuddles([
      a({ agentId: "late", workflow: "wf1", firstSeen: 200 }),
      a({ agentId: "early", workflow: "wf1", firstSeen: 100 }),
      a({ agentId: "solo", workflow: "wf2", firstSeen: 50 }),
    ]);
    expect(plan.early.anchorAgentId).toBe("early");
    expect(plan.late.anchorAgentId).toBe("early");
    expect(plan.early.index).toBe(0);
    expect(plan.late.index).toBe(1);
    expect(plan.solo).toBeUndefined(); // singleton workflow → no huddle
  });

  it("falls back to group when workflow is absent", () => {
    const plan = computeHuddles([
      a({ agentId: "a", group: "g1", firstSeen: 1 }),
      a({ agentId: "b", group: "g1", firstSeen: 2 }),
    ]);
    expect(plan.a.huddleId).toBe("g1");
    expect(plan.b.anchorAgentId).toBe("a");
  });

  it("is deterministic regardless of input order", () => {
    const members = [
      a({ agentId: "b", workflow: "wf", firstSeen: 2 }),
      a({ agentId: "a", workflow: "wf", firstSeen: 1 }),
      a({ agentId: "c", workflow: "wf", firstSeen: 3 }),
    ];
    const p1 = computeHuddles(members);
    const p2 = computeHuddles([...members].reverse());
    expect(p1).toEqual(p2);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildAgentCardHistoryRows,
  buildAgentCardViewModel,
  resolveDismissAffordance,
  resolveNudgeAffordance,
} from "@/lib/aihub/agentCard";
import { buildAgentSeeds, normalizeHubSnapshot } from "@/lib/runtime/aihub/snapshot";
import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";

import liveReal from "../../fixtures/aihub/live-real.json";

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

describe("buildAgentCardViewModel", () => {
  it("derives the header fields from identity + hub metadata", () => {
    const vm = buildAgentCardViewModel({
      name: "Claude Code",
      role: "orchestrator",
      model: "claude-opus-4",
      hub: hub({
        tool: "claude",
        kind: "session",
        tier: 0,
        hubStatus: "active",
        activityS: 9,
        task: "wiring nudge interactions",
        project: "aihub-office",
        currentTool: "Agent",
      }),
    });
    expect(vm.name).toBe("Claude Code");
    expect(vm.personaLine).toBe("orchestrator · claude-opus-4");
    expect(vm.toolLabel).toBe("Claude");
    expect(vm.kindLabel).toBe("Session");
    expect(vm.tierLabel).toBe("tier 0");
    expect(vm.status).toBe("working");
    expect(vm.statusLabel).toBe("Working");
    expect(vm.ageLabel).toBe("9s ago");
    expect(vm.taskText).toBe("wiring nudge interactions");
    expect(vm.currentTool).toBe("Agent");
    expect(vm.project).toBe("aihub-office");
  });

  it("falls back to one side when persona or model is missing", () => {
    expect(
      buildAgentCardViewModel({ name: "x", role: "claude", model: null, hub: hub({}) })
        .personaLine,
    ).toBe("claude");
    expect(
      buildAgentCardViewModel({ name: "x", role: null, model: "m", hub: hub({}) })
        .personaLine,
    ).toBe("m");
  });

  it("maps blocked ahead of status and exposes the detail", () => {
    const vm = buildAgentCardViewModel({
      name: "x",
      role: null,
      model: null,
      hub: hub({ hubStatus: "active", badge: "blocked", detail: "rate limited until 3pm" }),
    });
    expect(vm.status).toBe("blocked");
    expect(vm.statusLabel).toBe("Blocked");
    expect(vm.blockedDetail).toBe("rate limited until 3pm");
  });

  it("hides blocked detail when not blocked", () => {
    const vm = buildAgentCardViewModel({
      name: "x",
      role: null,
      model: null,
      hub: hub({ hubStatus: "idle", detail: "some idle note" }),
    });
    expect(vm.status).toBe("idle");
    expect(vm.blockedDetail).toBeNull();
  });

  it("maps done status and humanizes older ages", () => {
    const done = buildAgentCardViewModel({
      name: "x",
      role: null,
      model: null,
      hub: hub({ hubStatus: "done", activityS: 125 }),
    });
    expect(done.status).toBe("done");
    expect(done.ageLabel).toBe("2m ago");
    expect(
      buildAgentCardViewModel({ name: "x", role: null, model: null, hub: hub({ activityS: 1 }) })
        .ageLabel,
    ).toBe("just now");
  });

  it("builds task-count and background labels only when non-zero", () => {
    const vm = buildAgentCardViewModel({
      name: "x",
      role: null,
      model: null,
      hub: hub({
        taskCounts: { pending: 7, inProgress: 1, completed: 2 },
        bgTasks: { count: 2, running: 1 },
      }),
    });
    expect(vm.taskCountsLabel).toBe("7 pending · 1 in progress · 2 done");
    expect(vm.bgTasksLabel).toBe("2 background (1 running)");
    const empty = buildAgentCardViewModel({
      name: "x",
      role: null,
      model: null,
      hub: hub({ taskCounts: { pending: 0, inProgress: 0, completed: 0 } }),
    });
    expect(empty.taskCountsLabel).toBeNull();
    expect(empty.bgTasksLabel).toBeNull();
  });
});

describe("resolveNudgeAffordance", () => {
  it("enables a top-level Claude session with a resumable hub session", () => {
    const a = resolveNudgeAffordance(
      hub({ kind: "session", tool: "claude", canNudge: true, hubSessionId: "abc-123" }),
    );
    expect(a.enabled).toBe(true);
    expect(a.reason).toBeNull();
  });

  it("disables subagents with a subagent reason", () => {
    const a = resolveNudgeAffordance(
      hub({ kind: "subagent", tool: "claude", canNudge: false }),
    );
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/subagent/i);
  });

  it("disables non-claude tools with a tool reason", () => {
    const a = resolveNudgeAffordance(hub({ kind: "session", tool: "codex", canNudge: false }));
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/Codex/);
  });

  it("disables a claude session that has no resumable session id", () => {
    const a = resolveNudgeAffordance(
      hub({ kind: "session", tool: "claude", canNudge: true, hubSessionId: null }),
    );
    expect(a.enabled).toBe(false);
    expect(a.reason).toMatch(/resumable/i);
  });
});

describe("resolveDismissAffordance", () => {
  it("enables dismiss for idle and done agents", () => {
    expect(resolveDismissAffordance(hub({ hubStatus: "idle" })).enabled).toBe(true);
    expect(resolveDismissAffordance(hub({ hubStatus: "done" })).enabled).toBe(true);
  });

  it("disables dismiss while active or winding", () => {
    const active = resolveDismissAffordance(hub({ hubStatus: "active" }));
    expect(active.enabled).toBe(false);
    expect(active.reason).toMatch(/idle or done/i);
    expect(resolveDismissAffordance(hub({ hubStatus: "winding" })).enabled).toBe(false);
  });
});

describe("buildAgentCardHistoryRows", () => {
  it("renders a task checklist, capped activity, and detail", () => {
    const rows = buildAgentCardHistoryRows(
      hub({
        taskItems: [
          { id: "1", subject: "done thing", status: "completed" },
          { id: "2", subject: "in flight", status: "in_progress" },
          { id: "3", subject: "waiting", status: "pending" },
        ],
        activity: [
          { tool: "Agent", detail: "phase6", service: null, ageS: 1 },
          { tool: "TaskUpdate", detail: null, service: null, ageS: 2 },
          { tool: "Read", detail: "a", service: null, ageS: 3 },
          { tool: "Edit", detail: "b", service: null, ageS: 4 },
          { tool: "Bash", detail: "c", service: null, ageS: 5 },
        ],
        detail: "why blocked",
      }),
    );
    const tasks = rows.find((r) => r.kind === "tasks");
    expect(tasks?.text).toContain("- [x] done thing");
    expect(tasks?.text).toContain("- [~] in flight");
    expect(tasks?.text).toContain("- [ ] waiting");
    const activity = rows.filter((r) => r.kind === "activity");
    expect(activity).toHaveLength(4); // capped
    expect(activity[0].text).toBe("Agent — phase6");
    expect(activity[1].text).toBe("TaskUpdate");
    expect(rows.some((r) => r.kind === "detail" && r.text === "why blocked")).toBe(true);
  });

  it("does not repeat a blocked node's detail in history (it shows in the card callout)", () => {
    const rows = buildAgentCardHistoryRows(
      hub({ badge: "blocked", detail: "rate limited", hubStatus: "idle" }),
    );
    expect(rows.some((r) => r.kind === "detail")).toBe(false);
    // Non-blocked detail still surfaces in history.
    expect(
      buildAgentCardHistoryRows(hub({ detail: "some note" })).some(
        (r) => r.kind === "detail" && r.text === "some note",
      ),
    ).toBe(true);
  });

  it("falls back to a single note when there is nothing to show", () => {
    const rows = buildAgentCardHistoryRows(hub({ task: "just started" }));
    expect(rows).toEqual([{ kind: "note", text: "just started" }]);
    expect(buildAgentCardHistoryRows(hub({})).at(0)?.text).toBe("No recent activity.");
  });
});

describe("seed → card pipeline (live-real fixture)", () => {
  it("threads task/activity/activityS onto the hub seed and drives a nudgeable card", () => {
    const seeds = buildAgentSeeds(normalizeHubSnapshot(liveReal));
    const lead = seeds.find((s) => s.agentId === "claude-f015ccaa");
    expect(lead).toBeDefined();
    if (!lead) return;
    // New Phase 6 hub fields flow through the seed.
    expect(lead.hub.task).toBe("claude session");
    expect(lead.hub.activityS).toBe(9);
    expect(lead.hub.activity.length).toBeGreaterThan(0);

    const vm = buildAgentCardViewModel({
      name: lead.name,
      role: lead.role,
      model: lead.model,
      hub: lead.hub,
    });
    expect(vm.name).toBe("Claude Code");
    expect(vm.status).toBe("working");
    expect(vm.taskCountsLabel).toBe("7 pending · 1 in progress · 2 done");

    // The real session lead is nudgeable (can_nudge + session_id) and, being active, not dismissable.
    expect(resolveNudgeAffordance(lead.hub).enabled).toBe(true);
    expect(resolveDismissAffordance(lead.hub).enabled).toBe(false);

    const rows = buildAgentCardHistoryRows(lead.hub);
    expect(rows.some((r) => r.kind === "tasks")).toBe(true);
    expect(rows.some((r) => r.kind === "activity" && r.text.startsWith("Agent"))).toBe(true);
  });
});

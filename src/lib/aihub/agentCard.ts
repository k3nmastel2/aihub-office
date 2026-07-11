// Pure view-model + affordance gating for the Phase 6 interactions card (the panel that
// opens when you click an agent avatar on the aihub floor). Everything here is deterministic
// and derived from the agent's hub metadata + identity, so the card's fields, the
// nudge/dismiss gating rules, and the read-only history are unit-testable from canned data.
// No React, no I/O.

import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";

// The identity fields the card needs from the AgentState alongside its hub metadata.
// `role` is persona ?? tool; `model` is the hub model (both live on AgentState, not hub).
export type AgentCardSource = {
  name: string;
  role: string | null;
  model: string | null;
  hub: AgentHubMetadata;
};

export type AgentCardStatus = "working" | "idle" | "blocked" | "done";

export type AgentCardViewModel = {
  name: string;
  // "persona · model" — falls back to just one side when the other is absent.
  personaLine: string;
  tool: string;
  toolLabel: string;
  kindLabel: string; // "Session" | "Subagent"
  tierLabel: string; // "tier 0"
  status: AgentCardStatus;
  statusLabel: string; // "Working" | "Idle" | "Blocked" | "Done"
  ageLabel: string; // "3s ago" / "2m ago" / "just now"
  taskText: string | null;
  blockedDetail: string | null;
  currentTool: string | null;
  taskCountsLabel: string | null; // "7 pending · 1 in progress · 2 done"
  bgTasksLabel: string | null; // "2 background (1 running)"
  project: string | null;
};

export type AgentCardAffordance = {
  enabled: boolean;
  // Human-readable reason the affordance is unavailable (null when enabled).
  reason: string | null;
};

export type AgentCardHistoryRow = {
  kind: "tasks" | "activity" | "detail" | "note";
  text: string;
};

const trimmed = (value: string | null | undefined): string | null => {
  const next = (value ?? "").trim();
  return next ? next : null;
};

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  hermes: "Hermes",
  mlx: "MLX",
};

export const toolLabel = (tool: string): string => {
  const key = tool.trim().toLowerCase();
  return TOOL_LABELS[key] ?? (tool.trim() || "Agent");
};

const humanizeAge = (activityS: number): string => {
  const s = Math.max(0, Math.round(activityS));
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

const resolveCardStatus = (hub: AgentHubMetadata): AgentCardStatus => {
  if (hub.badge === "blocked") return "blocked";
  if (hub.hubStatus === "done") return "done";
  if (hub.hubStatus === "active" || hub.hubStatus === "winding") return "working";
  return "idle";
};

const STATUS_LABELS: Record<AgentCardStatus, string> = {
  working: "Working",
  idle: "Idle",
  blocked: "Blocked",
  done: "Done",
};

const buildPersonaLine = (role: string | null, model: string | null): string => {
  const parts = [trimmed(role), trimmed(model)].filter(
    (part): part is string => part !== null,
  );
  return parts.join(" · ");
};

const buildTaskCountsLabel = (hub: AgentHubMetadata): string | null => {
  const counts = hub.taskCounts;
  if (!counts) return null;
  const pending = Math.max(0, counts.pending);
  const inProgress = Math.max(0, counts.inProgress);
  const completed = Math.max(0, counts.completed);
  if (pending + inProgress + completed === 0) return null;
  return `${pending} pending · ${inProgress} in progress · ${completed} done`;
};

const buildBgTasksLabel = (hub: AgentHubMetadata): string | null => {
  const bg = hub.bgTasks;
  if (!bg) return null;
  const count = Math.max(0, bg.count);
  if (count === 0) return null;
  const running = Math.max(0, bg.running);
  return running > 0
    ? `${count} background (${running} running)`
    : `${count} background`;
};

export const buildAgentCardViewModel = (
  source: AgentCardSource,
): AgentCardViewModel => {
  const { hub } = source;
  const status = resolveCardStatus(hub);
  return {
    name: trimmed(source.name) ?? "Unknown",
    personaLine: buildPersonaLine(source.role, source.model),
    tool: hub.tool,
    toolLabel: toolLabel(hub.tool),
    kindLabel: hub.kind === "subagent" ? "Subagent" : "Session",
    tierLabel: `tier ${Math.max(0, hub.tier)}`,
    status,
    statusLabel: STATUS_LABELS[status],
    ageLabel: humanizeAge(hub.activityS),
    taskText: trimmed(hub.task),
    blockedDetail: hub.badge === "blocked" ? trimmed(hub.detail) : null,
    currentTool: trimmed(hub.currentTool),
    taskCountsLabel: buildTaskCountsLabel(hub),
    bgTasksLabel: buildBgTasksLabel(hub),
    project: trimmed(hub.project),
  };
};

// Nudge is only possible for top-level Claude sessions the hub marks resumable
// (`can_nudge` + a `session_id` to `claude --resume`). Everything else is disabled with a
// reason: subagents have no independent session, and codex/gemini/hermes aren't resumable
// through the hub nudge endpoint.
export const resolveNudgeAffordance = (
  hub: AgentHubMetadata,
): AgentCardAffordance => {
  if (hub.canNudge && trimmed(hub.hubSessionId)) {
    return { enabled: true, reason: null };
  }
  if (hub.kind === "subagent") {
    return {
      enabled: false,
      reason: "Subagents can't be nudged — resume their top-level session instead.",
    };
  }
  if (hub.tool.trim().toLowerCase() !== "claude") {
    return {
      enabled: false,
      reason: `${toolLabel(hub.tool)} sessions can't be nudged from the office.`,
    };
  }
  return { enabled: false, reason: "No resumable hub session to nudge." };
};

// Dismiss (24h hide) is offered for agents that aren't actively working — idle or done.
// A still-running agent stays put so the office keeps mirroring live work.
export const resolveDismissAffordance = (
  hub: AgentHubMetadata,
): AgentCardAffordance => {
  if (hub.hubStatus === "idle" || hub.hubStatus === "done") {
    return { enabled: true, reason: null };
  }
  return { enabled: false, reason: "Dismiss once the agent is idle or done." };
};

// Read-only synthesized history: task checklist + recent activity + detail. Parallels the
// provider's `buildChatHistoryMessages` (snapshot.ts) but builds off the seed's hub metadata
// so the card refreshes live with each poll. Never surfaces raw user turns — display only.
const HISTORY_ACTIVITY_LIMIT = 4;

export const buildAgentCardHistoryRows = (
  hub: AgentHubMetadata,
): AgentCardHistoryRow[] => {
  const rows: AgentCardHistoryRow[] = [];
  if (hub.taskItems && hub.taskItems.length > 0) {
    const checklist = hub.taskItems
      .map((item) => {
        const mark =
          item.status === "completed" ? "x" : item.status === "in_progress" ? "~" : " ";
        return `- [${mark}] ${item.subject}`.trimEnd();
      })
      .join("\n");
    rows.push({ kind: "tasks", text: checklist });
  }
  for (const entry of hub.activity.slice(0, HISTORY_ACTIVITY_LIMIT)) {
    const detail = trimmed(entry.detail);
    rows.push({
      kind: "activity",
      text: detail ? `${entry.tool} — ${detail}` : entry.tool,
    });
  }
  // A blocked node's `detail` is already surfaced in the card's amber "Blocked" callout, so
  // don't repeat it here; for non-blocked nodes `detail` is only shown in this history list.
  const detail = hub.badge === "blocked" ? null : trimmed(hub.detail);
  if (detail) rows.push({ kind: "detail", text: detail });
  if (rows.length === 0) {
    rows.push({
      kind: "note",
      text: trimmed(hub.task) ?? "No recent activity.",
    });
  }
  return rows;
};

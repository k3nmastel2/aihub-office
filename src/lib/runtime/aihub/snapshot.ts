// Pure transforms over the AI Hub `/api/live` payload. No I/O, no React — everything
// here is deterministic so the office pipeline (hydration + run-state inference) can be
// fed and unit-tested from canned snapshots.

import {
  buildAgentMainSessionKey,
  parseAgentIdFromSessionKey,
} from "@/lib/gateway/GatewayClient";
import { resolveOfficeIntentSnapshot } from "@/lib/office/deskDirectives";
import type {
  AgentHubMetadata,
  HubActivityEntry,
  HubBadge,
  HubBgTasks,
  HubLiveLink,
  HubLiveNode,
  HubLiveService,
  HubLiveServiceLink,
  HubLiveSnapshot,
  HubNodeKind,
  HubNodeStatus,
  HubTaskCounts,
  HubTaskItem,
} from "@/lib/runtime/aihub/types";

export const HUB_SESSION_MAIN_KEY = "main";

// Fallbacks used when hub text is empty or has to be fully neutralized for the office.
const HUB_TASK_ACTIVE_FALLBACK = "actively working";
const HUB_IDLE_FALLBACK = "idle";

export type HubPreviewRole = "user" | "assistant" | "tool" | "system" | "other";

export type HubPreviewItem = {
  role: HubPreviewRole;
  text: string;
  timestamp: number;
};

export type HubAgentSeed = {
  agentId: string;
  name: string;
  role: string | null;
  model: string | null;
  avatarSeed: string;
  hub: AgentHubMetadata;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBool = (value: unknown): boolean => value === true;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizeStatus = (value: unknown): HubNodeStatus => {
  if (value === "active" || value === "winding" || value === "idle" || value === "done") {
    return value;
  }
  return "idle";
};

const normalizeKind = (value: unknown): HubNodeKind => {
  if (value === "hub" || value === "session" || value === "subagent") return value;
  return "session";
};

const normalizeBadge = (value: unknown): HubBadge | null =>
  value === "blocked" ? "blocked" : null;

const normalizeTaskCounts = (value: unknown): HubTaskCounts | null => {
  if (!isRecord(value)) return null;
  return {
    pending: asNumber(value.pending),
    inProgress: asNumber(value.in_progress),
    completed: asNumber(value.completed),
  };
};

const normalizeTaskItems = (value: unknown): HubTaskItem[] | null => {
  const items = asArray(value)
    .map((raw): HubTaskItem | null => {
      if (!isRecord(raw)) return null;
      const id = asString(raw.id);
      const subject = asString(raw.subject);
      if (!id && !subject) return null;
      return {
        id: id ?? subject ?? "",
        subject: subject ?? "",
        status: asString(raw.status) ?? "pending",
      };
    })
    .filter((item): item is HubTaskItem => item !== null);
  return items.length > 0 ? items : null;
};

const normalizeBgTasks = (value: unknown): HubBgTasks | null => {
  if (!isRecord(value)) return null;
  return { count: asNumber(value.count), running: asNumber(value.running) };
};

const normalizeActivity = (value: unknown): HubActivityEntry[] =>
  asArray(value)
    .map((raw): HubActivityEntry | null => {
      if (!isRecord(raw)) return null;
      const tool = asString(raw.tool);
      if (!tool) return null;
      return {
        tool,
        detail: asString(raw.detail),
        service: asString(raw.service),
        ageS: asNumber(raw.age_s),
      };
    })
    .filter((entry): entry is HubActivityEntry => entry !== null);

const normalizeNode = (raw: unknown): HubLiveNode | null => {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    label: asString(raw.label) ?? id,
    tool: asString(raw.tool) ?? "agent",
    kind: normalizeKind(raw.kind),
    tier: asNumber(raw.tier),
    persona: asString(raw.persona),
    model: asString(raw.model),
    task: asString(raw.task),
    project: asString(raw.project),
    status: normalizeStatus(raw.status),
    activityS: asNumber(raw.activity_s),
    badge: normalizeBadge(raw.badge),
    detail: asString(raw.detail),
    currentTool: asString(raw.current_tool),
    canNudge: asBool(raw.can_nudge),
    sessionId: asString(raw.session_id),
    group: asString(raw.group),
    taskCounts: normalizeTaskCounts(raw.tasks),
    taskItems: normalizeTaskItems(isRecord(raw.tasks) ? raw.tasks.items : null),
    bgTasks: normalizeBgTasks(raw.bg_tasks),
    activity: normalizeActivity(raw.activity),
  };
};

const normalizeLink = (raw: unknown): HubLiveLink | null => {
  if (!isRecord(raw)) return null;
  const source = asString(raw.source);
  const target = asString(raw.target);
  if (!source || !target) return null;
  return {
    source,
    target,
    kind: raw.kind === "peer" ? "peer" : "spawn",
    active: asBool(raw.active),
  };
};

const normalizeService = (raw: unknown): HubLiveService | null => {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    label: asString(raw.label) ?? id,
    status: asString(raw.status) ?? "unknown",
    kind: asString(raw.kind) ?? "service",
  };
};

const normalizeServiceLink = (raw: unknown): HubLiveServiceLink | null => {
  if (!isRecord(raw)) return null;
  const source = asString(raw.source);
  const target = asString(raw.target);
  if (!source || !target) return null;
  return {
    source,
    target,
    kind: asString(raw.kind) ?? "uses",
    active: asBool(raw.active),
    tool: asString(raw.tool),
    ageS: asNumber(raw.age_s),
  };
};

export const normalizeHubSnapshot = (raw: unknown): HubLiveSnapshot => {
  const record = isRecord(raw) ? raw : {};
  return {
    nodes: asArray(record.nodes)
      .map(normalizeNode)
      .filter((node): node is HubLiveNode => node !== null),
    links: asArray(record.links)
      .map(normalizeLink)
      .filter((link): link is HubLiveLink => link !== null),
    services: asArray(record.services)
      .map(normalizeService)
      .filter((service): service is HubLiveService => service !== null),
    serviceLinks: asArray(record.service_links)
      .map(normalizeServiceLink)
      .filter((link): link is HubLiveServiceLink => link !== null),
    generatedAt: asString(record.generated_at),
  };
};

// A node is "working" (typing at a desk) when it is active/winding AND not blocked.
// Blocked nodes surface as idle so they don't animate as busy.
export const isHubNodeWorking = (node: {
  status: HubNodeStatus;
  badge: HubBadge | null;
}): boolean =>
  (node.status === "active" || node.status === "winding") && node.badge !== "blocked";

const agentNodesOf = (snapshot: HubLiveSnapshot): HubLiveNode[] =>
  snapshot.nodes.filter((node) => node.kind !== "hub");

const hubUpdatedAtMs = (node: HubLiveNode, now: number): number => {
  const ageMs = Math.max(0, node.activityS) * 1000;
  return Math.max(0, now - ageMs);
};

const seedFromNode = (
  node: HubLiveNode,
  parentAgentId: string | null
): HubAgentSeed => ({
  agentId: node.id,
  name: node.label,
  role: node.persona ?? node.tool,
  model: node.model,
  avatarSeed: node.id,
  hub: {
    parentAgentId,
    tier: node.tier,
    group: node.group,
    kind: node.kind === "subagent" ? "subagent" : "session",
    tool: node.tool,
    hubStatus: node.status,
    badge: node.badge,
    detail: node.detail,
    project: node.project,
    currentTool: node.currentTool,
    taskCounts: node.taskCounts,
    taskItems: node.taskItems,
    bgTasks: node.bgTasks,
    canNudge: node.canNudge,
    hubSessionId: node.sessionId,
  },
});

// Depth-first roster ordering: each top-level session is immediately followed by its
// spawn subtree, so a session and its subagents stay contiguous — the seed array order
// is the office's adjacency lever for pod seating in later phases.
export const buildAgentSeeds = (snapshot: HubLiveSnapshot): HubAgentSeed[] => {
  const agentNodes = agentNodesOf(snapshot);
  const byId = new Map(agentNodes.map((node) => [node.id, node]));
  const orderIndex = new Map(agentNodes.map((node, index) => [node.id, index]));

  const parentById = new Map<string, string | null>();
  for (const node of agentNodes) parentById.set(node.id, null);
  for (const link of snapshot.links) {
    if (link.kind !== "spawn") continue;
    if (!byId.has(link.target)) continue;
    // A spawn sourced from the hub root (or an unknown node) means a top-level session.
    parentById.set(link.target, byId.has(link.source) ? link.source : null);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const node of agentNodes) {
    const parent = parentById.get(node.id) ?? null;
    if (parent === null) continue;
    const list = childrenByParent.get(parent) ?? [];
    list.push(node.id);
    childrenByParent.set(parent, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  }

  const seeds: HubAgentSeed[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    visited.add(id);
    seeds.push(seedFromNode(node, parentById.get(id) ?? null));
    for (const childId of childrenByParent.get(id) ?? []) visit(childId);
  };

  for (const node of agentNodes) {
    if ((parentById.get(node.id) ?? null) === null) visit(node.id);
  }
  // Orphans whose parent isn't a known agent node still get seated (first-seen order).
  for (const node of agentNodes) visit(node.id);
  return seeds;
};

const hasOfficeDirective = (text: string): boolean => {
  const snapshot = resolveOfficeIntentSnapshot(text);
  return Boolean(
    snapshot.desk ||
      snapshot.github ||
      snapshot.gym ||
      snapshot.qa ||
      snapshot.standup ||
      snapshot.call ||
      snapshot.text
  );
};

// Hub task text is surfaced as a `role:"user"` preview tail so the office run-state
// heuristic reads the agent as running. The office also parses the latest user message
// for movement directives ("go to the gym", "review PRs", ...), so we must guarantee the
// text can never trip one. We drop the minimal set of words that keep the office directive
// parser triggering, falling back to a benign phrase if nothing survives.
export const sanitizeTaskTextForOffice = (raw: string | null | undefined): string => {
  const base = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!base) return "";
  if (!hasOfficeDirective(base)) return base;
  const kept: string[] = [];
  for (const word of base.split(" ")) {
    const candidate = kept.length > 0 ? `${kept.join(" ")} ${word}` : word;
    if (!hasOfficeDirective(candidate)) kept.push(word);
  }
  const result = kept.join(" ").trim();
  return result && !hasOfficeDirective(result) ? result : HUB_TASK_ACTIVE_FALLBACK;
};

const lastActivityLine = (node: HubLiveNode): string | null => {
  const entry = node.activity[0];
  if (!entry) return null;
  return entry.detail ? `${entry.tool} — ${entry.detail}` : entry.tool;
};

const resolveIdlePreviewText = (node: HubLiveNode): string =>
  node.detail?.trim() ||
  lastActivityLine(node) ||
  node.task?.trim() ||
  HUB_IDLE_FALLBACK;

const buildPreviewItems = (node: HubLiveNode, now: number): HubPreviewItem[] => {
  const ts = hubUpdatedAtMs(node, now);
  if (isHubNodeWorking(node)) {
    const items: HubPreviewItem[] = [];
    const detail = node.detail?.trim();
    if (detail) {
      items.push({ role: "assistant", text: detail, timestamp: Math.max(0, ts - 1000) });
    }
    const task = sanitizeTaskTextForOffice(node.task ?? node.label) || HUB_TASK_ACTIVE_FALLBACK;
    items.push({ role: "user", text: task, timestamp: ts });
    return items;
  }
  return [{ role: "assistant", text: resolveIdlePreviewText(node), timestamp: ts }];
};

export const buildStatusResult = (snapshot: HubLiveSnapshot, now = Date.now()) => {
  const nodes = agentNodesOf(snapshot);
  const recent = nodes.map((node) => ({
    key: buildAgentMainSessionKey(node.id, HUB_SESSION_MAIN_KEY),
    updatedAt: hubUpdatedAtMs(node, now),
  }));
  return {
    sessions: {
      recent,
      byAgent: nodes.map((node) => ({
        agentId: node.id,
        recent: [
          {
            key: buildAgentMainSessionKey(node.id, HUB_SESSION_MAIN_KEY),
            updatedAt: hubUpdatedAtMs(node, now),
          },
        ],
      })),
    },
  };
};

export const buildSessionsListResult = (
  snapshot: HubLiveSnapshot,
  agentId?: string | null,
  now = Date.now()
) => {
  const nodes = agentNodesOf(snapshot);
  const trimmedAgentId = agentId?.trim() ?? "";
  const selected = trimmedAgentId
    ? nodes.filter((node) => node.id === trimmedAgentId)
    : nodes;
  return {
    sessions: selected.map((node) => ({
      key: buildAgentMainSessionKey(node.id, HUB_SESSION_MAIN_KEY),
      updatedAt: hubUpdatedAtMs(node, now),
      displayName: node.label,
      origin: { label: "AI Hub", provider: "aihub" },
      modelProvider: node.tool,
      model: node.model ?? undefined,
    })),
  };
};

export const buildSessionsPreviewResult = (
  snapshot: HubLiveSnapshot,
  keys: string[],
  now = Date.now()
) => {
  const byId = new Map(agentNodesOf(snapshot).map((node) => [node.id, node]));
  return {
    ts: now,
    previews: keys.map((key) => {
      const agentId = parseAgentIdFromSessionKey(key);
      const node = agentId ? byId.get(agentId) ?? null : null;
      if (!node) return { key, status: "missing" as const, items: [] as HubPreviewItem[] };
      const items = buildPreviewItems(node, now);
      return { key, status: (items.length > 0 ? "ok" : "empty") as "ok" | "empty", items };
    }),
  };
};

export type HubChatHistoryMessage = {
  role: "assistant";
  content: string;
  timestamp: number;
};

// Read-only meta transcript: task checklist + recent activity + detail, all as assistant
// rows. Never emits `role:"user"` — the office directive parser only reads user turns, and
// hub content must never be mistaken for a movement command.
export const buildChatHistoryMessages = (
  snapshot: HubLiveSnapshot,
  sessionKey: string,
  now = Date.now()
): HubChatHistoryMessage[] => {
  const agentId = parseAgentIdFromSessionKey(sessionKey);
  const node = agentId
    ? agentNodesOf(snapshot).find((candidate) => candidate.id === agentId) ?? null
    : null;
  if (!node) return [];
  const messages: HubChatHistoryMessage[] = [];
  let offset = 0;
  const push = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    messages.push({ role: "assistant", content: trimmed, timestamp: Math.max(0, now - offset) });
    offset += 1000;
  };
  if (node.taskItems && node.taskItems.length > 0) {
    const checklist = node.taskItems
      .map((item) => {
        const mark = item.status === "completed" ? "x" : item.status === "in_progress" ? "~" : " ";
        return `- [${mark}] ${item.subject}`;
      })
      .join("\n");
    push(`Task list:\n${checklist}`);
  }
  for (const entry of node.activity.slice(0, 4)) {
    push(entry.detail ? `${entry.tool} — ${entry.detail}` : entry.tool);
  }
  if (node.detail) push(node.detail);
  if (messages.length === 0) push(node.task ?? node.label ?? "No recent activity.");
  return messages;
};

export const buildModelsListResult = (snapshot: HubLiveSnapshot) => {
  const models = new Set<string>();
  for (const node of agentNodesOf(snapshot)) {
    if (node.model) models.add(node.model);
  }
  return {
    models: [...models].map((id) => ({ id, name: id, provider: "aihub" })),
  };
};

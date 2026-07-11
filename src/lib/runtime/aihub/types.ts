// Types for the AI Hub `/api/live` snapshot and the metadata we thread onto agent
// seeds so the 3D office can render hierarchy, tasks, badges, and nudge affordances.
// The hub emits a renderer-agnostic graph; these types are the normalized view the
// rest of the aihub runtime provider works against.

export type HubNodeKind = "hub" | "session" | "subagent";
export type HubNodeStatus = "active" | "winding" | "idle" | "done";
export type HubBadge = "blocked";

export type HubTaskCounts = {
  pending: number;
  inProgress: number;
  completed: number;
};

export type HubTaskItem = {
  id: string;
  subject: string;
  status: string;
};

export type HubBgTasks = {
  count: number;
  running: number;
};

export type HubActivityEntry = {
  tool: string;
  detail: string | null;
  service: string | null;
  ageS: number;
};

export type HubLiveNode = {
  id: string;
  label: string;
  tool: string;
  kind: HubNodeKind;
  tier: number;
  persona: string | null;
  model: string | null;
  task: string | null;
  project: string | null;
  status: HubNodeStatus;
  activityS: number;
  badge: HubBadge | null;
  detail: string | null;
  currentTool: string | null;
  canNudge: boolean;
  sessionId: string | null;
  group: string | null;
  workflow: string | null;
  taskCounts: HubTaskCounts | null;
  taskItems: HubTaskItem[] | null;
  bgTasks: HubBgTasks | null;
  activity: HubActivityEntry[];
};

export type HubLiveLink = {
  source: string;
  target: string;
  kind: "spawn" | "peer";
  active: boolean;
};

export type HubLiveService = {
  id: string;
  label: string;
  status: string;
  kind: string;
};

export type HubLiveServiceLink = {
  source: string;
  target: string;
  kind: string;
  active: boolean;
  tool: string | null;
  ageS: number;
};

export type HubLiveSnapshot = {
  nodes: HubLiveNode[];
  links: HubLiveLink[];
  services: HubLiveService[];
  serviceLinks: HubLiveServiceLink[];
  generatedAt: string | null;
};

// Rides on `AgentStoreSeed.hub` — everything the office needs beyond the base
// agent identity. One optional seed field carries all hub extras through hydration.
export type AgentHubMetadata = {
  parentAgentId: string | null;
  tier: number;
  group: string | null;
  // Shared focus keys (Phase 3 pod sub-clustering): agents working the same workflow /
  // group sit adjacent within their session pod. Both are currently null in the live
  // `/api/live` payload (the hub does not yet emit them) — the clustering is inert until it does.
  workflow: string | null;
  kind: "session" | "subagent";
  tool: string;
  hubStatus: HubNodeStatus;
  badge: HubBadge | null;
  detail: string | null;
  project: string | null;
  currentTool: string | null;
  taskCounts: HubTaskCounts | null;
  taskItems: HubTaskItem[] | null;
  bgTasks: HubBgTasks | null;
  canNudge: boolean;
  hubSessionId: string | null;
};

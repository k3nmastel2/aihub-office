// Collaboration signals for the aihub office (Phase 7c).
//
// Two pure detectors off the hub metadata:
//   • resolveCollaborationBubble — a speech bubble fires when an agent is ACTUALLY messaging a
//     teammate (the SendMessage tool), replacing the old random bump-chatter with honest
//     agent-to-agent collaboration. The recipient (when parseable from the activity detail)
//     rides the bubble.
//   • computeHuddles — groups working agents that share a hub.workflow (or group) so a
//     collaborating team can gather around one desk instead of sitting apart. Payload-ready +
//     tested against fixtures; INERT until the hub emits workflow/group on nodes (same pattern
//     as Phase 3's focus-clustering).

import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";

// ── Collaboration bubble ────────────────────────────────────────────────────────────────
// A SendMessage counts as fresh if the freshest activity entry is within this many seconds.
const COLLAB_FRESH_S = 15;

const normalizeTool = (tool: string | null | undefined): string =>
  (tool ?? "").toLowerCase().replace(/[\s_-]+/g, "");

export const isSendMessageTool = (tool: string | null | undefined): boolean =>
  normalizeTool(tool).includes("sendmessage");

// Best-effort recipient extraction from a SendMessage activity detail. The hub detail format
// isn't guaranteed, so this is tolerant: "→ name" / "-> name" / "to name" / "@name" /
// "name: message" all yield `name`; anything else yields null (the bubble still shows).
export const extractRecipient = (detail: string | null | undefined): string | null => {
  const text = (detail ?? "").trim();
  if (!text) return null;
  const arrow = text.match(/(?:→|->|»|to\b|@)\s*["']?([A-Za-z0-9][\w.-]{1,63})/i);
  if (arrow?.[1]) return arrow[1];
  const colon = text.match(/^["']?([A-Za-z0-9][\w.-]{1,63})["']?\s*:/);
  if (colon?.[1]) return colon[1];
  return null;
};

// Returns the collaboration bubble text for an agent, or null when it isn't currently
// messaging a teammate. Prefers the live `currentTool`; otherwise honors a very fresh
// SendMessage in the activity log.
export const resolveCollaborationBubble = (
  hub: AgentHubMetadata | null | undefined,
): string | null => {
  if (!hub) return null;
  const activeSend = isSendMessageTool(hub.currentTool);
  const freshEntry = hub.activity?.find((entry) => isSendMessageTool(entry.tool));
  const freshSend =
    Boolean(freshEntry) && (freshEntry?.ageS ?? Number.POSITIVE_INFINITY) <= COLLAB_FRESH_S;
  if (!activeSend && !freshSend) return null;
  const recipient =
    extractRecipient(freshEntry?.detail) ?? extractRecipient(hub.detail);
  return recipient ? `💬 → ${recipient}` : "💬";
};

// ── Huddles (payload-ready; inert until the hub emits workflow/group) ────────────────────
export type HuddleAgentInput = {
  agentId: string;
  workflow: string | null;
  group: string | null;
  firstSeen: number; // client-side first-seen ms — the earliest member anchors the huddle
};

export type HuddleAssignment = {
  huddleId: string; // the shared workflow (or group) key
  anchorAgentId: string; // the earliest-seen member — the desk everyone gathers at
  index: number; // stable ring index around the anchor desk (0 = anchor)
};

export type HuddlePlan = Readonly<Record<string, HuddleAssignment>>;

export const EMPTY_HUDDLE_PLAN: HuddlePlan = {};

// Group working agents by shared workflow (falling back to group), keeping only groups with ≥2
// members. Deterministic: members are ordered by firstSeen then agentId; the first is the
// anchor. Agents with no workflow/group — the current live reality — are simply absent, so the
// whole plan is empty until the hub emits those fields.
export const computeHuddles = (agents: readonly HuddleAgentInput[]): HuddlePlan => {
  const byKey = new Map<string, HuddleAgentInput[]>();
  for (const agent of agents) {
    const key = agent.workflow?.trim() || agent.group?.trim();
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(agent);
    else byKey.set(key, [agent]);
  }
  const plan: Record<string, HuddleAssignment> = {};
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const ordered = [...members].sort(
      (a, b) => a.firstSeen - b.firstSeen || (a.agentId < b.agentId ? -1 : 1),
    );
    const anchorAgentId = ordered[0].agentId;
    ordered.forEach((member, index) => {
      plan[member.agentId] = { huddleId: key, anchorAgentId, index };
    });
  }
  return plan;
};

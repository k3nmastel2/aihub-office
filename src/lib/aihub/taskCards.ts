// Pure mapping from hub `tasks.items` into the office task board's `TaskBoardCard` shape,
// so the existing immersive Kanban can render an agent's REAL /tasks list. This produces a
// read-only live mirror: cards are derived fresh from the roster each render and never
// dispatched into the shared task store (so it can't churn or corrupt persisted tasks).
// No React, no I/O — deterministic and unit-testable.

import { sanitizeTaskTextForOffice } from "@/lib/runtime/aihub/snapshot";
import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";
import {
  type TaskBoardCard,
  type TaskBoardStatus,
} from "@/features/office/tasks/types";

// Hub item status → board column. pending→todo, in_progress→in_progress, completed→done;
// blocked/review pass through; anything unrecognized falls back to todo.
export const mapHubTaskStatusToBoard = (status: string): TaskBoardStatus => {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "completed":
    case "done":
      return "done";
    case "blocked":
      return "blocked";
    case "review":
      return "review";
    case "pending":
    default:
      return "todo";
  }
};

// Fixed, non-volatile timestamp: these mirror cards carry no real create/update time, and a
// constant keeps card identity + fields stable across polls (no re-render churn).
const AIHUB_TASK_TS = new Date(0).toISOString();

export type AihubTaskAgent = {
  agentId: string;
  name: string;
  hub: AgentHubMetadata | null | undefined;
};

const aihubTaskCardId = (agentId: string, itemId: string, index: number): string =>
  `aihub-task:${agentId}:${itemId || String(index)}`;

export const buildAihubTaskCards = (agents: AihubTaskAgent[]): TaskBoardCard[] => {
  const cards: TaskBoardCard[] = [];
  for (const agent of agents) {
    const items = agent.hub?.taskItems ?? null;
    if (!items || items.length === 0) continue;
    items.forEach((item, index) => {
      const cardId = aihubTaskCardId(agent.agentId, item.id, index);
      // Sanitize the subject so hub task text can never trip the office movement-directive
      // parser if it is ever fed back through a preview path; also a benign display value.
      const subject = sanitizeTaskTextForOffice(item.subject) || `Task ${index + 1}`;
      cards.push({
        id: cardId,
        title: subject,
        description: subject,
        status: mapHubTaskStatusToBoard(item.status),
        source: "openclaw_event",
        sourceEventId: cardId,
        assignedAgentId: agent.agentId,
        createdAt: AIHUB_TASK_TS,
        updatedAt: AIHUB_TASK_TS,
        playbookJobId: null,
        runId: null,
        channel: null,
        externalThreadId: null,
        lastActivityAt: AIHUB_TASK_TS,
        notes: [],
        isArchived: false,
        isInferred: true,
      });
    });
  }
  return cards;
};

export const groupTaskCardsByStatus = (
  cards: TaskBoardCard[],
): Record<TaskBoardStatus, TaskBoardCard[]> => {
  const grouped: Record<TaskBoardStatus, TaskBoardCard[]> = {
    todo: [],
    in_progress: [],
    blocked: [],
    review: [],
    done: [],
  };
  for (const card of cards) grouped[card.status].push(card);
  return grouped;
};

// Convenience: roster → cardsByStatus for the aihub Kanban source-switch.
export const buildAihubTaskCardsByStatus = (
  agents: AihubTaskAgent[],
): Record<TaskBoardStatus, TaskBoardCard[]> =>
  groupTaskCardsByStatus(buildAihubTaskCards(agents));

// On the aihub floor the Kanban is a read-only mirror fed entirely by the source-switch
// above — it does NOT use the gateway task/cron path, so those errors ("Gateway is not
// connected." during the transient boot, "AI Hub runtime does not implement tasks.list.",
// shared-store 404s) are irrelevant noise and must not surface as the board's red banner.
// Other adapters keep their real connection/error banner.
export const resolveAihubBoardError = (
  adapterType: string | null | undefined,
  errors: {
    sharedTasksError?: string | null;
    gatewayTasksError?: string | null;
    cronError?: string | null;
  },
): string | null => {
  if (adapterType === "aihub") return null;
  return errors.sharedTasksError ?? errors.gatewayTasksError ?? errors.cronError ?? null;
};

// The gateway task fetch (`tasks.list`) is unsupported by the aihub runtime, so it must be
// skipped on the aihub floor — otherwise it throws every poll (surfacing as the banner and
// a potential unhandled rejection). True for every non-aihub adapter.
export const shouldFetchRemoteGatewayTasks = (
  adapterType: string | null | undefined,
): boolean => adapterType !== "aihub";

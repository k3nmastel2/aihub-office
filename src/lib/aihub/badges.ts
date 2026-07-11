// Pure derivations from an agent's hub metadata into the small office HUD signals:
// blocked badge, compact nameplate chips (task progress + background tasks), and the
// desk paper-stack height. No React, no I/O — deterministic so it can be unit-tested
// from canned hub metadata and shared by the renderer + OfficeScreen mapper.

import type { AgentHubMetadata } from "@/lib/runtime/aihub/types";

export type AihubNameplateChips = {
  // Task progress as "remaining/total" (remaining = pending + in_progress). Null when the
  // agent has no tasks — chips render only when non-zero to keep nameplates uncluttered.
  task: string | null;
  // Count of running background tasks. Null when none are running.
  bg: string | null;
};

export const computeNameplateChips = (
  hub: AgentHubMetadata | null | undefined,
): AihubNameplateChips => {
  const counts = hub?.taskCounts ?? null;
  let task: string | null = null;
  if (counts) {
    const total =
      Math.max(0, counts.pending) +
      Math.max(0, counts.inProgress) +
      Math.max(0, counts.completed);
    if (total > 0) {
      const remaining = Math.max(0, counts.pending) + Math.max(0, counts.inProgress);
      task = `${remaining}/${total}`;
    }
  }
  const running = Math.max(0, hub?.bgTasks?.running ?? 0);
  const bg = running > 0 ? String(running) : null;
  return { task, bg };
};

export type AihubAgentBadge = {
  badge: "blocked" | null;
  // The hub `detail` string (why the agent is blocked), surfaced in the hover card.
  detail: string | null;
};

export const resolveAgentBadge = (
  hub: AgentHubMetadata | null | undefined,
): AihubAgentBadge => {
  if (hub?.badge !== "blocked") return { badge: null, detail: null };
  const detail = hub.detail?.trim() ? hub.detail.trim() : null;
  return { badge: "blocked", detail };
};

// Desk paper stack: one sheet per outstanding task (pending + in_progress), capped so a
// large backlog never grows an unbounded tower. Completed tasks don't add paper.
export const DESK_STACK_CAP = 5;

export const computeDeskStackCount = (
  hub: AgentHubMetadata | null | undefined,
): number => {
  const counts = hub?.taskCounts ?? null;
  if (!counts) return 0;
  const outstanding = Math.max(0, counts.pending) + Math.max(0, counts.inProgress);
  return Math.min(DESK_STACK_CAP, outstanding);
};

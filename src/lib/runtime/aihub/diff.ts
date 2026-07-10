// Pure snapshot diffing → synthetic gateway EventFrames. These frames flow through the
// office's existing event pipeline unmodified: `presence` re-hydrates the roster (and lets
// the run-state heuristic re-infer status from our status-consistent preview tails), while
// `agent` lifecycle/tool frames give immediate working/idle latches and speech bubbles.

import type { EventFrame } from "@/lib/gateway/GatewayClient";
import { buildAgentMainSessionKey } from "@/lib/gateway/GatewayClient";
import { HUB_SESSION_MAIN_KEY, isHubNodeWorking } from "@/lib/runtime/aihub/snapshot";
import type { HubLiveNode, HubLiveSnapshot } from "@/lib/runtime/aihub/types";

const hubRunId = (agentId: string): string => `hub-run-${agentId}`;

const agentNodesOf = (snapshot: HubLiveSnapshot): HubLiveNode[] =>
  snapshot.nodes.filter((node) => node.kind !== "hub");

// Membership + order + run-state signature. Any change re-hydrates the roster, so both
// spawn/despawn and pure active↔idle transitions reconcile through the (status-consistent)
// run-state inference rather than depending on lifecycle-frame runId matching.
const presenceSignature = (nodes: HubLiveNode[]): string =>
  nodes.map((node) => `${node.id}:${isHubNodeWorking(node) ? 1 : 0}`).join("|");

const toolBubbleText = (node: HubLiveNode): string => {
  const detail =
    node.activity.find((entry) => entry.tool === node.currentTool)?.detail?.trim() || null;
  return detail ? `${node.currentTool} — ${detail}` : (node.currentTool ?? "");
};

export const diffSnapshots = (
  prev: HubLiveSnapshot,
  next: HubLiveSnapshot,
  seqStart: number
): EventFrame[] => {
  const frames: EventFrame[] = [];
  const emit = (event: string, payload: unknown): void => {
    frames.push({ type: "event", event, payload, seq: seqStart + frames.length });
  };

  const prevAgents = agentNodesOf(prev);
  const nextAgents = agentNodesOf(next);
  const prevById = new Map(prevAgents.map((node) => [node.id, node]));

  if (presenceSignature(prevAgents) !== presenceSignature(nextAgents)) {
    emit("presence", {});
  }

  for (const node of nextAgents) {
    const before = prevById.get(node.id);
    if (!before) continue; // newly present nodes are handled by the presence re-hydrate
    const sessionKey = buildAgentMainSessionKey(node.id, HUB_SESSION_MAIN_KEY);
    const runId = hubRunId(node.id);
    const wasWorking = isHubNodeWorking(before);
    const nowWorking = isHubNodeWorking(node);
    if (!wasWorking && nowWorking) {
      emit("agent", { runId, sessionKey, stream: "lifecycle", data: { phase: "start" } });
    } else if (wasWorking && !nowWorking) {
      emit("agent", { runId, sessionKey, stream: "lifecycle", data: { phase: "end" } });
    }
    if (node.currentTool && node.currentTool !== before.currentTool) {
      emit("agent", { runId, sessionKey, stream: "tool", data: { text: toolBubbleText(node) } });
    }
  }

  return frames;
};

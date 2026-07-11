// Pure derivation of "honest errands": when an agent is actively using a hub service that
// maps to a world object with a walk-to route, it should physically walk to that object,
// work there, and return. No I/O, no React — fed the roster + live service_links each poll
// and carrying its own throttle state, so it's fully unit-testable from canned snapshots.
//
// Two guards keep the office honest instead of twitchy (mirrors the old hub office's
// updateApplianceVisit throttle):
//   1. Confirmation — a candidate errand must persist across ≥2 consecutive polls before the
//      agent relocates (no ping-ponging on a single-poll tool blip).
//   2. Hold — once latched, the errand is held for ~20s so the agent stays at the object long
//      enough to read as "working there", even if the tool changes mid-visit, then releases
//      (the agent returns to its desk via the normal seating path).

import {
  mapServiceIdToErrand,
  mapToolToErrand,
  type ServiceErrandTarget,
} from "@/lib/aihub/serviceMap";
import type { HubLiveServiceLink } from "@/lib/runtime/aihub/types";

export const SERVICE_ERRAND_HOLD_MS = 20_000;

// The roster slice the errand logic needs (a projection of AgentHubMetadata + id).
export type ErrandAgentInput = {
  agentId: string;
  currentTool: string | null;
  // Only working agents errand off a stale currentTool; an active service_link overrides this.
  working: boolean;
};

export type ServiceErrandEntry = {
  // The candidate seen on the most recent poll (drives the ≥2-poll confirmation).
  candidate: ServiceErrandTarget | null;
  // The errand currently latched (agent is walking to / working at the object), or null.
  active: ServiceErrandTarget | null;
  // Epoch ms after which the active hold releases.
  heldUntil: number;
};

export type ServiceErrandState = Record<string, ServiceErrandEntry>;

export type ComputeServiceErrandsInput = {
  agents: ErrandAgentInput[];
  serviceLinks: HubLiveServiceLink[];
  previous: ServiceErrandState;
  now: number;
  holdMs?: number;
};

export type ComputeServiceErrandsResult = {
  // Agents with a latched errand → their target object (feeds the office hold maps).
  errandsByAgentId: Record<string, ServiceErrandTarget>;
  // Carry forward into the next poll.
  nextState: ServiceErrandState;
};

const EMPTY_ENTRY: ServiceErrandEntry = {
  candidate: null,
  active: null,
  heldUntil: 0,
};

// The honest "using now" signal: the freshest active service_link sourced from this agent
// that maps to an errand-able object. Falls back to the agent's current_tool for working
// agents when the hub emits no link (the link is authoritative; the tool is a hint).
const deriveCandidate = (
  agent: ErrandAgentInput,
  linksBySource: Map<string, HubLiveServiceLink[]>
): ServiceErrandTarget | null => {
  const links = linksBySource.get(agent.agentId);
  if (links && links.length > 0) {
    // Prefer the freshest active link (smallest ageS) whose target maps to an errand.
    const ranked = [...links]
      .filter((link) => link.active)
      .sort((a, b) => a.ageS - b.ageS);
    for (const link of ranked) {
      const errand = mapServiceIdToErrand(link.target);
      if (errand) return errand;
    }
  }
  if (agent.working) {
    const errand = mapToolToErrand(agent.currentTool);
    if (errand) return errand;
  }
  return null;
};

export const computeServiceErrands = ({
  agents,
  serviceLinks,
  previous,
  now,
  holdMs = SERVICE_ERRAND_HOLD_MS,
}: ComputeServiceErrandsInput): ComputeServiceErrandsResult => {
  const linksBySource = new Map<string, HubLiveServiceLink[]>();
  for (const link of serviceLinks) {
    const list = linksBySource.get(link.source) ?? [];
    list.push(link);
    linksBySource.set(link.source, list);
  }

  const errandsByAgentId: Record<string, ServiceErrandTarget> = {};
  const nextState: ServiceErrandState = {};

  for (const agent of agents) {
    const prev = previous[agent.agentId] ?? EMPTY_ENTRY;
    const candidate = deriveCandidate(agent, linksBySource);

    let active = prev.active;
    let heldUntil = prev.heldUntil;

    if (active && now < prev.heldUntil) {
      // Still inside an active hold — keep the agent at the object. Re-confirming the same
      // target extends the visit so a long-running service use keeps them there.
      if (candidate === active) {
        heldUntil = now + holdMs;
      }
    } else {
      // No active hold (or it just expired). Latch a new errand only once the candidate has
      // been confirmed on two consecutive polls (candidate === last poll's candidate).
      active = null;
      heldUntil = 0;
      if (candidate !== null && candidate === prev.candidate) {
        active = candidate;
        heldUntil = now + holdMs;
      }
    }

    nextState[agent.agentId] = { candidate, active, heldUntil };
    if (active) errandsByAgentId[agent.agentId] = active;
  }

  return { errandsByAgentId, nextState };
};

// Split a flat errand map into the four per-target hold maps the office renderer consumes.
export type ServiceErrandHoldMaps = {
  serverRoom: Record<string, boolean>;
  phoneBooth: Record<string, boolean>;
  library: Record<string, boolean>;
  qaDevice: Record<string, boolean>;
};

export const EMPTY_SERVICE_ERRAND_HOLD_MAPS: ServiceErrandHoldMaps = {
  serverRoom: {},
  phoneBooth: {},
  library: {},
  qaDevice: {},
};

export const buildServiceErrandHoldMaps = (
  errandsByAgentId: Record<string, ServiceErrandTarget>
): ServiceErrandHoldMaps => {
  const maps: ServiceErrandHoldMaps = {
    serverRoom: {},
    phoneBooth: {},
    library: {},
    qaDevice: {},
  };
  for (const [agentId, target] of Object.entries(errandsByAgentId)) {
    switch (target) {
      case "server_room":
        maps.serverRoom[agentId] = true;
        break;
      case "phone_booth":
        maps.phoneBooth[agentId] = true;
        break;
      case "library":
        maps.library[agentId] = true;
        break;
      case "qa_device":
        maps.qaDevice[agentId] = true;
        break;
    }
  }
  return maps;
};

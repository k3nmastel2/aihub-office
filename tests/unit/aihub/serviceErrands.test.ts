import { describe, expect, it } from "vitest";

import {
  buildServiceErrandHoldMaps,
  computeServiceErrands,
  SERVICE_ERRAND_HOLD_MS,
  type ErrandAgentInput,
  type ServiceErrandState,
} from "@/lib/aihub/serviceErrands";
import type { HubLiveServiceLink } from "@/lib/runtime/aihub/types";

const agent = (over: Partial<ErrandAgentInput> = {}): ErrandAgentInput => ({
  agentId: "a1",
  currentTool: null,
  working: true,
  ...over,
});

const link = (over: Partial<HubLiveServiceLink>): HubLiveServiceLink => ({
  source: "a1",
  target: "mlx",
  kind: "uses",
  active: true,
  tool: null,
  ageS: 1,
  ...over,
});

describe("computeServiceErrands — confirmation throttle (≥2 polls)", () => {
  it("does not latch an errand on the first poll a candidate appears", () => {
    const { errandsByAgentId, nextState } = computeServiceErrands({
      agents: [agent({ currentTool: "mcp__ailab__ailab_health" })],
      serviceLinks: [],
      previous: {},
      now: 1_000,
    });
    expect(errandsByAgentId).toEqual({});
    expect(nextState.a1.candidate).toBe("server_room");
    expect(nextState.a1.active).toBeNull();
  });

  it("latches once the same candidate is confirmed on the second poll", () => {
    const first = computeServiceErrands({
      agents: [agent({ currentTool: "mcp__ailab__ailab_health" })],
      serviceLinks: [],
      previous: {},
      now: 1_000,
    });
    const second = computeServiceErrands({
      agents: [agent({ currentTool: "mcp__ailab__ailab_health" })],
      serviceLinks: [],
      previous: first.nextState,
      now: 4_000,
    });
    expect(second.errandsByAgentId).toEqual({ a1: "server_room" });
    expect(second.nextState.a1.active).toBe("server_room");
    expect(second.nextState.a1.heldUntil).toBe(4_000 + SERVICE_ERRAND_HOLD_MS);
  });

  it("does not latch when the candidate flips between polls (no ping-pong)", () => {
    const first = computeServiceErrands({
      agents: [agent({ currentTool: "WebSearch" })], // library
      serviceLinks: [],
      previous: {},
      now: 1_000,
    });
    const second = computeServiceErrands({
      agents: [agent({ currentTool: "mcp__ailab__ailab_speak" })], // phone_booth
      serviceLinks: [],
      previous: first.nextState,
      now: 4_000,
    });
    expect(second.errandsByAgentId).toEqual({});
    expect(second.nextState.a1.candidate).toBe("phone_booth");
    expect(second.nextState.a1.active).toBeNull();
  });
});

describe("computeServiceErrands — 20s hold + release", () => {
  const latch = (): ServiceErrandState => {
    const first = computeServiceErrands({
      agents: [agent({ currentTool: "WebSearch" })],
      serviceLinks: [],
      previous: {},
      now: 0,
    });
    const second = computeServiceErrands({
      agents: [agent({ currentTool: "WebSearch" })],
      serviceLinks: [],
      previous: first.nextState,
      now: 3_000,
    });
    expect(second.errandsByAgentId).toEqual({ a1: "library" });
    return second.nextState;
  };

  it("keeps the errand held even when the tool stops mid-visit", () => {
    const held = latch(); // heldUntil = 3000 + 20000
    const mid = computeServiceErrands({
      agents: [agent({ currentTool: null, working: false })], // tool gone
      serviceLinks: [],
      previous: held,
      now: 10_000, // still < heldUntil
    });
    expect(mid.errandsByAgentId).toEqual({ a1: "library" });
    expect(mid.nextState.a1.active).toBe("library");
  });

  it("extends the hold when the same service keeps being used", () => {
    const held = latch(); // heldUntil = 23000
    const extend = computeServiceErrands({
      agents: [agent({ currentTool: "WebSearch" })],
      serviceLinks: [],
      previous: held,
      now: 20_000,
    });
    expect(extend.nextState.a1.heldUntil).toBe(20_000 + SERVICE_ERRAND_HOLD_MS);
  });

  it("releases the errand after the hold expires", () => {
    const held = latch(); // heldUntil = 23000
    const afterExpiry = computeServiceErrands({
      agents: [agent({ currentTool: null, working: false })],
      serviceLinks: [],
      previous: held,
      now: 30_000, // > heldUntil
    });
    expect(afterExpiry.errandsByAgentId).toEqual({});
    expect(afterExpiry.nextState.a1.active).toBeNull();
  });
});

describe("computeServiceErrands — service_link is authoritative", () => {
  it("latches from an active service_link even for a non-working agent", () => {
    const first = computeServiceErrands({
      agents: [agent({ working: false, currentTool: null })],
      serviceLinks: [link({ target: "voice" })],
      previous: {},
      now: 0,
    });
    const second = computeServiceErrands({
      agents: [agent({ working: false, currentTool: null })],
      serviceLinks: [link({ target: "voice" })],
      previous: first.nextState,
      now: 3_000,
    });
    expect(second.errandsByAgentId).toEqual({ a1: "phone_booth" });
  });

  it("ignores currentTool for a non-working agent when no link exists", () => {
    const { nextState } = computeServiceErrands({
      agents: [agent({ working: false, currentTool: "WebSearch" })],
      serviceLinks: [],
      previous: {},
      now: 0,
    });
    expect(nextState.a1.candidate).toBeNull();
  });

  it("prefers the freshest active link that maps to an errand", () => {
    const links = [
      link({ target: "comfyui", ageS: 0 }), // art → glow only (not errand-able)
      link({ target: "mlx", ageS: 5 }), // server_room
    ];
    const first = computeServiceErrands({
      agents: [agent()],
      serviceLinks: links,
      previous: {},
      now: 0,
    });
    // comfyui is freshest but glow-only, so the mlx (server_room) link wins.
    expect(first.nextState.a1.candidate).toBe("server_room");
  });

  it("drops despawned agents from the carried state", () => {
    const first = computeServiceErrands({
      agents: [agent({ agentId: "gone", currentTool: "WebSearch" })],
      serviceLinks: [],
      previous: {},
      now: 0,
    });
    const second = computeServiceErrands({
      agents: [], // agent left the roster
      serviceLinks: [],
      previous: first.nextState,
      now: 3_000,
    });
    expect(second.nextState.gone).toBeUndefined();
  });
});

describe("buildServiceErrandHoldMaps", () => {
  it("splits a flat errand map into per-target hold maps", () => {
    const maps = buildServiceErrandHoldMaps({
      a1: "server_room",
      a2: "phone_booth",
      a3: "library",
      a4: "qa_device",
    });
    expect(maps.serverRoom).toEqual({ a1: true });
    expect(maps.phoneBooth).toEqual({ a2: true });
    expect(maps.library).toEqual({ a3: true });
    expect(maps.qaDevice).toEqual({ a4: true });
  });

  it("returns empty maps for no errands", () => {
    const maps = buildServiceErrandHoldMaps({});
    expect(maps.serverRoom).toEqual({});
    expect(maps.phoneBooth).toEqual({});
    expect(maps.library).toEqual({});
    expect(maps.qaDevice).toEqual({});
  });
});

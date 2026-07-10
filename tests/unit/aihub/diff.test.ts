import { describe, expect, it } from "vitest";

import { diffSnapshots } from "@/lib/runtime/aihub/diff";
import { normalizeHubSnapshot } from "@/lib/runtime/aihub/snapshot";

type RawNode = Record<string, unknown>;

const makeSnapshot = (nodes: RawNode[]) =>
  normalizeHubSnapshot({ nodes, links: [], services: [], service_links: [], generated_at: null });

const node = (id: string, status: string, extra: RawNode = {}): RawNode => ({
  id,
  kind: "session",
  label: id,
  tool: "claude",
  tier: 1,
  status,
  ...extra,
});

type AgentPayload = {
  runId: string;
  sessionKey: string;
  stream: string;
  data: { phase?: string; text?: string };
};

const agentPayload = (payload: unknown): AgentPayload => payload as AgentPayload;

describe("diffSnapshots", () => {
  it("emits a lifecycle start when a node transitions idle → active", () => {
    const prev = makeSnapshot([node("s1", "idle")]);
    const next = makeSnapshot([node("s1", "active")]);
    const frames = diffSnapshots(prev, next, 1);
    const lifecycle = frames.find(
      (frame) => frame.event === "agent" && agentPayload(frame.payload).stream === "lifecycle"
    );
    expect(lifecycle).toBeDefined();
    expect(agentPayload(lifecycle?.payload).data.phase).toBe("start");
    expect(agentPayload(lifecycle?.payload).runId).toBe("hub-run-s1");
    expect(agentPayload(lifecycle?.payload).sessionKey).toBe("agent:s1:main");
  });

  it("emits a lifecycle end when a node transitions active → done", () => {
    const prev = makeSnapshot([node("s1", "active")]);
    const next = makeSnapshot([node("s1", "done")]);
    const frames = diffSnapshots(prev, next, 1);
    const lifecycle = frames.find(
      (frame) => frame.event === "agent" && agentPayload(frame.payload).stream === "lifecycle"
    );
    expect(agentPayload(lifecycle?.payload).data.phase).toBe("end");
  });

  it("emits presence on membership change but no lifecycle for the newly added node", () => {
    const prev = makeSnapshot([node("s1", "active")]);
    const next = makeSnapshot([node("s1", "active"), node("s2", "active")]);
    const frames = diffSnapshots(prev, next, 1);
    expect(frames.filter((frame) => frame.event === "presence")).toHaveLength(1);
    expect(
      frames.some(
        (frame) => frame.event === "agent" && agentPayload(frame.payload).sessionKey === "agent:s2:main"
      )
    ).toBe(false);
  });

  it("does not emit presence when only current_tool changes (tool-only delta)", () => {
    const prev = makeSnapshot([node("s1", "active", { current_tool: "Bash" })]);
    const next = makeSnapshot([node("s1", "active", { current_tool: "Read" })]);
    const frames = diffSnapshots(prev, next, 1);
    expect(frames.some((frame) => frame.event === "presence")).toBe(false);
    const tool = frames.find(
      (frame) => frame.event === "agent" && agentPayload(frame.payload).stream === "tool"
    );
    expect(tool).toBeDefined();
    expect(agentPayload(tool?.payload).data.text).toContain("Read");
  });

  it("dedupes tool frames when current_tool is unchanged", () => {
    const prev = makeSnapshot([node("s1", "active", { current_tool: "Bash" })]);
    const next = makeSnapshot([node("s1", "active", { current_tool: "Bash" })]);
    const frames = diffSnapshots(prev, next, 1);
    expect(frames.some((frame) => frame.event === "agent")).toBe(false);
  });

  it("emits presence when a node flips run-state (active ↔ idle) so status re-infers", () => {
    const prev = makeSnapshot([node("s1", "active")]);
    const next = makeSnapshot([node("s1", "idle")]);
    const frames = diffSnapshots(prev, next, 1);
    expect(frames.filter((frame) => frame.event === "presence")).toHaveLength(1);
  });

  it("assigns incrementing seq numbers starting from seqStart", () => {
    const prev = makeSnapshot([node("s1", "idle")]);
    const next = makeSnapshot([node("s1", "active", { current_tool: "Bash" })]);
    const frames = diffSnapshots(prev, next, 10);
    expect(frames.map((frame) => frame.seq)).toEqual(
      frames.map((_, index) => 10 + index)
    );
  });
});

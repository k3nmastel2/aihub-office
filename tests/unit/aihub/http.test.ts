import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AIHUB_HUB_URL,
  postHubDismiss,
  postHubNudge,
  resolveAihubHubUrl,
} from "@/lib/runtime/aihub/http";

describe("resolveAihubHubUrl", () => {
  it("keeps a valid http(s) hub URL", () => {
    expect(resolveAihubHubUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(resolveAihubHubUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolveAihubHubUrl("https://hub.example.com")).toBe("https://hub.example.com");
  });

  it("strips a trailing slash", () => {
    expect(resolveAihubHubUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  });

  it("coerces a ws/wss gateway URL to the hub default (the T13 corruption)", () => {
    expect(resolveAihubHubUrl("ws://localhost:18789")).toBe(DEFAULT_AIHUB_HUB_URL);
    expect(resolveAihubHubUrl("wss://localhost:18789")).toBe(DEFAULT_AIHUB_HUB_URL);
  });

  it("coerces empty/invalid values to the hub default", () => {
    expect(resolveAihubHubUrl("")).toBe(DEFAULT_AIHUB_HUB_URL);
    expect(resolveAihubHubUrl("   ")).toBe(DEFAULT_AIHUB_HUB_URL);
    expect(resolveAihubHubUrl("not a url")).toBe(DEFAULT_AIHUB_HUB_URL);
  });
});

describe("hub interaction proxy bodies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubFetch = () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true }),
          text: async () => "{}",
        } as unknown as Response;
      }),
    );
    return calls;
  };

  it("nudge posts session_id + message to /api/live/nudge (the hub's contract)", async () => {
    const calls = stubFetch();
    await postHubNudge("http://127.0.0.1:3000", { sessionId: "sess-uuid", message: "hi" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/runtime/aihub");
    expect(calls[0].body.pathname).toBe("/api/live/nudge");
    expect(calls[0].body.body).toEqual({ session_id: "sess-uuid", message: "hi" });
  });

  it("dismiss posts { id: <node id> } to /api/live/dismiss (hub hides by node id, not session_id)", async () => {
    const calls = stubFetch();
    await postHubDismiss("http://127.0.0.1:3000", { nodeId: "f015ccaa-sub-dismiss-me" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.pathname).toBe("/api/live/dismiss");
    expect(calls[0].body.body).toEqual({ id: "f015ccaa-sub-dismiss-me" });
  });
});

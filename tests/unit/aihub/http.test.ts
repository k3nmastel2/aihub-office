import { describe, expect, it } from "vitest";

import { DEFAULT_AIHUB_HUB_URL, resolveAihubHubUrl } from "@/lib/runtime/aihub/http";

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

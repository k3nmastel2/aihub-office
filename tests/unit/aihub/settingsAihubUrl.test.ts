import { describe, expect, it } from "vitest";

import { resolveStudioGatewayProfiles } from "@/lib/studio/settings";

// Guards the aihub URL self-heal in resolveStudioGatewayProfiles: a persisted aihub profile
// (or the shared top-level gateway.url) that carries a ws:// gateway URL must resolve to the
// HTTP hub default instead of dialing the WebSocket gateway. See triage T13/T8b.
describe("resolveStudioGatewayProfiles — aihub URL coercion", () => {
  it("coerces a ws:// aihub profile URL to the http hub default", () => {
    const resolved = resolveStudioGatewayProfiles({
      gateway: {
        url: "ws://localhost:18789",
        token: "",
        adapterType: "aihub",
        profiles: {
          aihub: { url: "ws://localhost:18789", token: "" },
        },
      },
    });
    expect(resolved.selectedAdapterType).toBe("aihub");
    expect(resolved.profiles.aihub?.url).toBe("http://127.0.0.1:3000");
    expect(resolved.activeProfile.url).toBe("http://127.0.0.1:3000");
  });

  it("keeps a valid http aihub profile URL untouched", () => {
    const resolved = resolveStudioGatewayProfiles({
      gateway: {
        url: "http://localhost:3000",
        token: "",
        adapterType: "aihub",
        profiles: {
          aihub: { url: "http://localhost:3000", token: "" },
        },
      },
    });
    expect(resolved.profiles.aihub?.url).toBe("http://localhost:3000");
  });
});

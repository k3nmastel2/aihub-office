import { describe, expect, it } from "vitest";

import {
  mapServiceIdToObject,
  mapServiceIdToErrand,
  mapToolToObject,
  mapToolToErrand,
  objectKindToErrand,
} from "@/lib/aihub/serviceMap";

describe("mapServiceIdToObject", () => {
  it("maps inference services to the server room", () => {
    expect(mapServiceIdToObject("mlx")).toBe("server_room");
    expect(mapServiceIdToObject("ollama")).toBe("server_room");
    expect(mapServiceIdToObject("MLX")).toBe("server_room"); // case-insensitive
  });

  it("maps comfyui to the art studio", () => {
    expect(mapServiceIdToObject("comfyui")).toBe("art");
  });

  it("maps voice to the phone booth", () => {
    expect(mapServiceIdToObject("voice")).toBe("phone_booth");
  });

  it("maps memory / graph / recall to the library", () => {
    expect(mapServiceIdToObject("memory")).toBe("library");
    expect(mapServiceIdToObject("graph")).toBe("library");
    expect(mapServiceIdToObject("recall")).toBe("library");
  });

  it("maps browser/chrome to the QA device rack", () => {
    expect(mapServiceIdToObject("browser")).toBe("qa_device");
    expect(mapServiceIdToObject("chrome")).toBe("qa_device");
  });

  it("maps the hub itself to the ATM", () => {
    expect(mapServiceIdToObject("hub")).toBe("atm");
  });

  it("returns null for unknown / empty service ids", () => {
    expect(mapServiceIdToObject("totally-unknown")).toBeNull();
    expect(mapServiceIdToObject("")).toBeNull();
    expect(mapServiceIdToObject(null)).toBeNull();
    expect(mapServiceIdToObject(undefined)).toBeNull();
  });
});

describe("objectKindToErrand", () => {
  it("returns errand-able objects verbatim", () => {
    expect(objectKindToErrand("server_room")).toBe("server_room");
    expect(objectKindToErrand("phone_booth")).toBe("phone_booth");
    expect(objectKindToErrand("library")).toBe("library");
    expect(objectKindToErrand("qa_device")).toBe("qa_device");
  });

  it("returns null for glow-only objects (art + atm have no walk-to route)", () => {
    expect(objectKindToErrand("art")).toBeNull();
    expect(objectKindToErrand("atm")).toBeNull();
    expect(objectKindToErrand(null)).toBeNull();
  });
});

describe("mapServiceIdToErrand", () => {
  it("composes id→object→errand", () => {
    expect(mapServiceIdToErrand("mlx")).toBe("server_room");
    expect(mapServiceIdToErrand("voice")).toBe("phone_booth");
    expect(mapServiceIdToErrand("recall")).toBe("library");
    expect(mapServiceIdToErrand("comfyui")).toBeNull(); // art = glow only
    expect(mapServiceIdToErrand("hub")).toBeNull(); // atm = glow only
  });
});

describe("mapToolToObject / mapToolToErrand", () => {
  it("routes ailab voice tools to the phone booth", () => {
    expect(mapToolToObject("mcp__ailab__ailab_speak")).toBe("phone_booth");
    expect(mapToolToObject("mcp__ailab__ailab_tts")).toBe("phone_booth");
    expect(mapToolToErrand("mcp__ailab__ailab_speak")).toBe("phone_booth");
  });

  it("routes image/3d ailab tools to the art studio (glow only)", () => {
    expect(mapToolToObject("mcp__ailab__ailab_generate_image")).toBe("art");
    expect(mapToolToObject("mcp__ailab__ailab_image_to_3d")).toBe("art");
    expect(mapToolToErrand("mcp__ailab__ailab_generate_image")).toBeNull();
  });

  it("routes browser automation tools to the QA lab", () => {
    expect(mapToolToObject("mcp__claude-in-chrome__navigate")).toBe("qa_device");
    expect(mapToolToErrand("mcp__claude-in-chrome__navigate")).toBe("qa_device");
  });

  it("routes web research tools to the library", () => {
    expect(mapToolToObject("WebFetch")).toBe("library");
    expect(mapToolToObject("WebSearch")).toBe("library");
    expect(mapToolToErrand("WebSearch")).toBe("library");
  });

  it("falls back generic ailab / model tools to the server room", () => {
    expect(mapToolToObject("mcp__ailab__ailab_health")).toBe("server_room");
    expect(mapToolToErrand("mcp__ailab__ailab_health")).toBe("server_room");
  });

  it("returns null for tools with no service mapping", () => {
    expect(mapToolToObject("Bash")).toBeNull();
    expect(mapToolToObject("Edit")).toBeNull();
    expect(mapToolToObject(null)).toBeNull();
  });

  it("prefers the more specific voice rule over the generic ailab bucket", () => {
    // ailab_speak contains "ailab" (server_room rule) but the voice rule is earlier.
    expect(mapToolToObject("mcp__ailab__ailab_speak")).toBe("phone_booth");
  });
});

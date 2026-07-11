import { describe, expect, it } from "vitest";

import { toWorld } from "@/features/retro-office/core/geometry";
import {
  AIHUB_NAMED_ZONE_ANCHORS,
  buildAihubNamedZonePresets,
  buildAihubZonePreset,
} from "@/lib/aihub/cameraZones";

describe("buildAihubZonePreset", () => {
  it("targets the zone floor point (from toWorld) at standing height", () => {
    const [wx, , wz] = toWorld(930, 640);
    const preset = buildAihubZonePreset(930, 640);
    expect(preset.target[0]).toBeCloseTo(wx);
    expect(preset.target[1]).toBeCloseTo(0.45);
    expect(preset.target[2]).toBeCloseTo(wz);
  });

  it("places the camera up and back from the target", () => {
    const preset = buildAihubZonePreset(500, 500, 100);
    expect(preset.pos[1]).toBeGreaterThan(preset.target[1]); // above floor
    expect(preset.pos[0]).toBeGreaterThan(preset.target[0]); // offset to the side
    expect(preset.pos[2]).toBeGreaterThan(preset.target[2]); // offset back
    expect(preset.zoom).toBe(100);
  });

  it("defaults the zoom when not given", () => {
    expect(buildAihubZonePreset(0, 0).zoom).toBe(92);
  });
});

describe("buildAihubNamedZonePresets", () => {
  it("returns one entry per named zone with matching ids/labels", () => {
    const entries = buildAihubNamedZonePresets();
    expect(entries.map((e) => e.id)).toEqual(
      AIHUB_NAMED_ZONE_ANCHORS.map((z) => z.id),
    );
    expect(entries.every((e) => e.label.length > 0)).toBe(true);
  });

  it("honors each zone's configured zoom", () => {
    const entries = buildAihubNamedZonePresets();
    const server = entries.find((e) => e.id === "serverRoom");
    expect(server?.preset.zoom).toBe(88);
  });

  it("produces distinct targets per zone", () => {
    const targets = buildAihubNamedZonePresets().map((e) => e.preset.target.join(","));
    expect(new Set(targets).size).toBe(targets.length);
  });
});

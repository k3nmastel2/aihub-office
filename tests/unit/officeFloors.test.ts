import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACTIVE_FLOOR_ID,
  getOfficeFloor,
  getAdjacentEnabledOfficeFloorId,
  listEnabledOfficeFloors,
  listOfficeFloorsForProvider,
  listOfficeFloorsForZone,
  OFFICE_FLOORS,
  resolveActiveOfficeFloorId,
} from "@/lib/office/floors";

describe("office floor registry", () => {
  it("defines the canonical floor order", () => {
    expect(OFFICE_FLOORS.map((floor) => floor.id)).toEqual([
      "lobby",
      "openclaw-ground",
      "hermes-first",
      "local-runtime",
      "claw3d-runtime",
      "aihub-live",
      "custom-second",
      "training",
      "traders-floor",
      "campus",
    ]);
  });

  it("looks up floors by id", () => {
    expect(getOfficeFloor("hermes-first")).toMatchObject({
      label: "Hermes Floor",
      shortLabel: "Hermes",
      provider: "hermes",
      kind: "runtime",
      zone: "building",
      enabled: true,
      sortOrder: 20,
      runtimeProfileId: "hermes-default",
    });
  });

  it("lists only enabled floors by default (demo lobby retired)", () => {
    expect(listEnabledOfficeFloors().map((floor) => floor.id)).toEqual([
      "openclaw-ground",
      "hermes-first",
      "local-runtime",
      "claw3d-runtime",
      "aihub-live",
      "custom-second",
    ]);
  });

  it("lists floors for a provider", () => {
    expect(listOfficeFloorsForProvider("demo").map((floor) => floor.id)).toEqual([
      "lobby",
      "training",
      "traders-floor",
      "campus",
    ]);
  });

  it("groups floors by zone for building navigation", () => {
    expect(listOfficeFloorsForZone("building").map((floor) => floor.id)).toEqual([
      "lobby",
      "openclaw-ground",
      "hermes-first",
      "local-runtime",
      "claw3d-runtime",
      "aihub-live",
      "custom-second",
      "training",
      "traders-floor",
    ]);
    expect(listOfficeFloorsForZone("outside").map((floor) => floor.id)).toEqual(["campus"]);
  });

  it("resolves active floor ids against enabled floors (aihub-live is home)", () => {
    expect(DEFAULT_ACTIVE_FLOOR_ID).toBe("aihub-live");
    expect(resolveActiveOfficeFloorId("hermes-first")).toBe("hermes-first");
    // Disabled floors (training) and the retired demo lobby fall back to the home floor.
    expect(resolveActiveOfficeFloorId("training")).toBe("aihub-live");
    expect(resolveActiveOfficeFloorId("lobby")).toBe("aihub-live");
    expect(resolveActiveOfficeFloorId(null)).toBe("aihub-live");
  });

  it("cycles across enabled floors only (lobby excluded)", () => {
    expect(getAdjacentEnabledOfficeFloorId("aihub-live", 1)).toBe("custom-second");
    expect(getAdjacentEnabledOfficeFloorId("aihub-live", -1)).toBe("claw3d-runtime");
    // Wraps around the enabled set, which no longer contains the lobby.
    expect(getAdjacentEnabledOfficeFloorId("openclaw-ground", -1)).toBe("custom-second");
  });
});

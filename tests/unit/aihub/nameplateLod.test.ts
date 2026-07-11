import { describe, expect, it } from "vitest";

import {
  NAMEPLATE_LOD_FAR,
  NAMEPLATE_LOD_NEAR,
  resolveNameplateLod,
} from "@/lib/aihub/nameplateLod";

describe("resolveNameplateLod", () => {
  it("is fully visible at or within the near distance", () => {
    expect(resolveNameplateLod(0)).toEqual({ visible: true, opacity: 1 });
    expect(resolveNameplateLod(NAMEPLATE_LOD_NEAR)).toEqual({ visible: true, opacity: 1 });
  });

  it("is hidden at or beyond the far distance", () => {
    expect(resolveNameplateLod(NAMEPLATE_LOD_FAR)).toEqual({ visible: false, opacity: 0 });
    expect(resolveNameplateLod(NAMEPLATE_LOD_FAR + 50)).toEqual({
      visible: false,
      opacity: 0,
    });
  });

  it("fades linearly across the band", () => {
    const mid = (NAMEPLATE_LOD_NEAR + NAMEPLATE_LOD_FAR) / 2;
    const lod = resolveNameplateLod(mid);
    expect(lod.visible).toBe(true);
    expect(lod.opacity).toBeCloseTo(0.5);
  });

  it("monotonically decreases opacity as distance grows in the band", () => {
    const a = resolveNameplateLod(NAMEPLATE_LOD_NEAR + 2).opacity;
    const b = resolveNameplateLod(NAMEPLATE_LOD_NEAR + 8).opacity;
    expect(a).toBeGreaterThan(b);
  });

  it("treats non-finite distance as fully visible (defensive)", () => {
    expect(resolveNameplateLod(Number.NaN)).toEqual({ visible: true, opacity: 1 });
  });

  it("honors custom near/far bounds", () => {
    expect(resolveNameplateLod(5, 4, 10).visible).toBe(true);
    expect(resolveNameplateLod(3, 4, 10)).toEqual({ visible: true, opacity: 1 });
  });
});

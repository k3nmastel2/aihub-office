import type { FacingPoint } from "@/features/retro-office/core/types";

// Front-door anchor for aihub agents. Phase 9 added a real south perimeter wall with a single
// entrance door gap centered at canvas x≈820 (AIHUB_ENTRANCE_CENTER_X in furnitureDefaults); the
// wall sits at y≈710. Agents now spawn just OUTSIDE the door (y=740, on the entry apron) and walk
// IN through the gap — so the entrance is the actual, visible way in/out and the door swings as
// they pass (item 7 / item 9). Leaving agents route back to the same apron and fade there. A*
// `findFree` snaps to the nearest open cell, so exact placement stays forgiving.
export const AIHUB_DOOR_ENTRANCE: FacingPoint = {
  x: 820,
  y: 780,
  facing: -Math.PI / 2,
};

export const AIHUB_DOOR_EXIT: FacingPoint = {
  x: 820,
  y: 780,
  facing: Math.PI / 2,
};

// Opacity ramp duration for a leaving agent's fade-out (renderer-side, per-frame).
// Comfortably longer than the ~3s live poll cadence's worst-case latency so the
// walk-to-door + dissolve stays visible for at least one full observed frame.
export const AIHUB_LEAVING_FADE_MS = 3_000;

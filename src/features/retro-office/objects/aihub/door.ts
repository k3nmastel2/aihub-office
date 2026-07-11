import type { FacingPoint } from "@/features/retro-office/core/types";

// Front-door anchor for aihub agents. New agents spawn here and walk in to their
// desk/roam target (A* provides the walk-in for free); leaving agents route back
// here before fading out. Bottom-center open floor of the default office layout —
// alongside the proven-navigable janitor bottom stops. A* `findFree` snaps to the
// nearest open cell, so exact placement is forgiving; the aihub layout preset
// (Phase 3) can override this.
export const AIHUB_DOOR_ENTRANCE: FacingPoint = {
  x: 820,
  y: 660,
  facing: -Math.PI / 2,
};

export const AIHUB_DOOR_EXIT: FacingPoint = {
  x: 820,
  y: 660,
  facing: Math.PI / 2,
};

// Opacity ramp duration for a leaving agent's fade-out (renderer-side, per-frame).
export const AIHUB_LEAVING_FADE_MS = 1_500;

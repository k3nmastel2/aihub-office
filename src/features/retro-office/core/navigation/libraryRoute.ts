import type { LibraryRoute } from "@/features/retro-office/core/types";

// The reading spot inside the aihub library room (see AIHUB_LIBRARY_ITEMS in furnitureDefaults;
// Phase 9 made the library a walled room with a south door at x655-725). The route stays a single
// straight walk-to — A* threads the (passable) door automatically, so no staged approach is needed.
// Target sits just inside the doorway, in front of the reading nook, facing the north bookshelves.
export const LIBRARY_TARGET = {
  x: 690,
  y: 200,
  facing: Math.PI,
};

export const resolveLibraryRoute = (
  _x: number,
  _y: number,
): LibraryRoute => ({
  stage: "reading",
  targetX: LIBRARY_TARGET.x,
  targetY: LIBRARY_TARGET.y,
  facing: LIBRARY_TARGET.facing,
});

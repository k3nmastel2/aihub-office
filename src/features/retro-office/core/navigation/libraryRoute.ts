import type { LibraryRoute } from "@/features/retro-office/core/types";

// The reading spot in front of the aihub library bookshelves (see AIHUB_LIBRARY_ITEMS in
// furnitureDefaults). Open floor — no walled door — so the route is a single straight walk-to,
// unlike the server-room / phone-booth staged door routes.
export const LIBRARY_TARGET = {
  x: 560,
  y: 200,
  facing: 0,
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

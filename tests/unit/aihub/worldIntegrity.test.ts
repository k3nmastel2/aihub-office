import { describe, expect, it } from "vitest";

import {
  AIHUB_HUDDLE_TABLES,
  materializeDefaults,
} from "@/features/retro-office/core/furnitureDefaults";
import {
  astar,
  buildNavGrid,
  getDeskLocations,
  resolvePingPongTargets,
} from "@/features/retro-office/core/navigation";
import { LIBRARY_TARGET } from "@/features/retro-office/core/navigation/libraryRoute";
import { AIHUB_DOOR_ENTRANCE } from "@/features/retro-office/objects/aihub/door";

// Phase 9 world-integrity guard (Ken soak item 7). Builds the real aihub nav grid and proves that
// (a) every functional zone is reachable from the entrance so no walk-to breaks, and (b) the new
// south perimeter wall contains agents — its only opening is the entrance door gap.
//
// NOTE: the east-wing gym + QA lab are intentionally NOT asserted here. Their doors open onto the
// 56px gym↔QA hall, whose south junction is padding-sealed by the (upstream, unchanged) gym/QA
// bottom walls — a pre-existing tightness tracked under T25. The server room (the primary service
// errand) IS reachable via its staged route; the QA HUD + health glow render regardless of walk-to.

const items = materializeDefaults("aihub");
const grid = buildNavGrid(items);

const pathLen = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  astar(from.x, from.y, to.x, to.y, grid).length;
const reachable = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  pathLen(from, to) > 0;

const ENTRANCE = { x: AIHUB_DOOR_ENTRANCE.x, y: AIHUB_DOOR_ENTRANCE.y };

describe("aihub world integrity — reachability", () => {
  it("agents can walk in from the entrance apron to every seated desk", () => {
    const desks = getDeskLocations(items);
    expect(desks).toHaveLength(24); // 6 pods × 4 desks
    for (const desk of desks) {
      expect(reachable(ENTRANCE, desk), `entrance → desk ${desk.x},${desk.y}`).toBe(true);
    }
  });

  it("reaches the remodeled zones (library, kitchen, eating, lounge, huddles)", () => {
    const zonePoints: Record<string, { x: number; y: number }> = {
      library: { x: LIBRARY_TARGET.x, y: LIBRARY_TARGET.y }, // research room (item 6)
      kitchen: { x: 905, y: 120 }, // in front of the kitchen counter (item 3)
      eating: { x: 892, y: 284 }, // break-room eating area (item 4)
      loungeCouch: { x: 1620, y: 350 }, // couch cluster near ping-pong (item 2)
    };
    for (const [name, point] of Object.entries(zonePoints)) {
      expect(reachable(ENTRANCE, point), `entrance → ${name}`).toBe(true);
    }
    for (const table of AIHUB_HUDDLE_TABLES) {
      const seat = { x: table.center.x + 48, y: table.center.y };
      expect(reachable(ENTRANCE, seat), `entrance → huddle ${table.index}`).toBe(true);
    }
  });

  it("both ping-pong player slots are reachable open floor (item 1)", () => {
    const pingPong = items.find((item) => item.type === "pingpong");
    expect(pingPong).toBeDefined();
    const [slotA, slotB] = resolvePingPongTargets(pingPong!);
    // Slots must clear the QA lab east wall (QA_LAB_END_X = 1534) so nobody plays through it.
    expect(slotA.x).toBeGreaterThan(1542);
    expect(slotB.x).toBeGreaterThan(1542);
    expect(reachable(ENTRANCE, slotA), "entrance → ping-pong slot A").toBe(true);
    expect(reachable(ENTRANCE, slotB), "entrance → ping-pong slot B").toBe(true);
  });

  it("reaches the server room via its door approach (staged mlx/ollama errand)", () => {
    // The server-room door faces the bullpen; the staged resolveServerRoomRoute threads the door
    // from this approach cell, so asserting the approach is reachable is what the errand needs.
    expect(reachable(ENTRANCE, { x: 280, y: 630 })).toBe(true);
  });
});

describe("aihub world integrity — containment (item 7)", () => {
  const INTERIOR = { x: 300, y: 640 }; // bullpen floor, north of the south wall

  it("the south wall's only opening is the entrance door gap", () => {
    // Straight south through the entrance gap is a short hop...
    const throughGap = pathLen({ x: 820, y: 690 }, { x: 820, y: 800 });
    // ...but behind a solid wall segment the same short vertical hop must detour to the gap,
    // proving the wall actually blocks (a missing wall would make both equally short).
    const behindWall = pathLen({ x: 300, y: 690 }, { x: 300, y: 800 });
    expect(throughGap).toBeGreaterThan(0);
    expect(behindWall).toBeGreaterThan(0);
    expect(behindWall).toBeGreaterThan(throughGap * 3);
  });

  it("does not seal the far-east lounge behind the east wing", () => {
    // Regression guard: a flat south wall would trap agents out of the lounge.
    expect(reachable(INTERIOR, { x: 1620, y: 350 })).toBe(true);
  });
});

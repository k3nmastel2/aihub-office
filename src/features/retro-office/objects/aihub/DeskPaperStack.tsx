import { useMemo } from "react";

import { toWorld } from "@/features/retro-office/core/geometry";
import type {
  FurnitureItem,
  OfficeAgent,
} from "@/features/retro-office/core/types";

// A small stack of papers on each occupied aihub desk, its height scaled by the seated
// agent's outstanding task count (pending + in_progress, capped in computeDeskStackCount).
// A busy agent's desk grows a visible in-tray; an agent with no open tasks has a clean desk.
// Deterministic (index-derived jitter, no Date.now/random) so it never churns re-renders.

// Instrumentation toggle (kept for future placement debugging; off in shipped builds).
const DEBUG_PAPER_STACK = false;

const DESK_SURFACE_Y = 0.61; // matches the computer clutter offset (papers sit on the desk)
const SHEET_HEIGHT = 0.04;
const SHEET_GAP = 0.015;
const SHEET_W = 0.28;
const SHEET_D = 0.34;
const PAPER_COLORS = ["#fbf7ea", "#f1ead6", "#fdfbf2"];

// Offset (canvas units) from the desk's origin to a clear spot ON the desk surface, in the
// same row as the on-desk dressing that renders correctly (monitor +20,-13; keyboard +30,-5;
// mouse +52,-5). Sitting between keyboard and mouse at y=-5 keeps the stack on the surface;
// the previous negative-x offset landed it off the desk edge (Phase-4 render defect).
const PAPER_OFFSET_X = 42;
const PAPER_OFFSET_Y = -5;

type DeskStack = {
  deskUid: string;
  wx: number;
  wz: number;
  count: number;
};

export function AihubDeskPaperStacks({
  deskItems,
  deskAssignmentByDeskUid,
  agents,
  visible,
}: {
  deskItems: FurnitureItem[];
  deskAssignmentByDeskUid: Record<string, string>;
  agents: OfficeAgent[];
  visible: boolean;
}) {
  const stacks = useMemo<DeskStack[]>(() => {
    if (!visible) return [];
    const stackCountById = new Map(
      agents.map((agent) => [agent.id, agent.deskStackCount ?? 0]),
    );
    const result: DeskStack[] = [];
    for (const desk of deskItems) {
      const agentId = deskAssignmentByDeskUid[desk._uid];
      if (!agentId) continue;
      const count = stackCountById.get(agentId) ?? 0;
      if (count <= 0) continue;
      const [wx, , wz] = toWorld(desk.x + PAPER_OFFSET_X, desk.y + PAPER_OFFSET_Y);
      result.push({ deskUid: desk._uid, wx, wz, count });
    }
    if (DEBUG_PAPER_STACK) {
      // eslint-disable-next-line no-console
      console.log(
        `[aihub-paper-stack] deskItems=${deskItems.length} assigned=${
          Object.keys(deskAssignmentByDeskUid).length
        } stacks=${result.length}`,
        result.slice(0, 6),
      );
    }
    return result;
  }, [agents, deskAssignmentByDeskUid, deskItems, visible]);

  if (!visible || stacks.length === 0) return null;

  return (
    <group>
      {stacks.map((stack) => (
        <group key={`aihub-paper-${stack.deskUid}`} position={[stack.wx, 0, stack.wz]}>
          {DEBUG_PAPER_STACK ? (
            // TEMP bright marker at the stack base to confirm on-desk placement + height.
            <mesh position={[0, DESK_SURFACE_Y + 0.15, 0]}>
              <boxGeometry args={[0.12, 0.3, 0.12]} />
              <meshBasicMaterial color="#ff00ff" />
            </mesh>
          ) : null}
          {Array.from({ length: stack.count }).map((_, sheetIndex) => {
            const y =
              DESK_SURFACE_Y +
              SHEET_HEIGHT / 2 +
              sheetIndex * (SHEET_HEIGHT + SHEET_GAP);
            // Deterministic per-sheet jitter for a hand-stacked look (no random → no churn).
            const yaw = ((sheetIndex * 37) % 13) * 0.012 - 0.078;
            const nudgeX = (((sheetIndex * 53) % 7) - 3) * 0.008;
            const nudgeZ = (((sheetIndex * 29) % 5) - 2) * 0.008;
            return (
              <mesh
                key={sheetIndex}
                position={[nudgeX, y, nudgeZ]}
                rotation={[0, yaw, 0]}
                castShadow
              >
                <boxGeometry args={[SHEET_W, SHEET_HEIGHT, SHEET_D]} />
                <meshStandardMaterial
                  color={PAPER_COLORS[sheetIndex % PAPER_COLORS.length]}
                  roughness={0.85}
                  metalness={0}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

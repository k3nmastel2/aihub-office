import { useMemo } from "react";

import { SCALE } from "@/features/retro-office/core/constants";
import { toWorld } from "@/features/retro-office/core/geometry";
import type {
  FurnitureItem,
  OfficeAgent,
} from "@/features/retro-office/core/types";

// A small stack of papers on each occupied aihub desk, its height scaled by the seated
// agent's outstanding task count (pending + in_progress, capped in computeDeskStackCount).
// A busy agent's desk grows a visible in-tray; an agent with no open tasks has a clean desk.
// Deterministic (index-derived jitter, no Date.now/random) so it never churns re-renders.

const DESK_SURFACE_Y = 0.61; // matches the computer clutter offset (papers sit on the desk)
const SHEET_HEIGHT = 0.016;
const SHEET_GAP = 0.006;
const SHEET_W = 0.15;
const SHEET_D = 0.19;
const PAPER_COLORS = ["#f5f0e1", "#efe8d6", "#f7f2e6"];

// Placed to the left-front of the desk so the stack doesn't collide with the centered monitor.
const PAPER_OFFSET_X = -22;
const PAPER_OFFSET_Y = 8;

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
    return result;
  }, [agents, deskAssignmentByDeskUid, deskItems, visible]);

  if (!visible || stacks.length === 0) return null;

  return (
    <group>
      {stacks.map((stack) => (
        <group key={`aihub-paper-${stack.deskUid}`} position={[stack.wx, 0, stack.wz]}>
          {Array.from({ length: stack.count }).map((_, sheetIndex) => {
            const y =
              DESK_SURFACE_Y +
              SHEET_HEIGHT / 2 +
              sheetIndex * (SHEET_HEIGHT + SHEET_GAP);
            // Deterministic per-sheet jitter for a hand-stacked look (no random → no churn).
            const yaw = ((sheetIndex * 37) % 13) * 0.012 - 0.078;
            const nudgeX = (((sheetIndex * 53) % 7) - 3) * 0.004 * SCALE * 40;
            const nudgeZ = (((sheetIndex * 29) % 5) - 2) * 0.004 * SCALE * 40;
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

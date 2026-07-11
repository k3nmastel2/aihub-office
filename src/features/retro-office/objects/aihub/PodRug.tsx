import { useMemo } from "react";

import { SCALE } from "@/features/retro-office/core/constants";
import {
  AIHUB_POD_LAYOUTS,
  type AihubPodLayout,
} from "@/features/retro-office/core/furnitureDefaults";
import { toWorld } from "@/features/retro-office/core/geometry";
import type { OfficeAgent } from "@/features/retro-office/core/types";

// Flat tinted plane under each occupied session pod. The tint is the pod anchor agent's
// color (a stable per-session hash), so each session's team reads as one colored cluster.
// Empty pods render nothing; the rug retires the moment a pod's desks all clear.

const RUG_ELEVATION = 0.02; // just above the office floor to avoid z-fighting
const RUG_FALLBACK_TINT = "#64748b";
const RUG_OPACITY = 0.42;

type OccupiedPod = {
  pod: AihubPodLayout;
  tint: string;
};

export function AihubPodRugs({
  agents,
  deskAssignmentByDeskUid,
  sessionRootByAgentId = {},
  visible,
}: {
  agents: OfficeAgent[];
  deskAssignmentByDeskUid: Record<string, string>;
  // Phase 7d: subagent id → its session lead. A pod anchored by a subagent tints by the lead's
  // color so a session spanning several pods reads as one colored team.
  sessionRootByAgentId?: Record<string, string>;
  visible: boolean;
}) {
  const occupiedPods = useMemo<OccupiedPod[]>(() => {
    if (!visible) return [];
    const colorById = new Map(agents.map((agent) => [agent.id, agent.color]));
    const occupied: OccupiedPod[] = [];
    for (const pod of AIHUB_POD_LAYOUTS) {
      const anchorAgentId =
        deskAssignmentByDeskUid[pod.leadDeskUid] ??
        pod.memberDeskUids
          .map((uid) => deskAssignmentByDeskUid[uid])
          .find((id) => Boolean(id));
      if (!anchorAgentId) continue; // empty pod → no rug
      const tintAgentId = sessionRootByAgentId[anchorAgentId] ?? anchorAgentId;
      occupied.push({
        pod,
        tint: colorById.get(tintAgentId) ?? RUG_FALLBACK_TINT,
      });
    }
    return occupied;
  }, [agents, deskAssignmentByDeskUid, sessionRootByAgentId, visible]);

  if (!visible || occupiedPods.length === 0) return null;

  return (
    <group>
      {occupiedPods.map(({ pod, tint }) => {
        const [wx, , wz] = toWorld(pod.center.x, pod.center.y);
        return (
          <mesh
            key={`aihub-pod-rug-${pod.podIndex}`}
            position={[wx, RUG_ELEVATION, wz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[pod.size.w * SCALE, pod.size.h * SCALE]} />
            <meshStandardMaterial
              color={tint}
              transparent
              opacity={RUG_OPACITY}
              roughness={0.9}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";

import { SCALE } from "@/features/retro-office/core/constants";
import { toWorld } from "@/features/retro-office/core/geometry";
import {
  mapServiceIdToObject,
  type ServiceObjectKind,
} from "@/lib/aihub/serviceMap";
import type {
  HubLiveService,
  HubLiveServiceLink,
} from "@/lib/runtime/aihub/types";

// Health glow under each service's mapped world object (aihub floor only). A service that is
// online gets a soft green halo; offline gets red; a service actively in use by an agent
// (an active service_link) pulses brighter. Objects with no live service render nothing, so
// the glows appear only when the hub actually reports services — honest, not decorative.
//
// Anchors mirror the aihub furniture preset (furnitureDefaults.ts AIHUB_STATIC_ITEMS): the
// glow sits on the floor under the object it represents.

const GLOW_ELEVATION = 0.03; // just above the floor / pod rugs to avoid z-fighting
const GLOW_INNER_RADIUS = 26; // canvas units
const GLOW_OUTER_RADIUS = 52; // canvas units

const COLOR_ONLINE = "#22c55e";
const COLOR_OFFLINE = "#ef4444";

// Canvas-coord anchor for each mapped object kind (center of the represented furniture).
const SERVICE_OBJECT_ANCHORS: Record<ServiceObjectKind, { x: number; y: number }> = {
  server_room: { x: 95, y: 615 }, // server racks + terminal (bottom-left room)
  art: { x: 278, y: 120 }, // easels (art room)
  phone_booth: { x: 1050, y: 190 }, // phone booth appliance
  library: { x: 545, y: 75 }, // bookshelves (research zone)
  qa_device: { x: 1454, y: 148 }, // QA lab device racks
  atm: { x: 430, y: 210 }, // ATM (hub analytics)
};

type ObjectGlow = {
  kind: ServiceObjectKind;
  online: boolean;
  inUse: boolean;
};

const isServiceOnline = (service: HubLiveService): boolean => {
  const status = service.status.trim().toLowerCase();
  return status === "online" || status === "up" || status === "healthy" || status === "ready";
};

export function AihubServiceGlows({
  services,
  serviceLinks,
  visible,
}: {
  services: HubLiveService[];
  serviceLinks: HubLiveServiceLink[];
  visible: boolean;
}) {
  const glows = useMemo<ObjectGlow[]>(() => {
    if (!visible || services.length === 0) return [];
    const inUseServiceIds = new Set(
      serviceLinks.filter((link) => link.active).map((link) => link.target),
    );
    // Aggregate services onto their object (mlx + ollama both map to the server room):
    // the object is online if any mapped service is online, in-use if any is in use.
    const byObject = new Map<ServiceObjectKind, ObjectGlow>();
    for (const service of services) {
      const kind = mapServiceIdToObject(service.id);
      if (!kind) continue;
      const online = isServiceOnline(service);
      const inUse = inUseServiceIds.has(service.id);
      const prev = byObject.get(kind);
      byObject.set(kind, {
        kind,
        online: (prev?.online ?? false) || online,
        inUse: (prev?.inUse ?? false) || inUse,
      });
    }
    return [...byObject.values()];
  }, [services, serviceLinks, visible]);

  const materialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const inUseFlags = useRef<boolean[]>([]);
  inUseFlags.current = glows.map((glow) => glow.inUse);

  // Gentle pulse: in-use objects breathe brighter; idle-but-present objects hold a soft glow.
  useFrame(({ clock }) => {
    if (glows.length === 0) return;
    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    for (let i = 0; i < materialRefs.current.length; i += 1) {
      const material = materialRefs.current[i];
      if (!material) continue;
      const base = 0.35;
      material.emissiveIntensity = inUseFlags.current[i]
        ? base + 0.9 * pulse
        : base;
    }
  });

  if (!visible || glows.length === 0) return null;

  return (
    <group>
      {glows.map((glow, index) => {
        const anchor = SERVICE_OBJECT_ANCHORS[glow.kind];
        const [wx, , wz] = toWorld(anchor.x, anchor.y);
        const color = glow.online ? COLOR_ONLINE : COLOR_OFFLINE;
        return (
          <mesh
            key={`aihub-service-glow-${glow.kind}`}
            position={[wx, GLOW_ELEVATION, wz]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry
              args={[
                GLOW_INNER_RADIUS * SCALE,
                GLOW_OUTER_RADIUS * SCALE,
                40,
              ]}
            />
            <meshStandardMaterial
              ref={(material) => {
                materialRefs.current[index] = material;
              }}
              color={color}
              emissive={color}
              emissiveIntensity={0.35}
              transparent
              opacity={glow.online ? 0.55 : 0.4}
              roughness={0.8}
              metalness={0}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Per-zone camera-jump presets for the aihub office (Phase 7d / T24).
//
// The office already ships Overview / Front-desk / Lounge presets; this adds one-click jumps to
// each aihub work zone (Server Room, Library, QA Lab, Kitchen) plus the six session pods. Pure:
// a preset is derived from a zone's canvas anchor via the same `toWorld` transform the ping-pong
// and ATM camera jumps use, so the framing stays correct if the office scale changes.

import { toWorld } from "@/features/retro-office/core/geometry";

export type ZoneCameraPreset = {
  pos: [number, number, number];
  target: [number, number, number];
  zoom: number;
};

export type AihubZoneAnchor = {
  id: string;
  label: string;
  cx: number;
  cy: number;
  zoom?: number;
};

// Canvas anchors for the named zones (centers of the aihub server room / library / QA lab /
// kitchen furniture clusters in `furnitureDefaults`).
export const AIHUB_NAMED_ZONE_ANCHORS: readonly AihubZoneAnchor[] = [
  { id: "serverRoom", label: "Server Room", cx: 930, cy: 640, zoom: 88 },
  { id: "library", label: "Library", cx: 360, cy: 130, zoom: 94 },
  { id: "qaLab", label: "QA Lab", cx: 1470, cy: 95, zoom: 92 },
  { id: "kitchen", label: "Kitchen", cx: 880, cy: 60, zoom: 94 },
];

const DEFAULT_ZONE_ZOOM = 92;
// Camera sits up + back-right of the floor target so the zone fills the frame at a 3/4 angle,
// matching the ping-pong preset's feel (target y≈0.45 = standing eye height on the floor).
const ZONE_EYE_HEIGHT = 3.4;
const ZONE_BACK_OFFSET = 3.2;
const ZONE_SIDE_OFFSET = 2.6;

export const buildAihubZonePreset = (
  cx: number,
  cy: number,
  zoom: number = DEFAULT_ZONE_ZOOM,
): ZoneCameraPreset => {
  const [wx, , wz] = toWorld(cx, cy);
  return {
    pos: [wx + ZONE_SIDE_OFFSET, ZONE_EYE_HEIGHT, wz + ZONE_BACK_OFFSET],
    target: [wx, 0.45, wz],
    zoom,
  };
};

export type AihubZonePresetEntry = {
  id: string;
  label: string;
  preset: ZoneCameraPreset;
};

// The named zones as ready-to-apply preset entries. Pods are appended by the caller (they come
// from the live `AIHUB_POD_LAYOUTS` centers, which the renderer already imports).
export const buildAihubNamedZonePresets = (): AihubZonePresetEntry[] =>
  AIHUB_NAMED_ZONE_ANCHORS.map((zone) => ({
    id: zone.id,
    label: zone.label,
    preset: buildAihubZonePreset(zone.cx, zone.cy, zone.zoom),
  }));

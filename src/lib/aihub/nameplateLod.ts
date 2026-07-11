// Nameplate level-of-detail (Phase 7d declutter).
//
// Dense pods stack a dozen floating nameplates on top of each other, and at the overview camera
// the whole floor becomes a wall of text. This pure rule fades a nameplate out by camera
// distance: full detail up close (inspecting a pod), a soft fade band, then fully hidden when
// far (overview / another zone). Deterministic + testable so the renderer just applies the
// {visible, opacity} it returns each frame.

export type NameplateLod = {
  visible: boolean;
  opacity: number; // 0..1 multiplier applied to the nameplate's base opacity
};

// World-space distances. Generous so a normal zoomed-in inspection never loses nameplates; the
// fade only kicks in as the camera pulls back toward overview. Tunable if the office scale
// changes (verified against the live camera in the Phase 7 pass).
export const NAMEPLATE_LOD_NEAR = 16;
export const NAMEPLATE_LOD_FAR = 30;

const HIDDEN: NameplateLod = { visible: false, opacity: 0 };
const FULL: NameplateLod = { visible: true, opacity: 1 };

export const resolveNameplateLod = (
  cameraDistance: number,
  near: number = NAMEPLATE_LOD_NEAR,
  far: number = NAMEPLATE_LOD_FAR,
): NameplateLod => {
  if (!Number.isFinite(cameraDistance) || cameraDistance <= near) return FULL;
  if (cameraDistance >= far) return HIDDEN;
  // Linear fade across the [near, far] band.
  const opacity = 1 - (cameraDistance - near) / (far - near);
  return { visible: true, opacity };
};

import type { AgentAvatarProfile } from "@/lib/avatars/profile";
import type { RefObject } from "react";
import type {
  FurnitureItem,
  OfficeAgent,
  RenderAgent,
} from "@/features/retro-office/core/types";

export type BasicFurnitureModelProps = {
  item: FurnitureItem;
  onPointerDown?: (uid: string) => void;
  onPointerOver?: (uid: string) => void;
  onPointerOut?: () => void;
  editMode?: boolean;
};

export type InteractiveFurnitureModelProps = {
  item: FurnitureItem;
  isSelected: boolean;
  isHovered: boolean;
  editMode: boolean;
  kanbanTaskCount?: number;
  doorOpen?: boolean;
  onPointerDown: (uid: string) => void;
  onPointerOver: (uid: string) => void;
  onPointerOut: () => void;
  onClick?: (uid: string) => void;
};

export type AgentModelProps = {
  agentId: string;
  name: string;
  subtitle?: string | null;
  status: OfficeAgent["status"];
  color: string;
  // Phase 7a: per-tool accent for the nameplate strip; falls back to `color` when absent.
  accentColor?: string | null;
  appearance?: AgentAvatarProfile | null;
  agentsRef: RefObject<RenderAgent[]>;
  agentLookupRef?: RefObject<Map<string, RenderAgent>>;
  onHover?: (id: string) => void;
  onUnhover?: () => void;
  onClick?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  showSpeech?: boolean;
  speechText?: string | null;
  suppressSpeechBubble?: boolean;
  // Phase 7c: on the aihub floor, suppress the random collision "bump chatter" bubble — bubbles
  // should mean real agent-to-agent collaboration, not two avatars brushing past each other.
  suppressBumpChatter?: boolean;
  // Phase 4 (aihub) work-state HUD.
  badge?: "blocked" | null;
  taskChip?: string | null;
  bgChip?: string | null;
};

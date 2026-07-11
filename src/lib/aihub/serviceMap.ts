// Pure mapping from AI Hub services (and the tools that use them) to world objects in
// the 3D office. No I/O, no React — deterministic so the errand + glow logic can be
// unit-tested from canned snapshots.
//
// Mapping table (plan of record, Phase 5):
//   mlx / ollama            → server room (server_rack / ServerTerminal)
//   comfyui                 → art area (easel / paint table)
//   voice                   → phone booth
//   memory / graph / recall → library / research zone (bookshelf)
//   browser / chrome        → QA lab device rack
//   hub                     → ATM (analytics)
//
// The world-object kind drives two things: a health glow anchor (all kinds) and — for the
// subset that has a walk-to route — an "errand" that relocates the using agent to the object.

// Every object a service can map to. `art` and `atm` are glow-only (no walk-to route yet);
// the rest are errand-able (they reuse the existing room/appliance hold plumbing).
export type ServiceObjectKind =
  | "server_room"
  | "art"
  | "phone_booth"
  | "library"
  | "qa_device"
  | "atm";

// The subset of object kinds an agent can physically walk to. server_room reuses the
// server-terminal route (the GitHub hold), phone_booth the phone-booth route, qa_device the
// QA-lab route, and library a new open-floor reading route.
export type ServiceErrandTarget =
  | "server_room"
  | "phone_booth"
  | "library"
  | "qa_device";

type ServiceRule = {
  // Substrings matched (case-insensitive) against a normalized service id.
  match: string[];
  object: ServiceObjectKind;
};

// Ordered rules: the first whose keyword appears in the normalized service id wins.
const SERVICE_RULES: ServiceRule[] = [
  { match: ["comfyui", "comfy"], object: "art" },
  { match: ["voice", "tts", "speak", "kokoro", "chatterbox"], object: "phone_booth" },
  { match: ["memory", "graph", "recall", "brain", "knowledge"], object: "library" },
  { match: ["browser", "chrome", "playwright", "puppeteer"], object: "qa_device" },
  { match: ["mlx", "ollama", "llama", "vllm"], object: "server_room" },
  { match: ["hub"], object: "atm" },
];

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

// Map a hub service id (e.g. "mlx", "comfyui", "voice") to its world object.
export const mapServiceIdToObject = (
  serviceId: string | null | undefined
): ServiceObjectKind | null => {
  const id = normalize(serviceId);
  if (!id) return null;
  for (const rule of SERVICE_RULES) {
    if (rule.match.some((keyword) => id.includes(keyword))) return rule.object;
  }
  return null;
};

// The walk-to errand for an object kind, or null when the object is glow-only.
export const objectKindToErrand = (
  kind: ServiceObjectKind | null
): ServiceErrandTarget | null => {
  switch (kind) {
    case "server_room":
    case "phone_booth":
    case "library":
    case "qa_device":
      return kind;
    default:
      return null; // art + atm have no walk-to route yet (glow only)
  }
};

type ToolRule = {
  // Substrings matched (case-insensitive) against a normalized current-tool name.
  match: string[];
  object: ServiceObjectKind;
};

// Ordered tool rules. Used only as a fallback when the hub emits no active service_link for
// the agent — the honest signal is the service_link; these infer intent from the tool name.
// More specific rules come first (image/voice ailab tools before the generic ailab bucket).
const TOOL_RULES: ToolRule[] = [
  { match: ["ailab_speak", "ailab_tts", "_speak", "_tts"], object: "phone_booth" },
  {
    match: ["generate_image", "edit_image", "image_to_3d", "preview_3d", "video_submit", "ailab_generate", "ailab_edit"],
    object: "art",
  },
  { match: ["claude-in-chrome", "chrome-devtools", "browser_", "gstack"], object: "qa_device" },
  { match: ["webfetch", "websearch", "recall", "graphify", "deep-research"], object: "library" },
  { match: ["ailab", "mlx", "ollama"], object: "server_room" },
];

// Map an agent's `current_tool` name to a world object (fallback path, see TOOL_RULES).
export const mapToolToObject = (
  tool: string | null | undefined
): ServiceObjectKind | null => {
  const name = normalize(tool);
  if (!name) return null;
  for (const rule of TOOL_RULES) {
    if (rule.match.some((keyword) => name.includes(keyword))) return rule.object;
  }
  return null;
};

// Convenience: the errand for a tool name (null when the tool maps to a glow-only object
// or no object at all).
export const mapToolToErrand = (
  tool: string | null | undefined
): ServiceErrandTarget | null => objectKindToErrand(mapToolToObject(tool));

// Convenience: the errand for a service id.
export const mapServiceIdToErrand = (
  serviceId: string | null | undefined
): ServiceErrandTarget | null => objectKindToErrand(mapServiceIdToObject(serviceId));

// Role identity for aihub agents (Phase 7a).
//
// Ports the old office's `ROLE_RULES`/`inferRole` (`~/.ai-hub/server/static/js/office.js`
// lines ~135-172) into a pure, tested module, then maps each role onto claw3d's
// `AgentAvatarProfile` wardrobe system so roles read as visually distinct silhouettes.
// Per-tool accent colors (claude coral / codex teal / gemini blue / hermes purple) ride the
// nameplate strip so a session's harness is legible at a glance without recoloring the body
// or the per-agent pulse ring (which stay per-agent for individual variety).
//
// Pure + deterministic: same input → same role → same wardrobe object reference (memoized),
// so the T12-sensitive office render path never sees a fresh `appearance` object per frame.

import type { AgentAvatarProfile } from "@/lib/avatars/profile";

export type AgentRole =
  | "director"
  | "builder"
  | "researcher"
  | "tester"
  | "miner"
  | "librarian"
  | "artist"
  | "scribe"
  | "explorer"
  | "reviewer"
  | "guard"
  | "planner"
  | "debugger"
  | "optimizer"
  | "cleaner"
  | "messenger"
  | "generic";

// The subset of hub fields role inference reads. Kept tiny + nullable so callers can pass
// straight from `AgentState`/`AgentHubMetadata` without shaping.
export type RoleInferenceInput = {
  name?: string | null;
  persona?: string | null;
  task?: string | null;
  kind?: "session" | "subagent" | string | null;
};

// Ordered so the most role-defining token wins when several match (ported verbatim from
// office.js: reviewer←review, messenger←handoff, explorer←scout, builder is the broad catch).
const ROLE_RULES: ReadonlyArray<readonly [AgentRole, RegExp]> = [
  ["miner", /miner|mining|harvest|scrape/],
  ["librarian", /recall|memory|brain|knowledge|librarian|archive|index/],
  ["tester", /\btest|\bqa\b|verify|e2e|playwright|\bspec\b/],
  ["reviewer", /review|critic|audit|\bpr-/],
  ["researcher", /research|analy[sz]|compare|investigate|repos|\bjack\b/],
  ["explorer", /explore|scout|\bsearch\b|\bfind\b|discover/],
  ["guard", /security|guard|vuln|threat|\bauth\b/],
  ["planner", /\bplan|architect|design.?doc|blueprint|roadmap/],
  ["artist", /office|studio|design|\bart\b|draw|paint|chibi|\bui\b|\bux\b|visual|render|image|statusline/],
  ["optimizer", /perf|optimi[sz]|speed|latency|throughput/],
  ["cleaner", /clean|refactor|prune|dead.?code|tidy/],
  ["debugger", /debug|resolver|fix.?build|build.?fix|build.?fail|\berror|troubleshoot/],
  ["messenger", /handoff|relay|chief.?of.?staff|messenger|\bmessage/],
  ["scribe", /\bwrite|writer|\bdocs?\b|scribe|context|\bnote|document/],
  ["builder", /backend|frontend|builder|build|implement|\bfix\b|weaver|integration|engineer|\bdev\b|\bapi\b|workflow|general.?purpose|branch/],
];

const ORCHESTRATOR_RE = /orchestrat|director|conductor|\blead\b|chief/;

export const scanRole = (str: string | null | undefined): AgentRole | null => {
  if (!str) return null;
  const s = str.toLowerCase();
  for (const [role, re] of ROLE_RULES) {
    if (re.test(s)) return role;
  }
  return null;
};

// Derive the worker archetype from live fields only — never a hardcoded per-agent map.
// Session roots (and anything whose persona/name reads as a lead) conduct the room as a
// "director"; otherwise persona wins over name wins over task, falling back to "generic".
// (The old office's dormant generative-casting fallback is intentionally dropped — it was a
// hub round-trip that 404s today and always resolved to "generic" anyway.)
export const inferRole = (input: RoleInferenceInput): AgentRole => {
  const name = (input.name ?? "").toLowerCase();
  const persona = (input.persona ?? "").toLowerCase();
  if (input.kind === "session" || ORCHESTRATOR_RE.test(`${persona} ${name}`)) {
    return "director";
  }
  // Persona first, but only when it says something the name doesn't (avoid "~" placeholders).
  const meaningful =
    persona.length > 1 && persona !== "~" && persona !== name;
  const ruled =
    (meaningful ? scanRole(persona) : null) ?? scanRole(name) ?? scanRole(input.task);
  return ruled ?? "generic";
};

// ── Per-tool accent (harness identity on the nameplate strip) ───────────────────────────
// Keyed identically to Phase 6's `TOOL_LABELS` (lowercased hub.tool). Returns null for
// unknown/absent tools so the renderer falls back to the per-agent color.
const TOOL_ACCENTS: Record<string, string> = {
  claude: "#D97757", // Anthropic coral
  codex: "#10a37f", // OpenAI teal
  gemini: "#4285F4", // Google blue
  hermes: "#a855f7", // Hermes purple
};

export const resolveToolAccent = (tool: string | null | undefined): string | null => {
  if (!tool) return null;
  return TOOL_ACCENTS[tool.trim().toLowerCase()] ?? null;
};

// ── Role → wardrobe overrides ───────────────────────────────────────────────────────────
// Each role picks a distinct silhouette from claw3d's avatar vocabulary (hair style, top
// style + color, and accessories). Skin tone, hair color, bottom + shoe color are LEFT to
// the per-agent base profile so same-role agents still differ individually. Colors reference
// AGENT_AVATAR_CLOTHING_COLOR_OPTIONS ids by their hex so they normalize cleanly.
type RoleWardrobe = {
  hairStyle: AgentAvatarProfile["hair"]["style"];
  topStyle: AgentAvatarProfile["clothing"]["topStyle"];
  topColor: string;
  glasses: boolean;
  headset: boolean;
  hatStyle: AgentAvatarProfile["accessories"]["hatStyle"];
  backpack: boolean;
};

const ROLE_WARDROBE: Record<Exclude<AgentRole, "generic">, RoleWardrobe> = {
  // Leads conduct the room: headset + jacket, violet.
  director: { hairStyle: "parted", topStyle: "jacket", topColor: "#8b5cf6", glasses: false, headset: true, hatStyle: "none", backpack: false },
  // Builder: hard-hat proxy (cap) + toolbelt (backpack), amber, spiky.
  builder: { hairStyle: "spiky", topStyle: "tee", topColor: "#f59e0b", glasses: false, headset: false, hatStyle: "cap", backpack: true },
  researcher: { hairStyle: "short", topStyle: "hoodie", topColor: "#7090ff", glasses: true, headset: false, hatStyle: "none", backpack: false },
  tester: { hairStyle: "short", topStyle: "tee", topColor: "#34d399", glasses: false, headset: false, hatStyle: "cap", backpack: false },
  miner: { hairStyle: "spiky", topStyle: "tee", topColor: "#f59e0b", glasses: false, headset: false, hatStyle: "beanie", backpack: true },
  librarian: { hairStyle: "bun", topStyle: "jacket", topColor: "#64748b", glasses: true, headset: false, hatStyle: "none", backpack: false },
  artist: { hairStyle: "bun", topStyle: "hoodie", topColor: "#f43f5e", glasses: false, headset: false, hatStyle: "beanie", backpack: false },
  scribe: { hairStyle: "parted", topStyle: "tee", topColor: "#f5f5f4", glasses: true, headset: false, hatStyle: "none", backpack: false },
  explorer: { hairStyle: "spiky", topStyle: "jacket", topColor: "#34d399", glasses: false, headset: false, hatStyle: "cap", backpack: true },
  reviewer: { hairStyle: "short", topStyle: "jacket", topColor: "#f43f5e", glasses: true, headset: false, hatStyle: "none", backpack: false },
  guard: { hairStyle: "short", topStyle: "jacket", topColor: "#2d3748", glasses: false, headset: false, hatStyle: "cap", backpack: false },
  planner: { hairStyle: "parted", topStyle: "hoodie", topColor: "#8b5cf6", glasses: true, headset: false, hatStyle: "none", backpack: false },
  debugger: { hairStyle: "spiky", topStyle: "hoodie", topColor: "#34d399", glasses: false, headset: false, hatStyle: "none", backpack: false },
  optimizer: { hairStyle: "spiky", topStyle: "tee", topColor: "#7090ff", glasses: false, headset: false, hatStyle: "beanie", backpack: false },
  cleaner: { hairStyle: "bun", topStyle: "tee", topColor: "#34d399", glasses: false, headset: false, hatStyle: "none", backpack: false },
  messenger: { hairStyle: "short", topStyle: "hoodie", topColor: "#34d399", glasses: false, headset: false, hatStyle: "none", backpack: true },
};

// Pure: returns a NEW profile with the role's wardrobe applied over `base`. "generic" returns
// `base` unchanged (same reference). Callers wanting render-path stability should use
// `memoizedRoleWardrobe` instead so identical (base, role) pairs reuse one object.
export const applyRoleWardrobe = (
  base: AgentAvatarProfile,
  role: AgentRole,
): AgentAvatarProfile => {
  if (role === "generic") return base;
  const w = ROLE_WARDROBE[role];
  return {
    ...base,
    hair: { ...base.hair, style: w.hairStyle },
    clothing: { ...base.clothing, topStyle: w.topStyle, topColor: w.topColor },
    accessories: {
      ...base.accessories,
      glasses: w.glasses,
      headset: w.headset,
      hatStyle: w.hatStyle,
      backpack: w.backpack,
    },
  };
};

// Referentially-stable variant for the office render path: the same base-profile object +
// role always yields the same wardrobe object, so `appearance` never churns per render.
const wardrobeCache = new WeakMap<
  AgentAvatarProfile,
  Partial<Record<AgentRole, AgentAvatarProfile>>
>();

export const memoizedRoleWardrobe = (
  base: AgentAvatarProfile,
  role: AgentRole,
): AgentAvatarProfile => {
  if (role === "generic") return base;
  let byRole = wardrobeCache.get(base);
  if (!byRole) {
    byRole = {};
    wardrobeCache.set(base, byRole);
  }
  const cached = byRole[role];
  if (cached) return cached;
  const built = applyRoleWardrobe(base, role);
  byRole[role] = built;
  return built;
};

import { describe, expect, it } from "vitest";

import { createAgentAvatarProfileFromSeed } from "@/lib/avatars/profile";
import {
  applyRoleWardrobe,
  inferRole,
  memoizedRoleWardrobe,
  resolveToolAccent,
  scanRole,
  type AgentRole,
} from "@/lib/aihub/roles";

describe("scanRole", () => {
  it("returns null for empty / whitespace input", () => {
    expect(scanRole(null)).toBeNull();
    expect(scanRole(undefined)).toBeNull();
    expect(scanRole("")).toBeNull();
  });

  it("matches the most role-defining token in rule order", () => {
    expect(scanRole("test the login flow")).toBe("tester");
    expect(scanRole("review this PR")).toBe("reviewer");
    expect(scanRole("recall the memory graph")).toBe("librarian");
    expect(scanRole("optimize latency")).toBe("optimizer");
    expect(scanRole("refactor and prune dead code")).toBe("cleaner");
    expect(scanRole("build the backend api")).toBe("builder");
    expect(scanRole("write the docs")).toBe("scribe");
  });

  it("is case-insensitive", () => {
    expect(scanRole("SECURITY audit")).toBe("reviewer"); // review wins over guard by rule order
    expect(scanRole("VULN scan")).toBe("guard");
  });

  it("returns null when no rule matches", () => {
    expect(scanRole("xyzzy")).toBeNull();
  });
});

describe("inferRole", () => {
  it("treats session-kind nodes as directors regardless of name", () => {
    expect(inferRole({ kind: "session", name: "some-builder", persona: null })).toBe(
      "director",
    );
  });

  it("treats orchestrator/lead personas as directors", () => {
    expect(inferRole({ kind: "subagent", persona: "chief of staff" })).toBe("director");
    expect(inferRole({ kind: "subagent", name: "team-lead" })).toBe("director");
    expect(inferRole({ kind: "subagent", persona: "orchestrator" })).toBe("director");
  });

  it("prefers a meaningful persona over the name", () => {
    // persona says reviewer, name says builder → persona wins
    expect(
      inferRole({ kind: "subagent", name: "build-worker", persona: "code reviewer" }),
    ).toBe("reviewer");
  });

  it("ignores placeholder personas ('~') and falls back to the name", () => {
    expect(inferRole({ kind: "subagent", name: "e2e-tester", persona: "~" })).toBe(
      "tester",
    );
  });

  it("falls back to the task text when name/persona say nothing", () => {
    expect(
      inferRole({ kind: "subagent", name: "worker-7", persona: null, task: "explore the repo" }),
    ).toBe("explorer");
  });

  it("returns generic when nothing matches", () => {
    expect(inferRole({ kind: "subagent", name: "worker-7", persona: null, task: null })).toBe(
      "generic",
    );
  });

  it("does not let a persona equal to the name suppress name matching", () => {
    expect(inferRole({ kind: "subagent", name: "tester", persona: "tester" })).toBe("tester");
  });
});

describe("resolveToolAccent", () => {
  it("maps known harnesses to their accent", () => {
    expect(resolveToolAccent("claude")).toBe("#D97757");
    expect(resolveToolAccent("Codex")).toBe("#10a37f");
    expect(resolveToolAccent(" GEMINI ")).toBe("#4285F4");
    expect(resolveToolAccent("hermes")).toBe("#a855f7");
  });

  it("returns null for unknown or absent tools", () => {
    expect(resolveToolAccent(null)).toBeNull();
    expect(resolveToolAccent(undefined)).toBeNull();
    expect(resolveToolAccent("")).toBeNull();
    expect(resolveToolAccent("mlx")).toBeNull();
  });
});

describe("applyRoleWardrobe", () => {
  const base = createAgentAvatarProfileFromSeed("agent-alpha");

  it("returns the same reference for the generic role (no churn)", () => {
    expect(applyRoleWardrobe(base, "generic")).toBe(base);
  });

  it("overrides silhouette fields but preserves per-agent identity fields", () => {
    const director = applyRoleWardrobe(base, "director");
    expect(director.accessories.headset).toBe(true);
    expect(director.clothing.topStyle).toBe("jacket");
    expect(director.hair.style).toBe("parted");
    // per-agent identity preserved from base
    expect(director.body.skinTone).toBe(base.body.skinTone);
    expect(director.hair.color).toBe(base.hair.color);
    expect(director.clothing.bottomColor).toBe(base.clothing.bottomColor);
    expect(director.clothing.shoesColor).toBe(base.clothing.shoesColor);
    expect(director.seed).toBe(base.seed);
  });

  it("does not mutate the base profile", () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    applyRoleWardrobe(base, "builder");
    expect(base).toEqual(snapshot);
  });

  it("produces distinct silhouettes across roles", () => {
    const roles: AgentRole[] = [
      "director",
      "builder",
      "researcher",
      "tester",
      "librarian",
      "artist",
    ];
    const signatures = roles.map((role) => {
      const p = applyRoleWardrobe(base, role);
      return `${p.hair.style}|${p.clothing.topStyle}|${p.clothing.topColor}|${p.accessories.hatStyle}|${p.accessories.glasses}|${p.accessories.headset}`;
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("memoizedRoleWardrobe", () => {
  it("returns a stable reference for the same (base, role) pair", () => {
    const base = createAgentAvatarProfileFromSeed("agent-beta");
    const first = memoizedRoleWardrobe(base, "reviewer");
    const second = memoizedRoleWardrobe(base, "reviewer");
    expect(second).toBe(first);
  });

  it("returns the base itself for generic", () => {
    const base = createAgentAvatarProfileFromSeed("agent-gamma");
    expect(memoizedRoleWardrobe(base, "generic")).toBe(base);
  });

  it("keeps distinct roles distinct off one base", () => {
    const base = createAgentAvatarProfileFromSeed("agent-delta");
    expect(memoizedRoleWardrobe(base, "artist")).not.toBe(
      memoizedRoleWardrobe(base, "guard"),
    );
  });

  it("matches the pure applyRoleWardrobe output", () => {
    const base = createAgentAvatarProfileFromSeed("agent-epsilon");
    expect(memoizedRoleWardrobe(base, "planner")).toEqual(
      applyRoleWardrobe(base, "planner"),
    );
  });
});

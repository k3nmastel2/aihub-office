# PROGRESS — aihub-office

_Checkpoint doc: updated at every increment so any interrupted session resumes losslessly._
_Plan of record: `/Users/k3n/.claude/plans/i-want-you-to-parsed-rocket.md` · Fork map: `FORK.md`_

## Current phase: 0 — Fork boots

## Status

- [x] Forked `iamlukethedev/claw3d` → `k3nmastel2/aihub-office` (2026-07-10)
- [x] Cloned to `~/GitHub/aihub-office`; remotes: `origin`=fork, `upstream`=claw3d
- [x] `.env` created with `PORT=3100` (hub owns :3000)
- [x] `npm install` clean (node v22.22.3, npm 10.9.8)
- [x] `FORK.md` (merge policy + upstream-touch table)
- [x] README attribution banner
- [x] Boot: demo gateway on ws :18789 + Studio dev on :3100 (NOTE: `PORT=3100` must be in the
  shell env — `server/index.js` reads `process.env.PORT` before Next loads `.env`; a stale
  `.next/dev/lock` from a crashed boot must be removed before retry)
- [x] Chrome verification pass — **QA VERDICT: PASS** (qa-phase0, 2026-07-10). Auto-connected to
  demo gateway ("DEMO • CONNECTED", 3 agents: Mika/Rune/Avery), agents animate (Avery walked
  between T0 and T+10s), console clean of uncaught exceptions, all requests 200, hub :3000
  unaffected. Evidence: `docs/aihub/evidence/phase0/01..03*.png`
- [x] Triage complete → Phase 0 CLOSED (no P0s; P1 investigation gates Phase 1 start)

## Exact next step

Resolve triage item T1 (WebGL context-loss root cause — Opus subagent), then start Phase 1
(aihub RuntimeProvider; see plan + task #2).

## Open triage items

| ID | Pri | Symptom | State |
|---|---|---|---|
| T1 | P1 | `THREE.WebGLRenderer: Context Lost` ×4 during initial mount only; self-recovered, no recurrence in 10s window. Suspect dev-mode double-mount / multiple WebGL canvases (main scene + thumbnail). Root-cause before long-running sessions; fix or downgrade to P2 with rationale. | investigating |
| T2 | P2 | THREE.Clock deprecation warning (upstream three.js) | open |
| T3 | P2 | opentype.js GPOS/GSUB debug spam (font shaping, cosmetic) | open |
| T4 | P2 | Demo gateway activity stream sparse (fine for smoke; tune if richer demo needed) | open |
| T5 | P2 | Demo profile auto-connects, silently bypassing onboarding connection step — confirm intended | open |

## Phase ledger

| Phase | State | Evidence |
|---|---|---|
| 0 — Fork boots | in progress | — |
| 1 — aihub provider + flat roster | pending | — |
| 2 — Ephemeral lifecycle | pending | — |
| 3 — Hierarchy pods | pending | — |
| 4 — Badges + tasks | pending | — |
| 5 — Services + errands | pending | — |
| 6 — Interactions | pending | — |
| 7 — Polish / parity | pending | — |
| 8 — Hub link-out + retire office.js | pending | — |

## Session notes

- 2026-07-10: Phase 0 started. Fork/clone/env/install done inline by orchestrator (Fable).
  Execution model: Fable orchestrates; Opus subagents for deep thinking; Sonnet for routine; no Haiku.
  Per-phase QA: Claude-with-Chrome pass → P0/P1/P2 triage → fix teams → commit.

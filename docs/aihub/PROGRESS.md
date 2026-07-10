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
- [ ] README attribution banner
- [ ] Boot: `npm run demo-gateway` (ws :18789) + `npm run dev` (:3100) → office renders demo agents
- [ ] Chrome verification pass + screenshot evidence
- [ ] Triage any P0/P1 findings, fix, then commit Phase 0 and mark task #1 complete

## Exact next step

Add README attribution banner, then boot demo gateway + dev server and verify in Chrome
(connect Studio to `ws://localhost:18789`, demo provider). Screenshot the office with demo agents.

## Open triage items

_(none yet)_

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

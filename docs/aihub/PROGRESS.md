# PROGRESS — aihub-office

_Checkpoint doc: updated at every increment so any interrupted session resumes losslessly._
_Plan of record: `/Users/k3n/.claude/plans/i-want-you-to-parsed-rocket.md` · Fork map: `FORK.md`_

## Current phase: 1 — aihub provider + live flat roster (code complete, gates green, awaiting QA)

### Phase 1 status

Implemented a first-class **`aihub` RuntimeProvider** that drives the office from the hub's
`/api/live`. Data-only slice (no visual/seating/RetroOffice3D changes).

**Done:**
- New namespace `src/lib/runtime/aihub/`: `types.ts`, `snapshot.ts` (pure normalize +
  `buildAgentSeeds` depth-first ordering + status-consistent preview/status/history builders +
  `sanitizeTaskTextForOffice`), `diff.ts` (pure snapshot→`EventFrame[]`), `http.ts` (proxy
  client), `provider.ts` (`AihubRuntimeProvider` + `LiveFeedRuntimeProvider` interface/guard,
  3s `startLiveFeed`/`stopLiveFeed`, cached-snapshot `call()`).
- Server proxy `src/app/api/runtime/aihub/route.ts` (host allowlist 127.0.0.1/localhost, exact
  pathname allowlist `/api/live`,`/api/live/nudge`,`/api/live/dismiss`; default `AIHUB_URL`).
- Registration edits across upstream files (see FORK.md) + `GatewayClient.emitSyntheticEvent()`
  + start/stop feed wired in `useRuntimeConnection.ts`.
- `AgentStoreSeed.hub` field; `hub` threaded through the seed derivation whitelist so it reaches
  the store (see "Key decisions" below).
- Fixtures + vitest: `tests/fixtures/aihub/live-real.json` (captured real payload),
  `tests/unit/aihub/{snapshot,diff}.test.ts` (23 tests, all green).

**Gates:** `npm run typecheck` green · `npx vitest run tests/unit/aihub/` → 23/23 green · full
`tests/unit/` unchanged (the 5 remaining failures — `agentChatPanel-controls` ×2,
`useGatewayConnection` ×2, `agentFleetHydration` ×1 — are PRE-EXISTING, verified failing on a
clean stash of `main` before this work; officeFloors ×3 were caused by the new floor and are
now updated).

**Exact next step:** Phase 1 QA pass (Claude-with-Chrome). Manual check: Settings → Gateway →
select **AI Hub** → URL `http://127.0.0.1:3000` → Connect → floor **AI Hub Live** → real hub
sessions/subagents appear as avatars ≤3s after spawn, type at desks while active, despawn when
the hub drops them.

### Key decisions (Phase 1)

- **`hub` metadata flow:** the seed derivation (`agentFleetHydrationDerivation.ts`) is a hard
  field whitelist, NOT a spread — extra fields on `agents.list` entries do not survive to the
  seed. To make `AgentStoreSeed.hub` real (and usable by phases 2–7), added `hub?` to the
  derivation's agent type + one `hub: agent.hub ?? null` line to the seed map. `createRuntimeAgentState`
  already spreads `...seed`, so it flows to `AgentState` from there.
- **Status transitions via presence, not just lifecycle frames:** `resolveLifecyclePatch`
  ignores a lifecycle-`end` frame whose `runId` ≠ the agent's current `runId`, and an
  infer-originated running state carries `runId=inferred-<id>` (≠ our `hub-run-<id>`). So the
  diff emits a `presence` frame on membership OR run-state change (not on tool-only deltas),
  routing status through the robust `presence→re-hydrate→inferRunningFromAgentSessions` path
  that our status-consistent preview tails were built for. Lifecycle/tool frames are still
  emitted for immediacy (working/idle latch + speech bubbles). Minor, documented deviation from
  the plan's "presence only on membership change".
- **Done nodes:** kept as idle avatars while the hub still lists them; despawn happens naturally
  when the hub drops the node (membership change → presence → roster replace). Proactive
  fade/walk-out is Phase 2.

## Prior phase: 0 — Fork boots

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
| T1 | P1 | `Context Lost` ×4 at mount — root cause: volatile `canvasResetKey` remounting `<Canvas>` per connect step/roster change. Fix: key narrowed to `remoteOfficeEnabled` (commit e5180c4). **VERIFIED PASS 2026-07-10**: 0 context losses across two fresh cold-mount tabs, 30s+ each; scene renders + animates. Evidence: `evidence/phase0/04-t1-fix-verify.png`, `05-t1-demo-lobby-fallback.png`. | closed |
| T6 | P1 | Persisted studio state (`/api/studio`) flipped to `activeFloorId:"openclaw-ground"` / `adapterType:"openclaw"` during Phase 1 dev on the live HMR server — fresh loads now land on "No local gateway found" instead of a working scene. Owner: phase1-provider — after Phase 1, fresh load must land on a working default (demo or aihub profile); reset persisted settings / restart dev server before next visual QA. | routed |
| T7 | P1-watch | Verify the gateway reconnect-retry path doesn't remount the canvas per attempt in the FIXED code (a stale pre-fix tab showed 20+ losses in a tight retry loop; likely stale JS, but a real outage would hit this path in prod). Test with gateway down once env settles. | open |
| T2 | P2 | THREE.Clock deprecation warning (upstream three.js) | open |
| T3 | P2 | opentype.js GPOS/GSUB debug spam (font shaping, cosmetic) | open |
| T4 | P2 | Demo gateway activity stream sparse (fine for smoke; tune if richer demo needed) | open |
| T5 | P2 | Demo profile auto-connects, silently bypassing onboarding connection step — confirm intended | open |

## Phase ledger

| Phase | State | Evidence |
|---|---|---|
| 0 — Fork boots | done | evidence/phase0 |
| 1 — aihub provider + flat roster | code complete (gates green) — awaiting QA | tests/unit/aihub |
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

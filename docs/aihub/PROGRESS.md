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

**Live proxy verified (2026-07-10)** against the running dev server (:3100) + live hub (:3000):
`POST /api/runtime/aihub {pathname:"/api/live"}` → 200 with the real snapshot (8 nodes / 7 agent
nodes); disallowed pathname → 400 "pathname is not in the allowed list."; disallowed host → 400
"hubUrl is not in the allowed hosts list.". Confirms the browser→Next-proxy→hub path + both
allowlists end-to-end. (Did NOT exercise `/api/live/nudge` or `/api/live/dismiss` — side effects.)

**QA folds (from team-lead):** T6 diagnosed (floor/adapter mismatch in persisted settings) — the
1-line reset is handed off (editing that out-of-repo config was permission-denied for this agent;
see triage T6). T7 verified PASS by code trace (see triage T7).

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
| T6 | P1 | Persisted studio state (`~/.openclaw/claw3d/settings.json`) had `gateway.adapterType:"demo"` but `activeFloorId:"openclaw-ground"` — a floor/adapter MISMATCH. On fresh load the office lands on the OpenClaw runtime floor with no OpenClaw gateway → "No local gateway found / Timed out". Root cause is the persisted `activeFloorId` (QA-session floor navigation), NOT the aihub code — `resolveActiveOfficeFloorId` only checks `enabled`, not adapter-match. **Fix = one line:** set `"activeFloorId": "openclaw-ground"` → `"lobby"` in that file (optionally clear the stale `lobby` floor `lastErrorCode`/`lastErrorMessage`). **Self-heal without a file edit:** in the app, pick the **Demo** adapter + **Lobby** floor (or **AI Hub** + **AI Hub Live**) — switching floors re-persists `activeFloorId` and the mismatch clears. **BLOCKED for phase1-provider:** the permission classifier denied editing that out-of-repo config (teammate direction ≠ user authorization); the reset must be applied by Ken or the orchestrator (or via the app UI). **RESOLVED 2026-07-10 via app UI during Phase 1 QA:** floor switch re-persisted a consistent config — fresh tabs now land on AI Hub Live with the right backend. Remaining auto-connect gap split out as T8. | closed (see T8) |
| T7 | P1-watch | **PASS by code trace (2026-07-10, phase1-provider).** `canvasResetKey = useMemo(() => remoteOfficeEnabled ? "remote" : "local", [remoteOfficeEnabled])` (`RetroOffice3D.tsx:2642`). `remoteOfficeEnabled` is the persisted studio office preference (`useStudioOfficePreference`, `OfficeScreen.tsx:1330`), NOT gateway status. The reconnect/retry loop (`GatewayClient` connect useCallback) only mutates `status` (connecting/disconnected) + `client.connect/disconnect` — none feed `canvasResetKey`, so the key is constant across attempts and the `<Canvas>` cannot remount per-attempt. `RetroOffice3D` is rendered unconditionally in the office view (`OfficeScreen.tsx:4760`, not gated on `status`), so no ancestor remounts it either; the only Canvas swap is `immersiveOverlayActive` (immersive-screen click), unrelated to connection. Pre-fix tab losses were stale JS. **Live confirmation already exists:** the T1-verify fresh tabs (post-fix code) sat in the failed-connect retry loop 30s+ each with ZERO Context Lost among 25 console messages — exactly the gateway-down path. Trace + live evidence → closed. | closed |
| T8 | P1 | `aihub` backend does NOT auto-connect on a genuinely fresh page load (demo/openclaw/hermes all fire `auto-connect` immediately; aihub sits DISCONNECTED until manual Connect, which then succeeds instantly). Persisted-config half of T6 is fixed (fresh tab lands on AI Hub Live floor + right backend); this auto-connect gate is the remainder. Suspect per-adapter-type gating in the auto-connect path (e.g. `shouldPromptForConnect` / custom-like branch). Owner: phase1-provider. | routed |
| T8b | P1 | **T8 fix (41931ce) FAILED final QA** — two zero-click fresh tabs (plain + fully isolated context) both landed Lobby/DEMO, never AI Hub Live, despite server-persisted `activeFloorId:"aihub-live"`. Client boot ignores persisted floor / adapter preference (note pre-existing failing test `prefers_the_saved_selected_adapter_over_a_different_last_known_good_backend` — likely the same seam). Contradicts phase1-provider's own live verification — reconcile that first (what differed: in-memory state? pre-regression build?). **RECONCILED + FIXED 2026-07-10 (phase1-provider).** The reconciliation: my earlier "verification" was a WARM tab (shared session already had aihub selected) — invalid for a cold boot. A truly cold isolated context revealed the real behavior: the client DOES honor the persisted adapter (selected = aihub correctly), but aihub's URL resolved to `ws://localhost:18789` (see T13) so the probe failed → "No local gateway found", which reads as "landed on demo/lobby". **T8b was the same root cause as T13 (the URL), not a floor/adapter-honoring bug.** With the T13 URL fix: cold isolated context + plain fresh tab both auto-connect aihub → **AI Hub Live floor, roster 8, CONNECTED, zero clicks** (Chrome-verified). | fixed + verified |
| T12 | P1↑ | Upstream `Maximum update depth exceeded` loop ESCALATED: 60-70+ firings <1min under light interaction, and coincided with one fresh tab's WebGL canvas rendering **fully blank/white** (office never rendered — first time seen). Possibly interacts with the T8b/T13 connect-retry churn. OfficeScreen.tsx ~3143 `useTaskBoardController`/`useRunLog` effect cluster. **PARTIALLY FIXED + blank canvas RESOLVED 2026-07-10 (phase1-provider).** (1) The 60-70/min continuous firing + blank canvas was FED by T13's tight wrong-URL retry churn (team-lead's hypothesis confirmed) — with T13 fixed it drops to a capped mount burst and the canvas renders in every test. (2) Two upstream loop drivers fixed: `RetroOffice3D.syncRenderAgentUi` (fresh object every 250ms → diff-before-setState) and `useTaskBoardController` seed effect (`standup` object → `standup.config`). **Result: aihub-CONNECTED steady state = ZERO update-depth, no blank canvas** (Chrome-verified: plain fresh tab + isolated context both 0). **Residual:** a loop STILL fires (~27×, capped) in the DISCONNECTED/onboarding path (reproduced on demo, so general upstream, NOT aihub-specific); dev sourcemaps collapse it to the `OfficeScreen:3143` hook-call site so it can't be pinned via console stacks — needs React DevTools / prod sourcemaps. Non-fatal (capped, app renders). Recommend a dedicated upstream follow-up. | connected-state fixed; disconnected-path residual routed |
| T13 | P1 | Switching floors to `aihub` loaded the WRONG per-profile URL — field showed `ws://localhost:18789` (demo/openclaw) instead of `http://localhost:3000`; stale demo roster shown; `/api/runtime/aihub` 502 ×9 + tight `connect:runtime-failed → auto-retry` loop that never self-resolved. Reproduced under fast (~800ms) floor-hopping; careful switching worked fine earlier — race or shared-`gateway.url`-vs-profile bug; plausibly the same root cause as T8b (auto-managed path using top-level `gateway.url` instead of the aihub profile URL). **ROOT-CAUSED + FIXED 2026-07-10 (phase1-provider).** Cold-client repro confirmed: aihub was selected correctly but the URL field showed `ws://localhost:18789`. Cause: aihub is the only adapter whose URL differs from the shared `ws://…:18789` gateway port, and `resolveStudioGatewayProfiles` stamps the top-level `gateway.url` onto the aihub profile when they desync (fast floor-hop persist race). **Fix:** (a) `coerceAihubProfileUrl` in `resolveStudioGatewayProfiles` self-heals any non-http(s) aihub URL to the hub default (fixes the field + persist); (b) `resolveAihubHubUrl` in `lib/runtime/aihub/http.ts` used by the provider + probe so aihub always dials an http hub URL regardless of a bad configured value. **Verified (Chrome):** all `/api/runtime/aihub` 200, ZERO 502s, standup-config URL self-healed ws→http; no retry loop. Unit tests: `http.test.ts`, `settingsAihubUrl.test.ts`. | fixed + verified |
| T9 | P2 | Next dev HMR websocket (`_next/webpack-hmr`) intermittently times out across tabs (dev-only, seen Phase 0 + 1; app unaffected) | open |
| T10 | P2 | Building Directory floor nav renders only a ~2-floor sliding window — manual floor-hopping is slow; consider full scrollable list | open |
| T11 | P2 | `/api/runtime/aihub` poll cadence observed ~1s in-browser vs the intended 3s `startLiveFeed` interval — verify no duplicate feed loops / effect re-registration (harmless now, wasteful later) | open |
| T8 | P1 | `aihub` adapter did not auto-connect on a fresh load (sat DISCONNECTED until a manual Connect). Root cause: auto-connect + `hasLastKnownGoodState` both gate on `isAutoManagedAdapter` (openclaw/hermes/demo only), and aihub was also force-listed in `shouldPromptForConnect`. **Fix (phase1-provider):** added `"aihub"` to `isAutoManagedAdapter` (GatewayClient.ts:127 — scoped to aihub; custom/local/claw3d stay manual-connect) and removed aihub from the `shouldPromptForConnect` custom-like list so it auto-connects silently like demo. `connect()` still takes the aihub probe branch. **Live-verified (Chrome, fresh tab):** console `[gateway-client] auto-connect → connect:start → connect:runtime-success`, CONNECTED with canvas + roster, no manual click. | fixed + verified |
| T11 | P2 | QA saw ~1s `/api/runtime/aihub` POST cadence. **Verified (Chrome): exactly ONE feed loop at ~3s** — a fresh tab measured 10 POSTs over 30s with deltas 2564–3282ms; the long-lived QA tab logged 114 POSTs over ~6min (≈3s). No duplicate feed, no probe/feed overlap beyond the one-time connect burst. The earlier ~1s reading was connect-burst + QA session churn (adapter/floor switching, dev Strict-Mode remounts). | verified benign |
| T12 | P1? | **NEW (found during T8/T11 verify).** Console `Maximum update depth exceeded` bursts (25–47×, then React caps) from an upstream effect — stack: `OfficeScreen.useEffect` (OfficeScreen.tsx ~3143, the `useTaskBoardController`/`useRunLog` cluster) → `dispatchSetState`; an effect's dependency isn't stable across the periodic `state.agents` refresh. **Pre-existing / NOT caused by Phase 1 code:** it is present in the QA tab that connected aihub *manually* (before the T8 auto-connect change), and no frame in the stack is aihub-namespace code. aihub's rich event stream (frequent roster refreshes) exercises it more than demo's sparse stream, and T8 now surfaces it at fresh-load mount. Non-fatal: roster loads, canvas renders, feed runs. Out of the Phase 1 data-only scope (upstream OfficeScreen effect) — recommend routing to an upstream-fix owner; should not block the Phase 1 data-pipeline close (it did not block the QA PASS-WITH-ISSUES verdict). | filed for triage |
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

# T12 static sweep — full setState-site inventory (2026-07-10)

_Produced by a 5-subagent read-only sweep of OfficeScreen.tsx, RetroOffice3D.tsx, office hooks/taskboard, agents/state plumbing, lib/office + retro-office systems. Context: "Maximum update depth exceeded" residual ~7/min sporadic bursts under live churn, after the sustained loop was fixed (commit 5a9f9cf)._

## Confirmed negatives (ruled out)
- `src/lib/office/*` (all 24 files): zero setState/store-set sites — pure functions/persistence.
- `objects/agents.tsx`, `NavigationSystem.tsx`, `environment.tsx`, `RemoteOfficeLayoutPreview.tsx`: refs/mesh mutation only, zero setState.
- `client` (GatewayClient singleton) + `provider`/`gateway.status` deps in `useRuntimeConnection.ts`: stable refs — rules out client-keyed effects (usage analytics, skills, cron).

## Already-fixed sites — audit verdicts
1. `syncRenderAgentUi` (RetroOffice3D.tsx:2863-2898): **CLOSED, correct** — diffs the 2 written fields (state/status) with primitive equality, returns same `prev` ref on no-op, stable effect dep. Not the leak.
2. `useTaskBoardController` `standup.config` dep (1001-1014): settles today (config only changes on rare gated events) but is the one `dispatch(upsertMany)` with no per-card content-diff guard — latent regression risk if cron/config ever gain a fast poll. Backlog note, not current cause.

## HIGH risk (causal-chain order, root → consumers)

| # | file:line | setter | trigger | why HIGH | guard |
|---|---|---|---|---|---|
| 1 | lib/runtime/aihub/provider.ts:152-179 | emitSyntheticEvent per 3s tick | root feed poll | blast radius: one agent flip re-triggers roster-wide downstream sweep | diffSnapshots gates own frames only |
| 2 | agents/state/store.tsx:293-365 | updateAgent reducer | every patch | AMPLIFIER: always new array + new agent object, zero value diffing | none |
| 3 | store.tsx:267-288 | hydrateAgents reducer | ~3s roster refresh | new object identity for every agent every poll | none |
| 4 | gatewayRuntimeEventHandler.ts:131-140 | executeCoordinatorEffects dispatch | every client.onEvent | universal un-diffed funnel | none |
| 5 | gatewayRuntimeEventHandler.ts:155-167 | scheduleSummaryRefresh (750ms) | re-armed on every presence/heartbeat | cancel-and-reschedule ≠ coalesce → near-continuous loadSummarySnapshot | timer cancel only |
| 6 | runtimeEventBridge.ts:485-544 | per-agent updateAgent patches | fired by #5, sweeps roster | `hubUpdatedAtMs(node, now)` = Date.now()-derived → textbook timestamp-into-state for EVERY agent (source: aihub snapshot.ts:361-381/222-225) | none |
| 7 | runtimeEventBridge.ts:608-639 | updateAgent lastActivityAt: Date.now() | every chat event | fresh timestamp per event | none |
| 8 | runtimeEventPolicy.ts:88-114 | queueLivePatch streamText/thinkingTrace | every delta | no compare vs current; duplicate deltas re-queue | none |
| 9 | runtimeAgentEventWorkflow.ts:262-317 | queueAgentPatch streamText | every assistant-stream event | `shouldPublishAssistantStream` (bridge:592-606) returns true whenever rawText non-empty — republishes identical content if backend resends full text | partial |
| 10 | runtimeAgentEventWorkflow.ts:226-259 | queueAgentPatch thinkingTrace + lastActivityAt: nowMs | every reasoning event | Date.now() guarantees new patch | none |
| 11 | OfficeScreen.tsx:3184 | `animationNowMs = Date.now()` IN RENDER BODY | every render | poisons officeAnimationState useMemo (3185-3231, always fresh objects) → `animationState` prop into RetroOffice3D (4766) + taints officeAgents/allVisibleAgents | none |
| 12 | OfficeScreen.tsx:2894-2929 | setOpenClawLogEntries | every gateway event | unconditional | slice cap only |
| 13 | OfficeScreen.tsx:2901-2907 | setOfficeTriggerState (reduce) | every event | helper spreads new object, no bail-out | none |
| 14 | OfficeScreen.tsx:2989-2996 | setOfficeTriggerState (reconcile) | useEffect [state.agents] | agents = new array every tick → always fresh object | none |
| 15 | OfficeScreen.tsx:1549-1567 | setFloorRosterCache | useEffect incl. [state.agents] | hydratedAt: Date.now() → new value every run | none |
| 16 | OfficeScreen.tsx:1311-1318 | setDanceUntilByAgentId | useEffect [state.agents] | Object.fromEntries always allocates | none |
| 17 | RetroOffice3D.tsx:5113-5114 | setSpeechAgentIds add | useEffect [feedEvents], setTimeout 0 | `new Set([...prev, id])` unconditional, no membership check | none |
| 18 | RetroOffice3D.tsx:5116-5121 | setSpeechAgentIds remove timer | same | perpetually re-armed under feedEvents churn | none |
| 19 | RetroOffice3D.tsx:5140-5145 | setMoodByAgentId add | same family | stamps `{emoji, ts: Date.now()}` | none |
| 20 | RetroOffice3D.tsx:5147-5151 | setMoodByAgentId remove timer | paired | same | none |
| 21 | useRemoteOfficePresence.ts:109 | setSnapshot | 5s poll | fresh json object regardless of content | none |
| 22 | useRemoteOfficePresence.ts:217 | setSnapshot (gateway path) | same | rebuilt fresh | none |
| 23 | useOfficeStandupController.ts:180 | setMeeting | 8s poll (active) | no diffing | none |
| 24 | useRemoteOfficeLayout.ts:59 | setSnapshot | 10s poll | fresh json | none |
| 25 | useTaskBoardController.ts:1025-1028 | dispatch hydrate | useEffect [agents, runLog] | **DEFEATED GUARD**: syncCardWithLinkedRun (~496-519) rebuilds `{...card, status, updatedAt, lastActivityAt}` for any card with an ACTIVE runId even when byte-identical → trips its own `c!==cards[i]` check every tick a run is live | defeated |
| 26 | systems/visualSystems.tsx:172 | TrailSystem setPoints | useFrame every 8th frame ≈ 7.5Hz, UNCONDITIONALLY MOUNTED | fresh array every call, zero diffing; cadence ≈ 2× the reported warning rate — cheapest isolated hypothesis to falsify | none |

## Cross-cutting architecture finding (load-bearing)
OfficeScreen.tsx:2826-2883 wires `queueLivePatch: (id,patch) => dispatch(updateAgent)` **synchronously**, bypassing the RAF-batched `mergePendingLivePatch`/`livePatchQueue.ts` mechanism the codebase already uses correctly in `useChatInteractionController.ts` (AgentsPageScreen). The office view — exactly where the bug reproduces — has zero batching/dedup on the #7-10 patch bursts.

## MED risk (condensed)
- lifecycle fallback 0ms setTimeout chain (coordinatorWorkflow 738-859, ref-deduped, no value diff)
- runtimeEventPolicy terminal patch always-fresh object (156-176)
- diff.ts presenceSignature global-boolean blast radius re-triggers #5/#6 roster-wide
- RetroOffice3D syncArrivalState 150ms interval: setters value-guarded but effect deps on whole `standupMeeting` object → interval torn down/recreated per poll
- useOfficeStandupController 60s scheduled-standup interval torn down/recreated per render (functional bug: auto-standup unreliable — separate issue)
- OfficeScreen prepared-calls/texts/jukebox/feedEvents/gym effects: re-run every render via #11 churn but individually guarded
- setClockTick 2s heartbeat: intentional

## LOW risk / ruled out
~40 sites across both monoliths + hooks with real guards (value diffs, idempotency refs, one-shot timers, event-driven): includes applyGatewayTaskRecord/recovered-task effects (hardened in 5a9f9cf), reduceMarkActivityThrottled (300ms throttle — the exemplar done right), DeskNameplates 400ms signature-diffed, AdaptiveDpr throttled+thresholded, useRuntimeConnection feed effect (correctly memoized).

## Top-3 suspects + recommended falsification order
1. **TrailSystem (#26)** — disable, measure warning rate. Cheapest isolated test.
2. **RetroOffice3D feedEvents mood/speech effects (#17-20)** — zero guards, Date.now() into state.
3. **OfficeScreen animationNowMs in render body (#11) + disabled RAF batcher** — two independent defenses absent exactly where the bug lives.
Then, if bursts persist: store.tsx reducer value-diffing (#2/#3), summary-refresh coalescing + timestamp quantization (#5/#6 — the Date.now() derivation lives in OUR aihub snapshot.ts and is freely fixable).

## RUNTIME CONFIRMATION (t12-fresh-eyes, 2026-07-10) — supersedes the falsification order
Root cause proven by runtime stack capture + in-page sourcemap decoding (console's "OfficeScreen.tsx:3143" was a GENERATED line mapping cleanly to source :3256):
- **Looping setState: `setGymCooldownUntilByAgentId` (OfficeScreen.tsx:3256), effect 3254-3294, deps `[immediateGymHoldByAgentId, state.agents]`.**
- **Factor A (structural):** `animationNowMs = Date.now()` (line 3184) sits in the `officeAnimationState` memo deps (3185-3231) → memo rebuilds EVERY render → `skillGymHoldByAgentId` (3219) → `immediateGymHoldByAgentId` (3246-3252) new identity every render → effect re-runs every render. (= HIGH #11 in the table above.)
- **Factor B (trigger, needs churn):** a flipped gym hold makes the updater write `now + GYM_WORKOUT_LATCH_MS` from a render-scoped `Date.now()` (3271) — the ~1ms-advancing value defeats the content bailout (3286-3291) each nested re-render → cascade to React's 50-update cap.
- Measured: ~0.2/sec steady (poll-gated, gaps 3.6-7.6s), fixed ~105-commit burst per error = one capped runaway per trigger. `setClockTick` (1656) appeared once as a benign bystander. ONE dominant loop — TrailSystem/#17-20/#25 are perf smells, not this bug.
- Fix: stabilize/quantize `animationNowMs` (kill Factor A) + harden effect 3254 (pure updater — move the `prevImmediateGymHoldRef` mutation out of the state updater; stable `now` for the latch so the bailout works — kill Factor B).

## Static↔runtime reconciliation (final)
The sweep's deep re-trace of effect 3254-3294 found the guard "statically correct in the happy path" (latch via `prevImmediateGymHoldRef`, single `Date.now()` per execution, exhaustive key+value check) but explicitly could not rule out double-invoke/concurrent-render subtleties — and the runtime capture proved that subtlety fires: the ref is mutated INSIDE the state updater (impure), so under nested cascading renders the latch corrupts and the advancing `now` defeats the bailout. Lesson recorded: a guard that reads correct statically can still loop under React 19 nested-render semantics; runtime stack evidence is the arbiter. Also verified: the other consumers of the poisoned `officeAnimationState` are airtight by construction (phone/text cleanups keep original refs; janitor cues are id-keyed), and the feedEvents mood/speech effects are DEMOTED from the top suspects (feed-cadence-driven, not render-driven; still unguarded — backlog). Fallback if the gym fix doesn't zero the bursts: store.tsx `updateAgent`/`hydrateAgents` value-diffing (the amplifier one level upstream).

## Backlog candidates regardless of T12 outcome
- Re-enable RAF livePatchQueue in office view (arch finding)
- Quantize `hubUpdatedAtMs` in aihub snapshot.ts (stable values for unchanged ages)
- store.tsx shallow-equality bail-outs
- standup.config upsert guard (audit verdict 2)
- syncArrivalState: depend on standupMeeting fields, not object
- scheduled-standup interval stability (functional bug)

## ROUND-3 CONTAINMENT — corrected verdict (2026-07-10)

The "RUNTIME CONFIRMATION" attribution above (gym-cooldown, 91% at OfficeScreen:3256) was a
**frequency artifact**, corrected by a per-render dep-diff on the `officeAnimationState` memo under
3-agent live churn:

- **TRUE DRIVER = `officeTriggerState`** identity-churn: **1256/60s (~50×/cascade)** poisoning the
  memo, while `state.agents` stayed FLAT (0). Not gym.
- **Gym-cooldown = BYSTANDER**: instrumented counters show its effect runs ~51/sec with **ZERO state
  changes** (updater always bails). It's the most-frequently-CALLED setter (~50×/cascade), so it
  dominated the error-stack sample even though it never commits. Both the stack interceptor and the
  offset dev-sourcemaps were fooled by this.
- **UNRESOLVED PARADOX (verbatim):** no `setOfficeTriggerState` caller fires 50×/cascade — onEvent
  fired 2×/30s; the only passive-effect setter (reconcile) is `[state.agents]`-gated and state.agents
  is flat — yet officeTriggerState identity changes ~50×/cascade. Mechanism not resolved.
- **Attempted fix FAILED:** value-stabilizing officeTriggerState (`useMemo(…, [JSON.stringify(…)])`)
  did NOT break the cascade — re-measured **27/60s** under active churn (roster 19). Reverted.

**Three diagnosis-method lessons (for the follow-up sprint):**
1. Sequential-window A/B under intermittent churn produced **THREE false positives** (TrailSystem,
   gym, officeTriggerState — every "0" was a churn lull; every active-churn window ~24-46/60s).
   Measure under CONSTANT verified churn ONLY.
2. Error-stack frequency ≠ causation — call-frequency sampling bias toward the most-CALLED setter.
3. Dev-build artifacts (React StrictMode double-invokes, offset sourcemaps, dev error overlay)
   systematically polluted diagnosis.

**Recommended follow-up path (dedicated stabilization sprint, NOT Phase 2):**
1. Reproduce on a **PRODUCTION build** (`npm run build && npm start` on :3100) — removes
   StrictMode/dev-overlay confounds; may change behavior entirely.
2. **First structural candidate: re-enable the RAF `livePatchQueue` batching in the office view**
   (arch finding above) — batching the synchronous dispatch storm plausibly breaks ANY dep's cascade
   regardless of which one churns.
3. `store.tsx` value-diffing bail-outs (#2/#3 amplifier).
4. React Profiler over monkey-patched consoles.

**Shipped state:** gym-cooldown hardening KEPT (correct); officeTriggerState stabilization + TrailSystem
guard REVERTED. T12 = precisely-documented **P2 OPEN debt** (non-fatal: canvas renders, roster exact,
animations verified every round).

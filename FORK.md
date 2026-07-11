# FORK.md — aihub-office (fork of claw3d)

**Upstream:** https://github.com/iamlukethedev/claw3d (MIT, © Luke The Dev)
**Fork purpose:** the 3D virtual office for Ken's AI Hub — driven by the hub's `/api/live`
(FastAPI, `127.0.0.1:3000`) instead of an OpenClaw gateway. Studio runs on **port 3100**.
**Plan of record:** `/Users/k3n/.claude/plans/i-want-you-to-parsed-rocket.md` · **Progress:** `docs/aihub/PROGRESS.md`

## Merge policy

- `origin` = k3nmastel2/aihub-office · `upstream` = iamlukethedev/claw3d
- Pull upstream via **merge from release tags** (never rebase): `git fetch upstream && git merge <tag>`
- ALL new logic lives in our namespaces so upstream merges stay mechanical:
  - `src/lib/runtime/aihub/` — provider, snapshot, diff, http, types
  - `src/lib/aihub/` — roles, seating, serviceMap
  - `src/features/retro-office/objects/aihub/` — PodRug, DeskPaperStack, etc.
  - `src/app/api/runtime/aihub/` — hub proxy route
  - `docs/aihub/` — fork docs
- Upstream files receive **small additive edits only**, each logged below.

## Upstream files touched (keep current — conflict map for merges)

| File | Change | Phase |
|---|---|---|
| `.env` (untracked) | `PORT=3100` | 0 |
| `README.md` | attribution + fork banner at top | 0 |
| `src/features/retro-office/RetroOffice3D.tsx` | `canvasResetKey` narrowed to `remoteOfficeEnabled` only (T1 fix — was force-losing the WebGL context on every gateway-status/roster change) | 0/T1 |
| `src/lib/runtime/types.ts` | +`"aihub"` in `RuntimeProviderId` | 1 |
| `src/lib/runtime/createRuntimeProvider.ts` | +`case "aihub"` → `new AihubRuntimeProvider(client, runtimeUrl)` | 1 |
| `src/lib/gateway/GatewayClient.ts` | +`emitSyntheticEvent()`; +`"aihub"` in adapter lists (normalizeLocalGatewayDefaults, profile loop, connect probe branch → `probeAihubRuntime`, disconnect branch); +`"aihub"` in `isAutoManagedAdapter` so it auto-connects/retries on load (T8); +`probeAihubRuntime` import | 1 |
| `src/lib/studio/settings.ts` | +`"aihub"` in `StudioGatewayAdapterType` + `STUDIO_GATEWAY_ADAPTER_TYPES` + `normalizeGatewayAdapterType` + both profile loops; +`aihub` case in `resolveDefaultStudioGatewayProfile` (`DEFAULT_AIHUB_RUNTIME_URL = http://127.0.0.1:3000`); +aihub URL self-heal in `resolveStudioGatewayProfiles` (`coerceAihubProfileUrl`: a non-http(s) aihub profile URL → hub default; T13/T8b — aihub is the only adapter whose URL differs from the shared `ws://…:18789` gateway port) | 1 |
| `src/lib/studio/settings-store.ts` | +`"aihub"` in `normalizeAdapterType` | 1 |
| `src/lib/office/floors.ts` | +`FloorProvider "aihub"`, +`FloorId "aihub-live"`, +OFFICE_FLOORS `aihub-live` entry (sortOrder 29, `aihub-default`) | 1 |
| `src/features/office/components/panels/SettingsPanel.tsx` | +`["aihub","AI Hub"]` dropdown option; +aihub in `tokenOptional` + URL placeholder | 1 |
| `src/features/office/components/OfficeFloorNav.tsx` | +`aihub: "AI Hub"` in `PROVIDER_LABEL` (exhaustive `Record<FloorProvider,string>`) | 1 |
| `src/features/agents/state/store.tsx` | +`hub?: AgentHubMetadata \| null` on `AgentStoreSeed` (import from `@/lib/runtime/aihub/types`) | 1 |
| `src/features/agents/operations/agentFleetHydrationDerivation.ts` | +`hub?` on the `agents.list` entry type + `hub: agent.hub ?? null` on the derived seed (whitelist did not pass `hub` through otherwise) | 1 |
| `src/features/agents/operations/agentFleetHydration.ts` | +`role?`/`hub?` on the fetch-side `AgentsListResult.agents` type | 1 |
| `src/lib/runtime/useRuntimeConnection.ts` | +start/stop live-feed effect keyed on `[provider, status]` (via `isLiveFeedRuntimeProvider`) | 1 |
| `tests/unit/officeFloors.test.ts` | +`aihub-live` in the 3 canonical floor-list assertions (new floor) | 1 |
| `src/features/retro-office/RetroOffice3D.tsx` | `syncRenderAgentUi` diffs before `setRenderAgentUiById` (was a fresh object every 250ms → re-render churn feeding update-depth loops) (T12) | 1/T12 |
| `src/features/office/tasks/useTaskBoardController.ts` | (T12) seed-cards effect depends on `standup.config` not the `standup` object; recovered-request fallback key is content-only (was hashing an advancing timestamp); **`applySharedTaskRecord`/`applyGatewayTaskRecord` are idempotent (`isSameTaskBoardCardIgnoringTimestamps`) — skip re-upsert of unchanged cards on every poll (T12c primary churn root: aihub populates the shared task store, and each `refreshSharedTasks` poll re-upserted every card → 2-3/sec state.cards churn → update-depth loop)** | 1/T12 |
| `src/features/office/screens/OfficeScreen.tsx` | (T12c) **gym-cooldown hardening only** (correct pure-updater fix, per team-lead): `animationNowMs` quantized to 1s buckets + `prevImmediateGymHoldRef` mutation moved out of the state updater + quantized latch `now`. NOTE: gym proved a BYSTANDER (setState *called* ~50×/cascade but always bails; the 91% stack-decode was call-frequency sampling bias), and the `officeTriggerState` value-stabilization tried here was **REVERTED** (measured-ineffective: 27/60s under active churn + JSON.stringify-per-render cost). TrailSystem guard (c92bff0) also REVERTED (churn-variance false positive). **T12 = OPEN / precisely-documented P2 debt** — no verified fix; the driver is `officeTriggerState` identity-churn poisoning the `officeAnimationState` memo (dep-diff: 1256/60s ~50×/cascade, state.agents flat) with an unresolved paradox. Full evidence + follow-up path in `docs/aihub/T12-STATIC-SWEEP.md` + PROGRESS.md T12c. | 1/T12c (debt) |
| `src/features/retro-office/core/types.ts` | +`leavingSince?: number` on `RenderAgent` (drives the despawn opacity fade) (Phase 2) | 2 |
| `src/features/retro-office/RetroOffice3D.tsx` | (Phase 2) `useAgentTick` gains `spawnAtDoor`/`leavingByAgentId`/`leavingInPlaceByAgentId` params: `pickSpawnPoint` returns the aihub door for `spawnAtDoor` (aihub agents walk in vs. random teleport); a leaving-override block routes walk-out agents to `AIHUB_DOOR_EXIT` + latches `leavingSince`, flash agents freeze in place. New props `leavingByAgentId`/`leavingInPlaceByAgentId`; `spawnAtDoor = activeAdapterType === "aihub"`; `resolvedCleaningCues` now MERGES the standalone `cleaningCues` prop with animation-state cues (renderer dedups by id). Imports `objects/aihub/door`. | 2 |
| `src/features/retro-office/objects/agents.tsx` | (Phase 2) despawn fade: a leaving agent (`agent.leavingSince`) ramps body opacity to 0 over `AIHUB_LEAVING_FADE_MS` (takes precedence over the `isAway` dim), and the whole avatar group hides once faded so hub-retained done nodes don't linger as a floating nameplate. Imports `AIHUB_LEAVING_FADE_MS`. (badge billboard, nameplate chips, role props still pending — phases 4, 7) | 2 |
| _(pending)_ `src/features/retro-office/objects/agents.tsx` | badge billboard, nameplate chips, role props | 4, 7 |
| _(pending)_ `src/features/retro-office/core/furnitureDefaults.ts` | +`"aihub"` layout preset | 3 |
| `src/features/office/screens/OfficeScreen.tsx` | (Phase 2) `EMPTY_BOOLEAN_RECORD`/`EMPTY_CLEANING_CUES`/`SESSION_LEAVE_CUE_LIMIT` module consts; one memo computes `leavingByAgentId`/`leavingInPlaceByAgentId` via `resolveLeavingPlan` (client-side `firstSeenByAgentId` ref for the flash window; ref-stabilized to keep agent-tick deps quiet); one `[state.agents]` effect emits session-leave janitor cues via `buildSessionGroups`/`resolveSessionLeaveCues` (guarded setState, only on new cues); passes the three new props (`cleaningCues`, `leavingByAgentId`, `leavingInPlaceByAgentId`) to RetroOffice3D. (seating memo still pending — phase 3) | 2 |
| _(pending)_ `src/features/office/screens/OfficeScreen.tsx` | +seating memo | 3+ |

Update the table whenever an upstream file is touched. Rows marked _(pending)_ are planned, not yet applied.

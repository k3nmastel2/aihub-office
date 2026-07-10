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
| `src/lib/gateway/GatewayClient.ts` | +`emitSyntheticEvent()`; +`"aihub"` in adapter lists (normalizeLocalGatewayDefaults, profile loop, connect probe branch → `probeAihubRuntime`, disconnect branch, shouldPromptForConnect); +`probeAihubRuntime` import | 1 |
| `src/lib/studio/settings.ts` | +`"aihub"` in `StudioGatewayAdapterType` + `STUDIO_GATEWAY_ADAPTER_TYPES` + `normalizeGatewayAdapterType` + both profile loops; +`aihub` case in `resolveDefaultStudioGatewayProfile` (`DEFAULT_AIHUB_RUNTIME_URL = http://127.0.0.1:3000`) | 1 |
| `src/lib/studio/settings-store.ts` | +`"aihub"` in `normalizeAdapterType` | 1 |
| `src/lib/office/floors.ts` | +`FloorProvider "aihub"`, +`FloorId "aihub-live"`, +OFFICE_FLOORS `aihub-live` entry (sortOrder 29, `aihub-default`) | 1 |
| `src/features/office/components/panels/SettingsPanel.tsx` | +`["aihub","AI Hub"]` dropdown option; +aihub in `tokenOptional` + URL placeholder | 1 |
| `src/features/office/components/OfficeFloorNav.tsx` | +`aihub: "AI Hub"` in `PROVIDER_LABEL` (exhaustive `Record<FloorProvider,string>`) | 1 |
| `src/features/agents/state/store.tsx` | +`hub?: AgentHubMetadata \| null` on `AgentStoreSeed` (import from `@/lib/runtime/aihub/types`) | 1 |
| `src/features/agents/operations/agentFleetHydrationDerivation.ts` | +`hub?` on the `agents.list` entry type + `hub: agent.hub ?? null` on the derived seed (whitelist did not pass `hub` through otherwise) | 1 |
| `src/features/agents/operations/agentFleetHydration.ts` | +`role?`/`hub?` on the fetch-side `AgentsListResult.agents` type | 1 |
| `src/lib/runtime/useRuntimeConnection.ts` | +start/stop live-feed effect keyed on `[provider, status]` (via `isLiveFeedRuntimeProvider`) | 1 |
| `tests/unit/officeFloors.test.ts` | +`aihub-live` in the 3 canonical floor-list assertions (new floor) | 1 |
| _(pending)_ `src/features/retro-office/RetroOffice3D.tsx` | door-spawn branch, leaving/fade props, pod rugs render | 2–3 |
| _(pending)_ `src/features/retro-office/objects/agents.tsx` | badge billboard, nameplate chips, fade, role props | 4, 7 |
| _(pending)_ `src/features/retro-office/core/furnitureDefaults.ts` | +`"aihub"` layout preset | 3 |
| _(pending)_ `src/features/office/screens/OfficeScreen.tsx` | +seating memo, prop pass-through | 3+ |

Update the table whenever an upstream file is touched. Rows marked _(pending)_ are planned, not yet applied.

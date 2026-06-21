# Remote Maintenance Pressure Telemetry (Event-Driven)

## What changed

- Added `RemoteRoomPlan.maintenance` telemetry model in `src/types.d.ts`.
- Added shared calculator and trigger helpers in `src/room/remote/maintenance.ts`.
- Wired setup trigger in `remoteMining.activate(...)` to initialize maintenance and mark `needsRefresh=true` with `lastTrigger='setup'`.
- Wired maintainer-death trigger in `updateRemoteRoomPlans(...)` by detecting assigned `remoteMaintainer` count drops per remote.
- Wired memory-audit trigger in `runFullAudit()` to request refresh for all enabled remotes (`lastTrigger='memoryAudit'`).
- Recompute now runs only when `needsRefresh=true` and remote vision exists.
- If refresh is requested without vision, last values are preserved and `stale=true`.
- Extended remote debug output with a `Maintenance Pressure` section showing metadata + separate decay/backlog breakdown.

## Scope notes

- Pressure scope is intentionally roads/containers only.
- No combined decay+backlog scalar is computed.
- No maintainer body/count auto-scaling was added; telemetry only.

## Verification

- `npm run build` passed.
- `git diff --check` passed.

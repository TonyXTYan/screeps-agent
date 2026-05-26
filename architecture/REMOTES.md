# Remote Mining Architecture

## Opt-In Model

Remotes are configured under `Memory.rooms[home].plan.remoteRooms` (or via `remoteMining.activate/configure`).

## RemoteRoomPlan Highlights

Key fields:

- `enabled`, `roomName`, `mode` (`harvest|reserve|claim`)
- `reserve`, `buildRoads`, `maintainRoads`
- `dangerUntil`, `manualPauseUntil`, `skipReason`, `lastSeenHostiles`, `lastPatrolDangerNotifyAt`
- `maintenance` pressure snapshot
- `sources` source-level route/station/demand metadata

## Remote Archetypes

- `remoteScout`
- `remoteMiner`
- `remoteHauler`
- `remoteMaintainer`
- `claimer`
- `patrol` (home-based defense unit that rotates and converges into remotes)

## Spawn Flow (Summary)

Local spawn planner chooses requests in strategic priority, then remote requests.

At `RCL >= 6`, patrol sizing is:

- `baseline = ceil(enabledRemoteRooms / 2)` (all enabled modes)
- `target = baseline + visibleArmedHostiles`

Remote economy requests continue to use source-work/haul/maintenance deficits.

## Remote Assignment and Safety

- Remote creeps no longer auto-retreat to home room when hostiles appear.
- Non-patrol creeps evade nearby armed hostiles using `REMOTE_HOSTILE_EVADE_DISTANCE`.
- `dangerUntil` is no longer a normal remote assignment/spawn gate.
- Manual operator pause is still supported through `manualPauseUntil`.

## Fail-Safe Danger Marker

`dangerUntil` + `skipReason='danger'` is now fail-safe telemetry only.

A remote is marked danger when:

1. armed hostiles are visible in that remote, and
2. patrol coverage for the home room is zero.

On transition, the system logs and sends `Game.notify` (cooldown throttled per remote).

## Remote Miner Lifecycle

- Active miners do not home-renew.
- Source-targeted standby replacement is triggered at low TTL.
- Standby pre-positions near the remote source and promotes when incumbent dies.

## Remote Hauler Lifecycle

- Assigned-source-first pickup with guarded cross-source overflow.
- Return-home deposit cycle.
- Conditional post-trip renew windows.
- Home idle/wander behavior when no pickup target is available.

## Maintenance Telemetry

Remote maintenance pressure remains event-driven (`setup`, `maintainerDeath`, `maintainerTtl500`, `memoryAudit`) and is used for maintainer target sizing.

## Console API

`globalThis.remoteMining` remains:

- `activate(home, remote, options?)`
- `configure(home, remote, options?)`
- `pause(home, remote, ticks?)`
- `disable(home, remote)`
- `status(home, remote?)`

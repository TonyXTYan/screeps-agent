# Remote Mining Architecture

## Opt-In Model

Remotes are configured under `Memory.rooms[home].plan.remoteRooms` (or via `remoteMining.activate/configure`).

## RemoteRoomPlan Highlights

Key fields:

- `enabled`, `roomName`, `mode` (`harvest|reserve|claim`)
- `reserve`, `buildRoads`, `maintainRoads`
- `dangerUntil`, `manualPauseUntil`, `skipReason`, `lastSeenHostiles`, `lastSeenInvaderCoreAt`, `lastSeenHostileControllerAt`, `lastPatrolDangerNotifyAt`
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
- `hostileRooms = (homeArmedHostiles > 0 ? 1 : 0) + enabledRemotesWithVisibleArmedHostiles`
- `cap = 2 + 2 * enabledRemoteRooms`
- `target = min(baseline + hostileRooms, cap)`

Remote economy requests continue to use source-work/haul/maintenance deficits.

## Remote Assignment and Safety

- Remote creeps no longer auto-retreat to home room when hostiles appear by default.
- Non-patrol creeps evade nearby armed hostiles using `REMOTE_HOSTILE_EVADE_DISTANCE`.
- `dangerUntil` is not a normal gate, except armed-hostile fail-safe when threatened-room deployed patrol coverage is zero.
- Manual operator pause is still supported through `manualPauseUntil`.

## Fail-Safe Danger Marker

`dangerUntil` + `skipReason='danger'` is telemetry plus an armed-hostile failsafe.

A remote is marked danger when:

1. armed hostiles are visible in that remote, and
2. no non-renewing patrol from the same home is physically in that remote room.

On transition, the system logs and sends `Game.notify` (cooldown throttled per remote).

While the armed failsafe is active for a remote:

- assigned non-combat remote creeps retreat to home room.
- if already executing `travelRoom` toward home, retreat steering is directed to the home exit with hostile-avoid costs.
- non-combat remote spawn requests for that remote are skipped.
- once armed hostiles are no longer visible, the danger marker is held until `dangerUntil` expires before clearing.

Coverage for this gate is threat-room-local: only non-renewing patrols from the same home that are physically in the threatened remote room count as active coverage.

Non-creep threats (`invader core`, hostile controller owner/reservation) are tracked in telemetry and intentionally do not trigger this retreat/block gate by themselves.

CLAIM creeps only auto-attack controllers in NPC Invader states (`owner/reservation.username === 'Invader'`).

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

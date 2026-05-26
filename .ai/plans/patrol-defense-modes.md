# Patrol Defense Modes Plan

## Implemented Now

### `expel` mode (active)

- Home rooms at `RCL >= 6` maintain patrol coverage:
  - `baseline = ceil(enabledRemoteRooms / 2)`
  - `target = baseline + visibleArmedHostiles`
- Patrol creeps rotate enabled remotes and converge on visible armed hostiles.
- Target priority: hostile `HEAL` > `RANGED_ATTACK` > `ATTACK`.
- Remote economy creeps no longer auto-retreat home; they evade near hostiles.

## Deferred Modes

### `war-defense` mode (deferred)

- Defensive concentration around owned-room perimeters and critical remote corridors.
- Explicit fallback from remote expel into home-border hold logic.
- Threat-tier policies (NPC invader vs player skirmish vs boosted squad).

### `war-offense` mode (deferred)

- Intentional assault mode for hostile rooms/structures.
- Target package planning (harass, deny mining, structure teardown).
- Formation-level orchestration and boost-aware composition.

## Entry Criteria For Future Work

- Patrol expel telemetry is stable and false positives are low.
- Threat classification and patrol routing are tested across multi-remote contention.
- CPU budget remains acceptable under simultaneous hostile events.

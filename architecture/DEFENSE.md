# Defense Architecture

## Three-Layer Defense

```
┌──────────────────────────────────────────┐
│ Layer 1: Towers                           │
│ - Attack armed hostiles (highest priority)│
│ - Heal injured friendly creeps            │
│ - Repair urgent structures                │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ Layer 2: Patrol Creeps                    │
│ - Strategic patrol spawn at RCL >= 6      │
│ - Baseline + hostile surge sizing          │
│ - Converge on visible armed hostiles       │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ Layer 3: Non-Combat Evade                 │
│ - Non-patrol creeps dodge nearby hostiles │
│ - HEAL creeps can emergency-heal allies   │
└──────────────────────────────────────────┘
```

## Layer 1: Towers (tower/basics.ts)

Executed every tick per room in `towerBasics.run(room)`.

### Priority per tower (in order)

1. Attack closest armed hostile creep (always, any energy).
2. Heal/repair branch when tower energy is above staged thresholds.
3. Critical-only repair branch at mid energy in peace mode.

Wall/rampart caps are still provided by `wallRampartRepairCap()` in `role/doctor.ts`.

## Layer 2: Patrol Creeps (`room/remote/spawn.ts` + `role/patrol.ts`)

### Spawn sizing

At `RCL >= 6`, patrol target per home room is:

- `baseline = ceil(enabledRemoteRooms / 2)`
- `target = baseline + visibleArmedHostiles` (home + enabled remotes)

At `RCL < 6`, patrol is only used as an emergency home-defense fallback:

- `target = armedHostilesInHomeRoom`
- no remote combat dispatch below RCL 6

`enabledRemoteRooms` counts all enabled remote modes (`harvest`, `reserve`, `claim`).

### Patrol behavior (expel mode)

- Patrols converge on visible armed hostiles in home room and enabled remotes.
- Hostile target priority: `HEAL` parts first, then `RANGED_ATTACK`, then `ATTACK`.
- When no armed hostile is visible in the chosen room, patrols can clear visible invader cores.
- If no active threat is visible, patrols rotate through enabled remotes.
- Rotation cadence is provided by `getPatrolRotationTicks()` (currently returns `100`).
- Patrols renew in home room when no active threat and TTL is low.

## Layer 3: Non-Combat Evade (`main.ts`)

When a non-patrol creep has an armed hostile nearby:

1. HEAL-capable creeps may prioritize emergency ally healing.
2. Otherwise use `PathFinder` flee from hostile danger zones.
3. Fallback to edge nudge if no flee path.

Remote creeps no longer hard-retreat to home room on contact by default.

### Tunable evade distance

Evade radius is controlled by:

- `REMOTE_HOSTILE_EVADE_DISTANCE` in `room/constants.ts` (default `5`).

## Patrol Fail-Safe Danger Marker

`dangerUntil/skipReason` is primarily telemetry, with one armed-threat fail-safe gate.

A remote is marked danger only when:

- armed hostiles are visible, and
- patrol coverage for the home room is zero.

When that happens, the bot logs and sends `Game.notify` (cooldown throttled per remote), and:

- non-combat remote creeps assigned to that remote retreat to home room.
- non-combat remote spawns for that remote are blocked until danger clears or patrol coverage returns.

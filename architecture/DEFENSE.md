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
- `target = baseline + visibleArmedHostilesInEnabledRemotes`

`enabledRemoteRooms` counts all enabled remote modes (`harvest`, `reserve`, `claim`).

### Patrol behavior (expel mode)

- Patrols scan enabled remotes and converge on visible armed hostiles.
- Hostile target priority: `HEAL` parts first, then `RANGED_ATTACK`, then `ATTACK`.
- If no active threat is visible, patrols rotate through enabled remotes.
- Rotation cadence is provided by `getPatrolRotationTicks()` (currently returns `100`).
- Patrols renew in home room when no active threat and TTL is low.

## Layer 3: Non-Combat Evade (`main.ts`)

When a non-patrol creep has an armed hostile nearby:

1. HEAL-capable creeps may prioritize emergency ally healing.
2. Otherwise use `PathFinder` flee from hostile danger zones.
3. Fallback to edge nudge if no flee path.

Remote creeps no longer hard-retreat to home room on contact.

### Tunable evade distance

Evade radius is controlled by:

- `REMOTE_HOSTILE_EVADE_DISTANCE` in `room/constants.ts` (default `5`).

## Patrol Fail-Safe Danger Marker

`dangerUntil/skipReason` is now a fail-safe telemetry marker, not a normal retreat gate.

A remote is marked danger only when:

- armed hostiles are visible, and
- patrol coverage for the home room is zero.

When that happens, the bot logs and sends `Game.notify` (cooldown throttled per remote).

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
- `hostileRooms = (homeArmedHostiles > 0 ? 1 : 0) + enabledRemotesWithVisibleArmedHostiles`
- `cap = 2 + 2 * enabledRemoteRooms`
- `target = min(baseline + hostileRooms, cap)`

At `RCL < 6`, patrol is only used as an emergency home-defense fallback:

- `target = 1` when any armed hostile is visible in home room (hostile-room count model)
- no remote combat dispatch below RCL 6
- the emergency patrol request uses full room energy capacity rather than the normal 50% body-budget cap, and waits for that body instead of scaling down

`enabledRemoteRooms` counts all enabled remote modes (`harvest`, `reserve`, `claim`).

Patrol body costs, checked against spawn + extension capacity:

| RCL | Room energy capacity | Best emergency patrol body |
|-----|----------------------|----------------------------|
| 1 | 300 | 140 energy: `TOUGH, ATTACK, MOVE` |
| 2 | 550 | 440 energy: `TOUGH, ATTACK, MOVE, MOVE, HEAL` |
| 3 | 800 | 700 energy: `TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, HEAL` |
| 4 | 1300 | 1100 energy: `TOUGH, TOUGH, ATTACK x6, MOVE x7, HEAL` |
| 5 | 1800 | 1100 energy: same as RCL 4 |

The full-capacity exception mainly matters at RCL 3: the global 50% cap would plan against 400 energy and select a 320-energy no-HEAL patrol, even though the room can support a 700-energy self-healing patrol once extensions are filled.

### Patrol behavior (expel mode)

- Patrols use coordinated room allocation under simultaneous threats:
  - first pass assigns one patrol per armed-threat room when available,
  - remaining patrols are assigned by threat score priority.
- Hostile target priority: `HEAL` parts first, then `RANGED_ATTACK`, then `ATTACK`.
- When no armed hostile is visible in the chosen room, patrols can clear visible invader cores.
- If no active threat is visible, patrols rotate through enabled remotes.
- Rotation cadence is provided by `getPatrolRotationTicks()` (currently returns `100`).
- Patrols renew in home room when idle, and may also renew during remote-only threats if already home or critically low TTL.

## Layer 3: Non-Combat Evade (`main.ts`)

When a non-patrol creep has an armed hostile nearby:

1. HEAL-capable creeps may prioritize emergency ally healing.
2. If an armed-hostile fail-safe retreat is active and the creep is already traveling home, it steers toward the exit to home with hostile-avoid costs.
3. Otherwise use `PathFinder` flee from hostile danger zones.
4. Fallback to edge nudge if no flee path.

Remote creeps no longer hard-retreat to home room on contact by default.

### Tunable evade distance

Evade radius is controlled by:

- `REMOTE_HOSTILE_EVADE_DISTANCE` in `room/constants.ts` (default `5`).

## Patrol Fail-Safe Danger Marker

`dangerUntil/skipReason` is primarily telemetry, with one armed-threat fail-safe gate.

A remote is marked danger only when:

- armed hostiles are visible, and
- no non-renewing patrol from the same home room is physically deployed in that threatened remote room.

When that happens, the bot logs and sends `Game.notify` (cooldown throttled per remote), and:

- non-combat remote creeps assigned to that remote retreat to home room.
- non-combat remote spawns for that remote are blocked until danger clears or patrol coverage returns.
- danger clear is delayed until `dangerUntil` expires after armed hostiles are no longer visible.

Reviewer note: this fail-safe gate is intentionally armed-hostile-only; invader cores and hostile controller states remain telemetry-only and do not trigger retreat/spawn blocking by themselves.

Controller attack fallback for CLAIM creeps is restricted to NPC Invader controller states only (`owner/reservation.username === 'Invader'`).

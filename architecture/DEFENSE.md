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

At `RCL < 6`, patrol **spawning** is limited to an emergency home-defense fallback:

- `target = 1` when any armed hostile is visible in home room (hostile-room count model)
- no remote baseline patrol is spawned below RCL 6
- the emergency patrol request uses full room energy capacity rather than the normal 50% body-budget cap, and waits for that body instead of scaling down

The patrol **behavior** (`role/patrol.ts`) is not RCL-gated. An existing patrol — including one spawned as RCL < 6 home defense — runs `visibleRemoteThreats` every tick and will respond to remote threats just like an RCL 6+ patrol.

`enabledRemoteRooms` counts all enabled remote modes (`harvest`, `reserve`, `claim`).

Patrol body costs, checked against spawn + extension capacity:

| RCL | Room energy capacity | Best emergency patrol body |
|-----|----------------------|----------------------------|
| 1 | 300 | 140 energy: `TOUGH, ATTACK, MOVE` |
| 2 | 550 | 440 energy: `TOUGH, ATTACK, MOVE, MOVE, HEAL` |
| 3 | 800 | 770 energy: `TOUGH, ATTACK x2, RANGED_ATTACK, MOVE x4, HEAL` |
| 4 | 1300 | 1160 energy: `TOUGH x2, ATTACK x3, RANGED_ATTACK x2, MOVE x7, HEAL` |
| 5 | 1800 | 1160 energy: same as RCL 4 |

The full-capacity exception mainly matters at RCL 3: the global 50% cap would plan against 400 energy and select a 320-energy no-HEAL patrol, even though the room can support a 770-energy self-healing hybrid patrol once extensions are filled.

### Patrol behavior (expel mode)

- Patrols use coordinated room allocation under simultaneous threats:
  - first pass assigns one patrol per armed-threat room when available,
  - remaining patrols are assigned by threat score priority.
- Hostile target priority: `HEAL` parts first, then `RANGED_ATTACK`, then `ATTACK`.
- Combat pursuit is **clamped to the threat room**: `moveToCombatTarget` paths with `maxRooms: 1` and treats the room's exit tiles as impassable, and the threat loop nudges the patrol off any edge tile before moving. This prevents a border-hugging hostile from dragging the patrol across the room boundary (crossing would drop room vision and revert the patrol to rotation, producing a cross-boundary ping-pong). A hostile that leaves the remote is treated as expelled rather than chased out of the room.
- When no armed hostile is visible in the chosen room, patrols can clear visible invader cores.
- If no active threat is visible, patrols rotate through enabled remotes.
- Rotation cadence is provided by `getPatrolRotationTicks()` (currently returns `50`).
- During threat-free rotation, patrols loiter around the remote controller (about range 5) with short jitter for one cadence window, then rotate to the next remote.
- Patrols start renew at `TTL <= 300`; while armed threats are **visible in any enabled remote or home room** (`visibleRemoteThreats` scans all rooms in `Game.rooms`) they continue renewing only until `TTL > 500`, then re-engage; without armed threats they renew until `TTL >= 1400`. A renewing patrol is in the home room — remote rooms that no other patrol is covering become invisible, so those threats typically won't be seen during the renew window. If a remote threat appears while the sole patrol for that remote is renewing, the fail-safe danger marker fires and the remote shuts down; no extra patrol is spawned (the threat is invisible so `hostileRooms` does not spike). The patrol resumes normal rotation after renewal and responds on the next visit, or the fail-safe clears via `dangerUntil` expiry.

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
- non-combat remote spawns for that remote are blocked until danger clears.
- when the room is visible and armed hostiles are gone, danger hold applies for 50 ticks before `dangerUntil/skipReason` clears and retreat/spawn blocking stops.
- if the room is not visible, the fail-safe can remain active until `dangerUntil` expires.

Reviewer note: this fail-safe gate is intentionally armed-hostile-only; invader cores and hostile controller states remain telemetry-only and do not trigger retreat/spawn blocking by themselves.

Controller attack fallback for CLAIM creeps is restricted to NPC Invader controller states only (`owner/reservation.username === 'Invader'`).

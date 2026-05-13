# Remote Mining Architecture

## Opt-In Model

Remote operations are **never automatic**. The user must explicitly configure them via Memory or the
`remoteMining` console API:

```js
remoteMining.activate('W7N9', 'W8N9', {
  reserve: true,
  buildRoads: true,
  maintainRoads: true
})
```

This writes to `Memory.rooms.W7N9.plan.remoteRooms.W8N9`.

## RemoteRoomPlan Schema

```
enabled: boolean
roomName: string
mode: 'harvest' | 'reserve' | 'claim'
reserve?: boolean          (default true in harvest mode)
buildRoads?: boolean       (default true)
maintainRoads?: boolean    (default true)
debugPaths?: boolean       (default false)
debugCreeps?: boolean      (default false)
dangerUntil?: number       (set when hostiles detected)
lastScouted?: number
lastSeenHostiles?: number
skipReason?: string
sources?: {
  [sourceId: string]: {
    sourceId, stationX, stationY, containerId,
    pathSerialized, pathDistance, pathUpdatedAt,
    workDemand, haulerCapacityDemand,
    assignedMinerWork, assignedHaulerCapacity, lastSeen
  }
}
```

## Remote Creep Archetypes

| Archetype | Role |
|-----------|------|
| `remoteScout` | Explores unvisited remote rooms, discovers sources and paths |
| `remoteMiner` | Static miner assigned to a specific source |
| `remoteHauler` | Transports energy from remote containers back to home room |
| `remoteMaintainer` | Builds & repairs roads and containers in the remote room |
| `claimer` | Reserves or claims the remote controller |

## Remote Spawn Flow

`remoteSpawnRequest()` runs per remote room in spawn priority order:

```
For each configured remote room:
  ├─ No source data?          → spawn remoteScout
  ├─ Mode: harvest, needs reserve? → spawn claimer (min 2 CLAIM)
  ├─ For each known source:
  │   ├─ Miner work deficit?  → spawn remoteMiner (respect per-source active slot cap)
  │   ├─ Hauler cap deficit?  → spawn remoteHauler (max 2/source)
  │   └─ (Standby dispatched separately)
  ├─ Needs maintenance?       → spawn remoteMaintainer
  ├─ Needs standby miner?     → spawn remoteMiner (remoteStandby=true)
  └─ Mode: reserve/claim?     → spawn claimer
```

## Hauler Capacity Model

Hauler demand is computed per source:

```
haulerCapacityDemand = min(
  2500,
  ceil((source.energyCapacity / ENERGY_REGEN_TIME) * pathDistance * 2 * 1.2)
)
```

- The **2500 cap** bounds distance-weighted demand for far remotes
- **Max 2 haulers per source** regardless of distance
- Body uses CARRY+MOVE as the core, with optional trailing WORK when budget allows

## Remote Miner Slot Caps

- Active remote miners are slot-capped per source to avoid static-mining deadlocks.
- Sources with a planned container or fixed station tile allow **1 active miner**.
- Non-static sources allow up to **2 active miners** (terrain/access permitting).
- If all source slots are full, extra remote miners are pushed into standby flow instead of crowding source stations.

## Hauler Target Selection

- Empty remote haulers select from source containers first, then dropped energy, then links.
- Candidate energy is reduced by in-flight remote-hauler claims before selection.
- Per-target assignment is decongested with an access-tile-aware soft cap (up to 2 empty haulers per target).
- If a hauler remains stuck on one tile for 4+ ticks while on `withdrawEnergy`/`pickupEnergy`, it temporarily avoids its current target and retargets.

## Path Caching

Paths from home storage/spawn to each remote source station are cached to avoid re-pathing every tick:

```
1. PathFinder.search() → path + distance
2. Serialize to JSON: [[x,y,roomName], ...]
3. Store in sourcePlan.pathSerialized
4. Refresh every 5000 ticks (REMOTE_PATH_REFRESH_INTERVAL)
5. If PathFinder returns incomplete, fall back to linear distance × 50
6. Incomplete paths retry quickly (about 100 ticks vs 5000)
```

## Infrastructure Placement

### Containers
Placed adjacent to remote source stations when a station tile exists and no container is present.

### Roads
Placed along discovered paths at `REMOTE_ROAD_SITES_PER_TICK` (4) sites per tick, capped at
`REMOTE_MAX_UNFINISHED_ROAD_SITES` (3). Roads are **skipped in owned rooms** so manual base
layouts are preserved.

## Danger Handling

When a remote room is visible and contains armed hostiles, an invader core, or hostile controller control/reservation:

```
1. remote.lastSeenHostiles = Game.time
2. remote.dangerUntil = Game.time + 50 ticks
3. remote.skipReason = 'danger'
4. Remote creeps see dangerUntil and travel back to home room
5. Spawning for this remote is skipped while danger is active
6. After 50 ticks, if no hostiles remain, danger clears
```

## Remote Creep Lifecycle

### Renewal
Remote haulers and maintainers (not miners, not claimers) can renew at the home spawn:
- `renewStartTtl = max(220, oneWayDistance + 80)`
- `renewStopTtl = min(1500, renewStartTtl + 140)`
- Creep switches to `remoteRenewing = true` below start threshold
- Travels home, queues at spawn, returns to work when above stop threshold

### Miner Replacement (Standby Dispatch)
- One `remoteStandby` miner per remote room, idle at home spawn
- Standby routing is evaluated before generic outbound remote travel, so standby miners remain in home until dispatched
- When active miner TTL < 300 → standby dispatched to that source
- Double-dispatch prevention: checks no other miner already holds the same source

## Console API

Exposed on `globalThis.remoteMining` (installed by `main.ts`):

```
remoteMining.activate(homeRoom, remoteRoom, options?)   — enable remote
remoteMining.configure(homeRoom, remoteRoom, options?)  — update settings
remoteMining.pause(homeRoom, remoteRoom, ticks?)         — temporary pause
remoteMining.disable(homeRoom, remoteRoom)               — disable
remoteMining.status(homeRoom, remoteRoom?)               — show config/data
```

Debug helpers on `globalThis.debug`:

```
debug.trackRemote(homeRoom, remoteRoom, on?)             — periodic logging
debug.dumpRemote(homeRoom, remoteRoom)                   — one-shot status
debug.dumpHome(homeRoom)                                 — home room status
```

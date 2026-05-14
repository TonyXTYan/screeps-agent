# Debug Console Guide

Debug helpers are exposed on `globalThis.debug` from `src/debug.ts`. These are independent of remote mining operations and work for any room.

## Functions

### `debug.trackRemote(homeRoom, remoteRoom, on?)`

Toggle periodic remote creep status logging for a remote room (prints every 10 ticks in the main loop).

```js
debug.trackRemote('W7N9', 'W8N9')       // toggle
debug.trackRemote('W7N9', 'W8N9', true)  // enable
debug.trackRemote('W7N9', 'W8N9', false) // disable
```

Also settable via `remoteMining.activate()`/`configure()` with `{ debugCreeps: true }`.

Output format is the same as `debug.dumpRemote()` below.

### `debug.dumpRemote(homeRoom, remoteRoom)`

One-shot remote creep status print — fires immediately regardless of the 10-tick interval or whether `debugCreeps` is enabled.

```js
debug.dumpRemote('W7N9', 'W8N9')
```

Output:

```
[REMOTE] t=70912861 W8N9 (home: W7N9):
  remoteMiner      John          ttl= 450  W8N9     mining      en=50/100  src=59cba123 stn=[41,18] cont W5C1M2
  remoteHauler     Alice         ttl= 380  W7N9     traveling   en=0/250   src=59cba123 pos=[22,29] W0C8M4 job=travelRoom res=-9 stuck=6
  remoteHauler     Bob           ttl= 390  W8N9     hauling     en=0/1400  src=59cba123 pos=[46,12] W0C28M14 job=pickupEnergy tgt=c2fc85f0 res=-9 clm=1
  ...
  --- Allocation ---
  src=4adbfc69  miners=2/1! (8W)  haulers=1 (600C)  demand=5W/500C  dist=90
  src=4adbfc6b  miners=1/1 (4W)  haulers=1 (1000C)  demand=5W/500C  dist=68
  --- Source Details ---
  src=4adbfc69  pos=[42,18]  energy=2500/3000  regen=30
    container=xyz789ab at [41,18]  energy=1200/2000  hp=45000/50000
    miner=John  W=15  TTL=450  mining  pos=[41,18]
  src=4adbfc6b  station=[35,22]  (not visible)
    container=ghi123cd  (not visible)
    miner=Bob  W=12  TTL=300  traveling  pos=[?,?]
```

Columns: `archetype  name  ttl  currentRoom  status  energy  sourceId  pos  [stn=[x,y]]  [target]  body  [job=...] [tgt=...] [res=...] [clm=...] [stuck=...] [to=... ex=...] [trg=[x,y] r=.. p=..]`

Status values:
- `mining` — at remote room with assigned source
- `hauling` — at remote room, moving energy
- `maintaining` — at remote room, repairing/building
- `scouting` — exploring
- `reserving` / `claiming` — claimer at target controller
- `traveling` — not yet at remote room (en route or stuck)
- `standby` — waiting in home room as backup
- `renewing` — being healed at home spawn

Additional columns beyond the basic fields:

| Column | Source | Example | Description |
|--------|--------|---------|-------------|
| `stn=[x,y]` | `creep.memory.stationX/Y` | `stn=[41,18]` | Station position the creep should be at (remoteMiners) |
| **target** | `creep.memory.stationaryTargetId` | `cont`, `src` | Abbreviated type of the structure/object the creep is targeting |
| **body** | `creep.getActiveBodyparts()` | `W5C1M2` | Live body parts (work/carry/move) |
| `job=...` / `tgt=...` | `creep.memory.jobType` / `jobTargetId` | `job=pickupEnergy tgt=c2fc85f0` | Current assigned job and target |
| `res=...` | `creep.memory.lastJobResult` | `res=-9` | Last action return code from the job runner |
| `clm=...` | computed in debug | `clm=1` | Other empty remote haulers already claiming the same energy target |
| `stuck=...` | `creep.memory.travelStuckTicks` | `stuck=6` | Consecutive ticks on the same tile (only shown when > 0) |
| `to=... ex=...` | `jobRoomName` + `Game.map.findExit` | `to=W8N9 ex=N` | Current travel target room and chosen exit direction for `travelRoom` jobs |
| `trg=[x,y] r=.. p=..` | target position + local path probe | `trg=[42,6] r=8 p=12`, `p=!84`, or `p=X` | Target coords, current range, and same-room path length (`X` means incomplete/no path, `!` marks unusually long local path) |

**Allocation** block shows per-source breakdown: miner/hauler counts, WORK/CARRY parts, demand targets, and path distance.
- `miners=A/B` means `A = currently assigned remoteMiners`, `B = estimated safe miner slots for that source`.
- `miners=A/B!` means over-assigned miners for available slots (likely congestion/deadlock risk).

**Source Details** block shows per-source live state (room visible) or plan data (room not visible):
- **Source row**: source ID (last 8 chars), position, energy/regen ticks, or `station=[x,y] (not visible)` when the room is not in `Game.rooms`
- **Container row** (indented, present only when `containerId` exists in plan): container ID (last 8 chars), position, stored energy, HP; or `(not visible)` when the room isn't visible and the container can't be resolved
- **Miner row** (indented, one per assigned remoteMiner): name, WORK parts, TTL, status (`mining`/`traveling`/`renewing`/`standby`), position

### `debug.dumpHome(homeRoom)`

One-shot home creep status print for a room (non-remote creeps only).

```js
debug.dumpHome('W7N9')
```

Output:

```
[HOME] t=12345 W7N9:  en=5000/10000
  builder=1  hauler=2  miner=2  upgrader=1  worker=1  total=7
  miner            miner-Spawn1-1     ttl= 450  harvestSrc  en=0/50      cont W5C1M2 src=4adbfc69
  miner            miner-Spawn1-2     ttl= 400  harvestSrc  en=50/50     cont W5C1M2 src=4adbfc6b
  hauler           hauler-Spawn1-1    ttl= 378  deposit     en=50/600    term W0C8M4
  hauler           hauler-Spawn1-2    ttl= 350  withdraw    en=400/600   term W0C8M4 src=4adbfc69
  worker           worker-Spawn1-1    ttl= 120  build       en=100/250   spawn W3C2M2
  upgrader         upgrader-Spawn1-1  ttl= 200  upgrade     en=30/150    cont W2C1M2 i=refill pri=build
  builder          builder-Spawn1-1   ttl= 180  build       en=80/200    spawn W2C2M2
```

Each line shows: `archetype  name  ttl  jobLabel  en=used/capacity  target  body  [i=interruptReason]  [pri=primaryJob]  src=sourceId`

Additional columns beyond the remote dump:
- **target** — abbreviated structure type of the current job target (`spawn`, `cont`, `term`, `ext`, `tower`, `link`, `lab`, `nuker`, `pSpawn`, `obsv`, `extr`, `fact`, or the mineral/resource type)
- **body** — live body parts (`W{work}C{carry}M{move}`)
- **i=** — interrupt reason if the creep was pulled off a primary job (e.g., `i=refill`, `i=heal`, `i=build`)
- **pri=** — remembered primary job when the creep expects to resume it (e.g., `pri=repair`, `pri=upgrade`)

Status labels are mapped from each creep's `jobType`:

| jobType | Label |
|---|---|
| `harvestSource` | `harvestSrc` |
| `withdrawEnergy` | `withdraw` |
| `withdrawResource` | `wdRsrc` |
| `pickupEnergy` | `pickup` |
| `pickupResource` | `puRsrc` |
| `depositEnergy` | `deposit` |
| `depositResource` | `depRsrc` |
| `depositMineral` | `depositMin` |
| `refillSpawn` | `refill` |
| `refillTower` | `refillTow` |
| `build` | `build` |
| `repair` | `repair` |
| `upgrade` | `upgrade` |
| `heal` | `heal` |
| `mineMineral` | `mineMin` |
| `reserveController` | `reserve` |
| `claimController` | `claim` |
| `travelRoom` | `traveling` |
| `idle` | `IDLE` |
| *(undefined)* | `-` |

A creep showing `IDLE` for many ticks is likely starved of work. A miner with no `src=` means it hasn't been assigned a source yet.

## Auto-Print Memory Flags

Two flags in `RoomMemory` trigger periodic prints without any console interaction. They use `Game.time % 10` offsets so the two outputs don't land on the same tick.

| Flag | Tick offset | What prints |
|------|-------------|-------------|
| `Memory.rooms[room].debug_home` | `% 10 === 0` | same output as `debug.dumpHome(room)` |
| `Memory.rooms[room].debug_remotes` | `% 10 === 1` | same output as calling `debug.dumpRemote(room, remote)` for every remote of that room |

### Enable

```js
// auto-print home creep status every 10 ticks
Memory.rooms['W7N9'].debug_home = true

// auto-print all remote statuses every 10 ticks
Memory.rooms['W7N9'].debug_remotes = true
```

### Disable

```js
delete Memory.rooms['W7N9'].debug_home
delete Memory.rooms['W7N9'].debug_remotes
```

Or set to `false` if you prefer to flip without deleting:

```js
Memory.rooms['W7N9'].debug_home = false
Memory.rooms['W7N9'].debug_remotes = false
```

### Notes

- Both flags survive redeploys (stored in `Memory`, not module-level state).
- `debug_remotes` prints **all** remotes of the room regardless of their individual `debugCreeps` flag. Use `debug.trackRemote()` to limit printing to a single remote instead.
- The two flags are independent; you can enable either or both.

## Troubleshooting

- `debug is undefined`:
  - wait for your code to run one tick after deploy (helper is installed in `loop()`).
- `debug.trackRemote(...)` returns `missing ...`:
  - remote plan not found; create it with `remoteMining.activate(...)` first.

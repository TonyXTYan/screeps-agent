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
[REMOTE] W8N9 (home: W7N9):
  remoteMiner      John          ttl= 450  W8N9     mining      en=50/100  src=59cba123
  remoteHauler     Alice         ttl= 380  W7N9     traveling   en=0/250   src=59cba123
  ...
  --- Allocation ---
  src=4adbfc69  miners=10 (36W)  haulers=1 (600C)  demand=5W/500C  dist=90
  src=4adbfc6b  miners=2 (5W)  haulers=1 (1000C)  demand=5W/500C  dist=68
```

Columns: `archetype  name  ttl  currentRoom  status  energy  sourceId`

Status values:
- `mining` — at remote room with assigned source
- `hauling` — at remote room, moving energy
- `maintaining` — at remote room, repairing/building
- `scouting` — exploring
- `reserving` / `claiming` — claimer at target controller
- `traveling` — not yet at remote room (en route or stuck)
- `standby` — waiting in home room as backup
- `renewing` — being healed at home spawn

Allocation block shows per-source breakdown: miner/hauler counts, WORK/CARRY parts, demand targets, and path distance.

### `debug.dumpHome(homeRoom)`

One-shot home creep status print for a room (non-remote creeps only).

```js
debug.dumpHome('W7N9')
```

Output:

```
[HOME] W7N9:  builder=1  hauler=2  miner=2  upgrader=1  worker=1  total=7
  miner            miner-Spawn1-1     ttl=450  harvestSrc   en=0/50     src=4adbfc69
  miner            miner-Spawn1-2     ttl=400  harvestSrc   en=50/50    src=4adbfc6b
  hauler           hauler-Spawn1-1    ttl=378  deposit      en=50/600
  hauler           hauler-Spawn1-2    ttl=350  withdraw     en=400/600  src=4adbfc69
  worker           worker-Spawn1-1    ttl=120  build        en=100/250
  upgrader         upgrader-Spawn1-1  ttl=200  upgrade      en=30/150
  builder          builder-Spawn1-1   ttl=180  build        en=80/200
```

Status labels are mapped from each creep's `jobType`:

| jobType | Label |
|---|---|
| `harvestSource` | `harvestSrc` |
| `withdrawEnergy` | `withdraw` |
| `depositEnergy` | `deposit` |
| `pickupEnergy` | `pickup` |
| `refillSpawn` | `refill` |
| `refillTower` | `refillTow` |
| `build` | `build` |
| `repair` | `repair` |
| `upgrade` | `upgrade` |
| `heal` | `heal` |
| `mineMineral` | `mineMin` |
| `idle` | `IDLE` |
| `travelRoom` | `traveling` |
| *(undefined)* | `-` |

A creep showing `IDLE` for many ticks is likely starved of work. A miner with no `src=` means it hasn't been assigned a source yet.

## Troubleshooting

- `debug is undefined`:
  - wait for your code to run one tick after deploy (helper is installed in `loop()`).
- `debug.trackRemote(...)` returns `missing ...`:
  - remote plan not found; create it with `remoteMining.activate(...)` first.

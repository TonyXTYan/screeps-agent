# Remote Mining Console Guide

This bot exposes `remoteMining` helpers on `globalThis` from `src/main.ts`.

Use these in the Screeps console to configure and control remote mining.

## Functions

### `remoteMining.activate(homeRoom, remoteRoom, options?)`

Enable remote harvesting from `remoteRoom` for `homeRoom`.

```js
remoteMining.activate('W7N9', 'W8N9')
```

Optional `options`:

- `reserve` (default `true`): allow spawning reservers for the remote controller.
- `buildRoads` (default `true`): place road construction sites on discovered paths.
- `maintainRoads` (default `true`): allow remote maintainers and maintenance flow.
- `debugPaths` (default `false`): render `moveTo` paths in role/archetype colors for creeps assigned to that remote and creeps currently inside that remote room.
- `debugCreeps` (default `false`): print per-creep status for this remote every 10 ticks (see `debugCreeps()` below).

Example:

```js
remoteMining.activate('W7N9', 'W8N9', {
  reserve: true,
  buildRoads: true,
  maintainRoads: true,
  debugPaths: true
})
```

### `remoteMining.configure(homeRoom, remoteRoom, options?)`

Update existing remote settings without recreating the entry.

```js
remoteMining.configure('W7N9', 'W8N9', {
  debugPaths: true
})
```

### `remoteMining.debugCreeps(homeRoom, remoteRoom, on?)`

Toggle per-creep status logging for a remote room (prints every 10 ticks).

```js
remoteMining.debugCreeps('W7N9', 'W8N9')       // toggle
remoteMining.debugCreeps('W7N9', 'W8N9', true)  // enable
remoteMining.debugCreeps('W7N9', 'W8N9', false) // disable
```

Output format:

```
[REMOTE] W8N9 (home: W7N9):
  remoteMiner      John          ttl= 450  W8N9     mining      en=50/100  src=59cba123
  remoteHauler     Alice         ttl= 380  W7N9     traveling   en=0/250   src=59cba123
  remoteMiner      Mark          ttl= 320  W7N9     standby     en=0/100   src=59cba123
  remoteHauler     Bob           ttl= 150  W7N9     renewing    en=0/250   src=59cba123
  remoteScout      Carol         ttl= 520  W9N9     scouting    en=--      src=
```

Columns: `archetype  name  ttl  currentRoom  status  energy(src?)  sourceId`

Status values:
- `mining` — at remote room with assigned source
- `hauling` — at remote room, moving energy
- `maintaining` — at remote room, repairing/building
- `scouting` — exploring
- `reserving` / `claiming` — claimer at target controller
- `traveling` — not yet at remote room (en route or stuck)
- `standby` — waiting in home room as backup
- `renewing` — being healed at home spawn

Use this to debug why remote creeps are spawning but not doing useful work (e.g., stuck traveling, never leaving home, all renewing at once, wrong source assignment).

### `remoteMining.debugCreepsNow(homeRoom, remoteRoom)`

One-shot debug print — same output as `debugCreeps` but fires immediately regardless of the 10-tick interval or whether `debugCreeps` is enabled. Useful for ad-hoc checks without enabling persistent logging.

```js
remoteMining.debugCreepsNow('W7N9', 'W8N9')
```

### `remoteMining.pause(homeRoom, remoteRoom, ticks?)`

Temporarily pauses a remote by setting `dangerUntil`.

```js
remoteMining.pause('W7N9', 'W8N9')       // default 1500 ticks
remoteMining.pause('W7N9', 'W8N9', 400)  // custom duration
```

### `remoteMining.disable(homeRoom, remoteRoom)`

Disables the remote plan (`enabled = false`).

```js
remoteMining.disable('W7N9', 'W8N9')
```

### `remoteMining.homeCreepNow(homeRoom)`

One-shot debug print of all home creeps for a room (non-remote creeps only).

```js
remoteMining.homeCreepNow('W7N9')
```

Output shows per-creep lines with archetype, name, TTL, current job, energy, and source assignment. A fleet summary line at the top shows counts per archetype and a total. Status labels are based on each creep's current `jobType`.

Status labels:
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

Example output:

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

A creep showing `IDLE` for many ticks is likely starved of work. A creep showing `traveling` when it should be in the home room may have a stuck path.

### `remoteMining.status(homeRoom, remoteRoom?)`

Read current remote config and learned remote-source data.

```js
remoteMining.status('W7N9')          // all remotes for home room
remoteMining.status('W7N9', 'W8N9')  // one remote room
```

`status(...)` returns a JSON string (pretty-printed), so the console displays readable text rather than `[object Object]`.

## What Becomes Automatic After Activation

1. Scout bootstrap when source metadata is unknown.
2. Per-source demand calculation:
   - miner work demand from source capacity/regen
   - hauler capacity demand from path distance
3. Container site placement near remote sources.
4. Gradual road construction along discovered paths in non-owned rooms only.
5. Spawning and assignment for:
   - `remoteMiner`
   - `remoteHauler` (hybrid variant includes small `WORK` when budget allows)
   - `remoteScout` (overflow scouts wander to avoid blocking spawn exits)
   - `remoteMaintainer`
   - `claimer` for reserve mode (targeting at least 2 `CLAIM` parts)
6. Danger pause/retreat behavior when `dangerUntil` is active.
7. Optional path visualization (`debugPaths: true`) with role-coded colors for creeps involved in/inside that remote.

## Memory Shape (Reference)

`activate` writes under:

```js
Memory.rooms[homeRoom].plan.remoteRooms[remoteRoom]
```

Initial shape:

```js
{
  enabled: true,
  roomName: 'W8N9',
  mode: 'harvest',
  reserve: true,
  buildRoads: true,
  maintainRoads: true,
  debugPaths: false,
  debugCreeps: false
}
```

Runtime fields are then filled automatically (for example `lastScouted`, `dangerUntil`, `sources[sourceId]`, path distance, container id, demand counters).

## Quick Start For `W7N9 -> W8N9`

```js
remoteMining.activate('W7N9', 'W8N9')
remoteMining.status('W7N9', 'W8N9')
```

If you need to halt temporarily:

```js
remoteMining.pause('W7N9', 'W8N9', 1000)
```

If you want to turn it off:

```js
remoteMining.disable('W7N9', 'W8N9')
```

## Troubleshooting

- `remoteMining is undefined`:
  - wait for your code to run one tick after deploy (helper is installed in `loop()`).
- `status(...)` returns `null`:
  - remote not configured yet; run `activate(...)`.
- Remote has config but no source details yet:
  - bot needs visibility in that remote room before it can discover sources/paths.
- Remote roads are not being placed:
  - roads are intentionally skipped in owned rooms; automatic remote road placement is for non-owned rooms.

---

# Debug Console Guide

Debug helpers are exposed on `globalThis.debug` from `src/debug.ts`. These are independent of remote mining operations and work for any room.

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
  ...
```

Status labels are mapped from each creep's `jobType` — `harvestSrc`, `withdraw`, `deposit`, `build`, `repair`, `upgrade`, `heal`, `IDLE`, etc.

A creep showing `IDLE` for many ticks is likely starved of work. A miner with no `src=` means it hasn't been assigned a source yet.

## Troubleshooting

- `debug is undefined`:
  - wait for your code to run one tick after deploy (helper is installed in `loop()`).
- `debug.trackRemote(...)` returns `missing ...`:
  - remote plan not found; create it with `remoteMining.activate(...)` first.

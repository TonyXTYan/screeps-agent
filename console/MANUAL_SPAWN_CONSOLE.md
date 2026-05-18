# Manual Spawn Console Guide

Use these one-liners in the Screeps console to spawn a single creep outside of the normal bot spawn loop. Useful for emergency recovery or testing.

## Key memory fields

| Field | Required | Notes |
|---|---|---|
| `archetype` | yes | drives job assignment (see below) |
| `role` | yes | legacy field; value depends on archetype (see below) |
| `homeRoom` | yes | room the creep belongs to |
| `remoteRoom` | remote creeps only | target remote room |
| `remoteMode` | remote creeps only | `'harvest'` for standard remotes |

`role` values by archetype:
- `hauler`, `miner`, `mineralMiner` → `'harvester'`
- `worker` → `'builder'`
- `remoteMaintainer`, `remoteScout` → `'manual'`
- `remoteHauler`, `remoteMiner` → `'harvester'`

---

## Hauler (home room)

Body: 16× `[CARRY, CARRY, MOVE]` + `[WORK, MOVE]` — 50 parts, 2550 energy (full RCL 7 size).

```js
Game.spawns['Spawn1'].spawnCreep([CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,WORK,MOVE], 'hauler-manual-1', {memory:{archetype:'hauler',role:'harvester',homeRoom:'W7N9'}})
```

Medium size (10 segments, 1650 energy):

```js
Game.spawns['Spawn1'].spawnCreep([CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,CARRY,CARRY,MOVE,WORK,MOVE], 'hauler-manual-1', {memory:{archetype:'hauler',role:'harvester',homeRoom:'W7N9'}})
```

---

## Worker (home room)

Body: `[WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]` — 800 energy.

```js
Game.spawns['Spawn1'].spawnCreep([WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], 'worker-manual-1', {memory:{archetype:'worker',role:'builder',homeRoom:'W7N9'}})
```

---

## Remote Maintainer

Body tiers (pick largest that fits your current energy):

| Tier | Parts | Energy | Body |
|---|---|---|---|
| Large | 24 | 2400 | 4W + 8C + 12M |
| Medium | 14 | 1200 | 3W + 4C + 7M |
| Small | 8 | 800 | 2W + 2C + 4M |

Large (recommended at RCL 7+):

```js
Game.spawns['Spawn1'].spawnCreep([WORK,WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], 'rmaint-manual-1', {memory:{archetype:'remoteMaintainer',role:'manual',homeRoom:'W7N9',remoteRoom:'W9N9',remoteMode:'harvest'}})
```

Medium:

```js
Game.spawns['Spawn1'].spawnCreep([WORK,WORK,WORK,CARRY,CARRY,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE], 'rmaint-manual-1', {memory:{archetype:'remoteMaintainer',role:'manual',homeRoom:'W7N9',remoteRoom:'W9N9',remoteMode:'harvest'}})
```

Small:

```js
Game.spawns['Spawn1'].spawnCreep([WORK,WORK,CARRY,CARRY,MOVE,MOVE,MOVE,MOVE], 'rmaint-manual-1', {memory:{archetype:'remoteMaintainer',role:'manual',homeRoom:'W7N9',remoteRoom:'W9N9',remoteMode:'harvest'}})
```

---

## Notes

- Change `'Spawn1'`, room names, and the creep name (`'hauler-manual-1'` etc.) as needed.
- Creep names must be unique — if a name is already taken the call returns `ERR_NAME_EXISTS` (-3).
- The bot's spawn loop runs every tick and may try to spawn the same archetype independently; the manually spawned creep counts toward the room's capacity tracking.
- `remoteMode: 'harvest'` is correct for standard remote rooms. Use `'reserve'` if the remote is configured in reserve mode.

# Flags Console Guide

Named flags placed on the map act as per-structure overrides for bot behaviour.
The flag's **name** selects the behaviour; the flag's **position** selects the target.

## DONOT_MAINTAIN — suppress repair of a specific structure

Place a `DONOT_MAINTAIN` flag on the exact tile of a road or container to tell all creeps to
skip repairing it and let it decay naturally.

This is useful in reserved remote rooms (RCL 0) where you cannot destroy structures — placing
this flag lets a road or container die on its own without the bot fighting you.

### Placing a flag

```js
// Place flag on the tile of the road/container you want to abandon.
// Any name that starts with DONOT_MAINTAIN works.
Game.rooms['W8N9'].createFlag(34, 22, 'DONOT_MAINTAIN')

// If you need multiple flags in different spots, add any suffix:
Game.rooms['W8N9'].createFlag(35, 22, 'DONOT_MAINTAIN_2')
Game.rooms['W8N9'].createFlag(40, 15, 'DONOT_MAINTAIN_oldroad')
```

> **Tip:** You can also place a flag by clicking on the map in the Screeps UI, then rename it
> to `DONOT_MAINTAIN` (or any `DONOT_MAINTAIN_*` variant) in the flag panel.

### Removing a flag (resume normal maintenance)

```js
Game.flags['DONOT_MAINTAIN'].remove()
Game.flags['DONOT_MAINTAIN_2'].remove()
```

### Checking what flags are active

```js
// List all DONOT_MAINTAIN flags and their positions:
Object.values(Game.flags)
  .filter(f => f.name.startsWith('DONOT_MAINTAIN'))
  .map(f => f.name + ' @ ' + f.pos)
```

### What is suppressed

| Creep type | Behaviour suppressed |
|---|---|
| `remoteMaintainer` | skipped as a repair target in primary job assignment |
| `remoteMaintainer` | skipped in opportunistic in-transit repair (range 3) |
| `remoteMiner` | skipped in opportunistic idle-source repair |

Structures **not** on a flag tile are unaffected. Other jobs (harvesting, building construction
sites, hauling) are not affected.

### How it works (implementation note)

`src/room/flags.ts` exports `isMaintenanceDisabled(structure)`. It scans `Game.flags` once per
tick and caches the result, so there is no per-structure overhead. The flag check is applied in:
- `selectRemoteMaintainerRepairTarget` (`src/room/controller.ts`)
- remote miner idle-repair candidate filter (`src/room/controller.ts`)
- `opportunisticMaintainerRepair` (`src/creep/jobRunner.ts`)

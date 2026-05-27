# CPU profiling: move reuse vs findInRange caching

**Date:** 2026-05-27  
**Branch:** RCL7/dev1  
**Log source:** `screeps_console/logs/screeps_console_2026-05-27.json`  
**Profiler:** `Game.profiler.profile(100)` on shard1 (screeps-profiler, `PROFILER_ENABLED = true` in build at time of run)

---

## Latest profile session

| | |
|---|---|
| **Command** | `Game.profiler.profile(100)` |
| **Started** | ~tick 71234655 (~12:58 local), bucket 787 |
| **Report** | ~tick 71234755 (~13:04 local), bucket 6701 |
| **Summary** | **Avg 20.25 CPU/tick** · **Total 2024.82** over 100 ticks |

### Top consumers (total `time` over 100 ticks)

| calls | time | avg | function |
|------:|-----:|----:|----------|
| 1980 | 290.8 | 0.147 | `RoomPosition.findInRange` |
| 943 | 253.4 | 0.269 | `Creep.moveTo` |
| 10757 | 234.4 | 0.022 | `Room.find` |
| 1026 | 178.5 | 0.174 | `Creep.move` |
| 735 | 140.4 | 0.191 | `Creep.moveByPath` |
| 865 | 130.1 | 0.150 | `RoomPosition.findClosestByPath` |
| 770 | 125.9 | 0.163 | `Creep.transfer` |
| 596 | 109.2 | 0.183 | `Creep.harvest` |
| 628 | 107.0 | 0.170 | `Creep.repair` |
| 215985 | 77.8 | 0.000 | `RoomPosition.inRangeTo` |
| 73340 | 35.6 | 0.000 | `RoomPosition.getRangeTo` |

**Context:** ~20 CPU/tick is healthy headroom. Top lines are optimization targets, not a crisis. High call volume + tiny `avg` on `inRangeTo` / `getRangeTo` — low ROI to cache unless redundant checks are removed in hot loops.

### Prior session (May 26, for scale)

`Game.profiler.profile(10)` — Avg 24.23, Total 242.29. Smaller empire snapshot; `Creep.moveTo` and `findClosestByPath` on top. Today's 100-tick run reflects a much larger fleet and remote footprint.

---

## Movement: already partially cached (engine + codebase)

Screeps **`moveTo` reuses paths** via `reusePath` (stored in `creep.memory._move`). When reuse is active, later ticks often call `moveByPath` on the cached path instead of full pathfinding — cheaper, but still counted by the profiler.

### What this repo does today

| Location | Behavior |
|----------|----------|
| `src/creep/movement.ts` — `moveToJobTarget` | Default **`reusePath: 10`**; clears `_move` when stuck ≥ 4 ticks (`reusePath: 0`) |
| `src/creep/traffic.ts` | Traffic yield uses **`reusePath: 0`** (must react each tick) |
| `src/creep/jobRunner.ts` | Remote miner station/aggressive repath forces **`reusePath: 0`** |
| `src/role/patrol.ts`, `defender.ts` | Explicit reuse (1–8) on some paths |
| Many roles / remote haulers / tower / `main.ts` | Direct `creep.moveTo` — API default **5** unless set |

Remote **planning** caches serialized paths in memory (`pathSerialized` in `remote/planning.ts`) for road placement and distance — not for per-creep `moveByPath` travel.

### Why profiler still shows heavy movement

1. **`reusePath: 0`** on hot paths (stuck recovery, traffic, remote miners).
2. **Every tick still calls `moveTo`** even on cache hit — profiler attributes CPU to `moveTo` / `move` / `moveByPath`.
3. **Fleet scale** — 943 `moveTo` / 100 ticks ≈ 9.4/tick across all creeps.
4. **Bypass of `moveToJobTarget`** — many call sites don't inherit `reusePath: 10`.

### Possible follow-ups (not implemented)

- Route more movement through `moveToJobTarget` for consistent `reusePath`.
- Raise `reusePath` where reaction lag is acceptable (haulers on long routes).
- Use explicit `moveByPath` for fixed routes where destination is stable.
- Audit direct `creep.moveTo` call sites for missing `reusePath`.

---

## findInRange: no engine cache — app-level only

Unlike `moveTo`, **`RoomPosition.findInRange` has no built-in tick cache**. Each call scans in range.

### What this repo caches today

| Mechanism | Scope | Notes |
|-----------|--------|-------|
| `getRoomStructures` (`src/room/structures.ts`) | Per room, ~100-tick refresh | Uses `room.find(FIND_STRUCTURES)` once, not `findInRange` |
| `isMaintenanceDisabled` (`src/room/flags.ts`) | Per tick | Flag positions cached for current `Game.time` |
| Remote `pathSerialized` | Per remote link in memory | Planning/routing, not creep adjacency |

### Heavy `findInRange` call sites (`src/creep/jobRunner.ts`)

Stacked **after most jobs** each tick:

| Function | Typical calls |
|----------|----------------|
| `offloadEnergyNearby` | up to 2 (range 1 structures) |
| `relayAdjacentContainerToLink` | 2 |
| `opportunisticHealNearby` | up to 2 (range 1 + 3 creeps) |
| `opportunisticMaintainerRepair` | 1 |
| `opportunisticRemoteHaulerWork` | up to 2 |

A stationary remote miner on `harvestSource` can hit **4–6+ `findInRange` in one tick** (harvest offload + relay + opportunistic helpers). Empire-wide: **1980 / 100 ≈ 20/tick** — consistent with ~40–50 creeps and stacked opportunistic scans.

Other `findInRange` usages: `src/main.ts` (doctor), `src/role/patrol.ts`, `src/room/targeting.ts`.

### `Room.find` (~108/tick)

Separate from `findInRange`. Sources: room controller, towers, structure cache refresh, remote planning, idle fallback, etc. Room-level caching already exists for structures; many code paths still call `room.find` directly.

### Caching strategies worth considering (not implemented)

1. **Per-creep, per-tick memo** — key `Game.time + creep.id + (pos + range + filter signature)`; reuse first scan result within the tick.
2. **Per-room, per-tick spatial index** — one structure/creep list per room per tick; filter by range in JS (wins when many creeps share a room).
3. **Position-stable fast path** — stationary miners: cache adjacent link/container IDs until `creep.pos` changes.
4. **Consolidate opportunistic scans** — single `findInRange(FIND_STRUCTURES, 3)` with one filter pass instead of separate site vs repair queries.

---

## Profiler / build hygiene

- Guide: `console/PROFILING_CONSOLE.md`
- Wrapper: `src/profiler.ts` — **`PROFILER_ENABLED` should be `false` when not profiling** (adds overhead every tick).
- Log reading: `.cursor/notes/reading-screeps-logs.md` — filter NDJSON for `direction: "in"` and header `calls    time`.

---

## Prioritized optimization list (for future work)

| Priority | Area | Rationale |
|----------|------|-----------|
| P1 | Consolidate / memo `findInRange` in `jobRunner` opportunistic helpers | Highest total `time` in profile; many redundant scans per creep per tick |
| P2 | Per-room per-tick structure adjacency for busy remotes | Many creeps in same room repeat similar range-1 structure queries |
| P3 | Audit `reusePath` on direct `moveTo` bypassing `moveToJobTarget` | Movement stack is #2–#5 by total time; partial caching already exists |
| P4 | Reduce redundant `getRangeTo` / `inRangeTo` in tight loops | Huge call counts; tiny avg — only if profiling shows a specific hot loop |
| P5 | Audit `room.find` call frequency | ~108/tick; extend or use structure cache where safe |

---

## Related docs

- `console/PROFILING_CONSOLE.md`
- `src/creep/movement.ts`, `src/creep/jobRunner.ts`, `src/room/structures.ts`
- `.ai/session/2026-05-17-screeps-monitoring/suggestions.md` — prior `reusePath` tuning notes

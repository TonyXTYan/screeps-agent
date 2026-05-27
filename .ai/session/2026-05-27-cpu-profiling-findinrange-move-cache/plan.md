# Implementation plan: CPU — findInRange cache + movement reuse

**Date:** 2026-05-27
**Branch:** RCL7/dev1
**Related:** `notes.md` (profiler baseline), `console/PROFILING_CONSOLE.md`
**Baseline:** `Game.profiler.profile(100)` — Avg **20.25** CPU/tick; top costs: `findInRange` (290.8), `moveTo` (253.4), `Room.find` (234.4)

---

## Goals

1. **Reduce `RoomPosition.findInRange` CPU** without changing creep behavior (same targets chosen for offload, heal, repair, build opportunism).
2. **Increase effective `reusePath` coverage** on strategic movement paths without breaking stuck recovery, traffic yield, or remote-miner repath edge cases.
3. **Measure before/after** with the same profiler workflow (100-tick profile, same shard conditions).

## Non-goals

- Rewriting pathfinding (PathFinder, traffic yield algorithm).
- Caching `inRangeTo` / `getRangeTo` globally (tiny avg; only touch if a specific hot loop is proven redundant).
- Merging `buildContext` room scans in phase 1 (separate, lower priority).
- Unit test harness (repo has none; verify in live game).
- Setting `PROFILER_ENABLED = true` in committed builds.

---

## Success metrics

| Metric | Baseline (2026-05-27) | Target (after phase 1+2) |
|--------|------------------------|---------------------------|
| `RoomPosition.findInRange` total time / 100 ticks | 290.8 | **≥ 30% reduction** |
| `Creep.moveTo` total time / 100 ticks | 253.4 | **≥ 10% reduction** (phase 3) |
| Avg CPU/tick | 20.25 | **≤ 18** (stretch; bucket/combat state may vary) |
| Functional regressions | — | None observed in 500+ tick soak |

Re-profile after each phase with `Game.profiler.profile(100)` and optional filter `findInRange` / `moveTo`.

---

## Investigation summary

### findInRange — all call sites (14 in `src/`)

| File | Count | Notes |
|------|------:|-------|
| `src/creep/jobRunner.ts` | 10 | **Primary target** — stacked per creep per tick |
| `src/main.ts` | 2 | Doctor threat + injured scan |
| `src/role/patrol.ts` | 1 | Heal target selection |
| `src/room/targeting.ts` | 1 | Doctor threat helper |

`jobRunner` runs opportunistic helpers **after almost every job** (`opportunisticRemoteHaulerWork`, `opportunisticHealNearby`, `opportunisticMaintainerRepair`), plus **2–4 scans** inside `harvestSource` / `mineMineral` offload paths. A single remote miner at a station can trigger **6+ `findInRange` calls/tick**.

### Movement — two paths

| Path | Coverage |
|------|----------|
| `moveToJobTarget` (`movement.ts`) | Default `reusePath: 10`; stuck reset at 4 ticks |
| Direct `creep.moveTo` | **~25 call sites** across roles, remote haulers/miners, tower, `main.ts`, `harvest.ts` — mostly API default **5** or unset |

`reusePath: 0` is **intentional** for: traffic yield, remote miner aggressive repath, position-target stations, `travelRoom` exit logic when stuck.

### Existing cache patterns to mirror

- `src/room/flags.ts` — module-level cache invalidated by `Game.time` (tick-scoped).
- `src/room/structures.ts` — `getRoomStructures(room)`; one `room.find(FIND_STRUCTURES)` per refresh (~100 ticks), used by controller/haulers — **not** used by `jobRunner` adjacency scans.

---

## Architecture

### New module: `src/room/tickCache.ts`

Per-room, per-tick read cache (no `Memory` writes). Pattern matches `flags.ts`.

```ts
export interface RoomTickCache {
    tick: number;
    structures: Structure[];
    myCreeps: Creep[];
    myConstructionSites: ConstructionSite[];
}

export function getRoomTickCache(room: Room): RoomTickCache;
export function findStructuresInRange(
    pos: RoomPosition,
    range: number,
    filter?: (s: Structure) => boolean
): Structure[];
export function findMyCreepsInRange(
    pos: RoomPosition,
    range: number,
    filter?: (c: Creep) => boolean
): Creep[];
export function findMyConstructionSitesInRange(
    pos: RoomPosition,
    range: number
): ConstructionSite[];
```

**Population:** On first `getRoomTickCache(room)` each tick:

```ts
room.find(FIND_STRUCTURES)
room.find(FIND_MY_CREEPS)
room.find(FIND_MY_CONSTRUCTION_SITES)
```

**Range filter:** Chebyshev distance `Math.max(|dx|, |dy|) <= range` (matches Screeps `findInRange`).

**Invalidation:** `cache.tick !== Game.time` → rebuild. No cross-tick persistence.

**Memory:** ~3 `room.find` per room per tick **only when that room has creeps using the cache**. Amortized: if 8 remotes + 4 homes each have 5 creeps doing adjacency work, that's at most ~12 rooms × 3 finds = 36 finds/tick vs current ~20 `findInRange`/tick × N creeps with overlapping scans. Net win when **≥2 creeps per room** hit structure/creep range queries in the same tick.

**Visibility:** Only call `getRoomTickCache` when `room` is visible (`Game.rooms[room.name]`). For invisible rooms, keep direct `findInRange` (rare for stationary offload).

---

## Phase 1 — jobRunner consolidation (highest ROI, lowest risk)

**Files:** `src/creep/jobRunner.ts` only (no new module yet).

### 1a. Shared adjacent-structure scan

Replace separate `offloadEnergyNearby` + `relayAdjacentContainerToLink` scans with one helper:

```ts
function adjacentStructures(creep: Creep): {
    links: StructureLink[];
    energyStores: EnergyStructure[];
    containers: StructureContainer[];
}
```

- Single `findInRange(FIND_STRUCTURES, 1)` (or phase 2: `findStructuresInRange`).
- Partition results by `structureType` + store capacity in one pass.
- `offloadEnergyNearby` / `relayAdjacentContainerToLink` / `offloadResourceNearby` consume this struct.

**Saves:** 2–3 `findInRange` per harvest/mineral tick per creep.

### 1b. Unified opportunistic pass

Replace three post-job functions' independent scans with one:

```ts
function runOpportunisticWork(creep: Creep, jobType: CreepJobType, result: number): void
```

Single scan strategy per tick (when any opportunistic work might run):

| Scan | Range | Used for |
|------|-------|----------|
| `FIND_STRUCTURES` | 3 | hauler build, maintainer repair |
| `FIND_MY_CREEPS` | 3 | heal (filter injured; split melee vs ranged by range ≤1) |
| `FIND_MY_CONSTRUCTION_SITES` | 3 | hauler build (first site) |

Early-out guards unchanged (archetype, bodyparts, energy, jobType exclusions).

**Saves:** Up to **4** `findInRange` → **3** (phase 1) or **0 extra** after phase 2 (reuse tick cache).

### 1c. Stationary miner fast path (optional in phase 1)

If `atStation(creep, station)` and position unchanged since last tick:

- Skip opportunistic heal/maintainer/hauler work when `creep.memory.archetype === 'remoteMiner'` and `jobType === 'harvestSource'` and not injured.

**Risk:** Low — miners at container rarely need opportunistic heal/build. Gate behind explicit check; easy to revert.

---

## Phase 2 — `tickCache` module + jobRunner migration

**Files:** `src/room/tickCache.ts` (new), `src/creep/jobRunner.ts`, `src/main.ts`, `src/role/patrol.ts`, `src/room/targeting.ts`

1. Implement `tickCache.ts` per architecture above.
2. Migrate all `jobRunner` `findInRange` to `find*InRange` helpers.
3. Migrate `main.ts` doctor scans and `targeting.ts` / `patrol.ts` if they run in visible owned/remotes rooms.

**Do not** use tick cache for:

- `FIND_HOSTILE_CREEPS` (low volume; hostiles move — stale cache dangerous).
- Rooms with no `Game.rooms` visibility.

Export from `src/room/tickCache.ts`; document in `architecture/OVERVIEW.md` under `room/`.

---

## Phase 3 — movement reuse audit

**Files:** `src/creep/movement.ts`, call sites in `src/room/remote/*.ts`, `src/role/*.ts`, `src/creep/harvest.ts`, `src/main.ts`, `src/tower/basics.ts`

### 3a. Centralize defaults

Add optional wrapper (or extend `moveToJobTarget`):

```ts
export function moveToDefault(
    creep: Creep,
    target: RoomPosition | { pos: RoomPosition },
    stroke: string,
    extra?: MoveToOpts
): number
```

Defaults: `reusePath: 10`, same stuck logic as `moveToJobTarget`.

### 3b. Call-site table (migrate in priority order)

| Priority | File | Current | Proposed |
|----------|------|---------|----------|
| P0 | `remote/haulers.ts` (3) | no reuse | `moveToJobTarget` or `reusePath: 15` |
| P0 | `remote/miners.ts` wait/spawn (2) | no reuse | `reusePath: 10` (keep source approach `reusePath: 0`) |
| P1 | `harvest.ts` (2) | no reuse | `moveToJobTarget` |
| P1 | Legacy roles: builder, doctor, harvester, upgrader | no reuse | `moveToJobTarget` or `reusePath: 10` |
| P2 | `main.ts` flee/renew/park | mixed | flee `reusePath: 3`; park keep 6 |
| P2 | `tower/basics.ts` | no reuse | `reusePath: 5` |
| P3 | `remote/fleet.ts`, `controller.ts` hold | no reuse | `reusePath: 8` |

**Keep `reusePath: 0`:** `traffic.ts`, remote miner aggressive repath, stuck reset, `travelRoom` when `stuckTicks >= MOVE_STUCK_REPATH_TICKS`.

### 3c. No `moveByPath` migration yet

Serialized remote paths in memory are for **planning**, not creep travel. Only consider explicit `moveByPath` for fixed patrol holds after phase 3 profiling.

---

## Phase 4 — room.find reduction (optional, defer)

**Files:** `src/room/controller.ts` (`buildContext`), `src/room/structures.ts`

`buildContext` already calls `getRoomStructures` then **8+ additional `room.find` calls** per owned room per tick. Possible merge:

- Reuse `getRoomTickCache` for `creeps`, `constructionSites`, and unfiltered `structures`; derive `repairTargets` / `injuredCreeps` by filter.
- Keep separate finds for sources, minerals, tombstones, ruins (static/low churn).

**Risk:** Medium — controller is assignment-critical. Only after phases 1–3 show stable gains.

---

## Implementation order

```
Phase 1a → build → deploy → profile(100)
Phase 1b → build → deploy → profile(100)
Phase 2   → build → deploy → profile(100)
Phase 3   → build → deploy → profile(100)
Phase 4   → only if still CPU-bound on Room.find
```

Each phase is a **separate commit** for easy bisect.

---

## Verification checklist

### Per phase

- [ ] `npm run build` passes
- [ ] `codegraph sync` after build
- [ ] `PROFILER_ENABLED = false` in `src/profiler.ts` before push (unless actively profiling)
- [ ] `Game.profiler.profile(100)` on shard1; compare top-5 lines to baseline in `notes.md`
- [ ] 500+ ticks soak: no miner stall, hauler deposit, maintainer repair, doctor heal regressions
- [ ] Spot-check remote rooms: W7N9 remotes still assign/spawn (console `[REMOTE]` logs)

### Behavioral spot tests (manual)

| Scenario | Expected |
|----------|----------|
| Remote miner at container, full carry | Offloads to adjacent link/container same as before |
| Remote hauler transiting with WORK | Still opportunistic-builds site in range 3 |
| Maintainer with energy, no primary repair job | Still opportunistic-repairs worst road/container in range 3 |
| Doctor / creep with HEAL, ally injured nearby | Still heals adjacency then ranged |
| Creep stuck 4+ ticks | Still clears `_move` and repaths |
| Traffic yield active | Still `reusePath: 0` |

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Tick cache stale within tick (structure destroyed) | Cache only used for same-tick decisions; next tick rebuilds |
| Chebyshev filter mismatch | Unit-check against native `findInRange` on a few tiles in console |
| Over-aggressive `reusePath` on combat/flee | Exclude flee/hostile paths; keep low reuse |
| Extra `room.find` per room hurts CPU | Lazy-init cache only on first `find*InRange` in that room/tick; profile |
| Profiler overhead skews numbers | Disable profiler in production builds |

---

## Docs / memory updates (after implementation)

- `architecture/OVERVIEW.md` — add `room/tickCache.ts` to source map
- `.ai/memory/CODEMAP.md` — new module entry
- `notes.md` in this session — append post-change profiler table
- Optional: one paragraph in `console/PROFILING_CONSOLE.md` pointing to this plan

---

## Estimated effort

| Phase | Effort | CPU impact (estimate) |
|-------|--------|------------------------|
| 1a–1b | ~2–3 hours | High on `findInRange` |
| 2 | ~2 hours | High; consolidates room scans |
| 3 | ~2–3 hours | Moderate on `moveTo` |
| 4 | ~4+ hours | Moderate on `Room.find`; defer |

**Total:** ~1–2 sessions for phases 1–3.

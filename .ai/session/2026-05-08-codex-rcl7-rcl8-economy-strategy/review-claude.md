---
name: Code Review — codex/2026-06-08-rc6
type: session
---

# Code Review: `codex/2026-06-08-rc6` → `main`

## Overview

This branch is a major architectural overhaul (~2,600 lines added across 6 files). The core change replaces the hardcoded role-balance + population-control system with a **capability-based job runner** and a **room-level controller** that plans and assigns work each tick. Old role scripts remain as a fallback layer.

## New Files

| File | Purpose |
|---|---|
| `src/creep.capabilities.ts` | Derives `CreepCapabilities` from body parts, infers archetypes, plans bodies per archetype |
| `src/creep.jobRunner.ts` | Executes assigned jobs (harvest, withdraw, deposit, build, repair, upgrade, heal, mineral, travel, idle) |
| `src/room.controller.ts` | Builds room context per tick, manages source/mineral plans, link transfers, job assignment with per-tick reservations, spawn planning |
| `src/room.structures.ts` | Structure discovery and link classification (source / hub / controller / sink) |

## Dispatch Flow (main.ts)

memory management → room controller (assigns all jobs) → per-creep job runner → legacy role fallback

Clean and correct. The `return` → `continue` fix in the creep loop is important and correct.

---

## Bugs Found

### Bug 1: `sourceSpawnDeficit` second loop is dead code

**File:** `src/room.controller.ts:1101-1110`

The first loop returns as soon as any source has `assignedMiners === 0`. If it completes, all sources have ≥1 miner. The second loop then checks `assignedMiners < 1` — which can never be true. A source with one underpowered miner (e.g., `WORK, CARRY, MOVE` when `requiredWork = 3`) will never trigger a new spawn.

**Fix applied:** Removed the `assignedMiners < 1` guard from the second loop. The work-deficit logic now fires based on `deficit > bestDeficit` alone. Demand is naturally capped because once `assignedWork >= requiredWork`, the deficit is ≤0.

---

### Bug 2: `mineralMiner` stuck when store is full

**File:** `src/creep.jobRunner.ts:317-320`

When a mineral miner's store is full and `offloadResourceNearby` finds nothing nearby, `mineMineral` returns `ERR_FULL`. `shouldClearJob` did not clear on `ERR_FULL` for `mineMineral`. On the next tick, `keepCurrentJob` → `currentJobStillValid` sees the mineral is still valid (it doesn't check store capacity) and keeps the job. The miner spins indefinitely.

Contrast with `harvestSource`, which falls back to `creep.drop(RESOURCE_ENERGY)` — mineral miners had no equivalent escape.

**Fix applied:** Added `result === ERR_FULL` to the clear conditions for `mineMineral` in `shouldClearJob`. When cleared, on the next tick `assignJob` sees `hasMinerals === true` (minerals in store, no energy) and assigns a `depositResource` job via `resourceDepositTarget`. Once deposited, the archetype dispatch returns the creep to `mineMineral`.

---

## Secondary Observations (no fix required)

- **`firstStoredResource` duplicated** — defined in both `creep.jobRunner.ts` and `room.controller.ts` with slightly different behavior (controller version prefers non-energy; jobRunner returns first). Worth consolidating to a shared utility.
- **`closest` vs `closestByRange`** — nearly identical functions, one takes `Creep`, one takes `RoomObject`. Could be unified.
- **`linkReceivers` unconditional push** — hub and controller links are pushed both conditionally and unconditionally at the end (deduped by `uniqueLinks`). Intent is correct but confusing to read.
- **`getRoomStructures` cache write-only** — `rememberRoomStructures` writes all structure IDs to `room.memory.structures` every tick but nothing reads it back. At RCL8, ~60 extension IDs serialize every tick. Worth throttling or removing until a cache read-back path is implemented.
- **`remoteMiner` / `remoteHauler` not in `fallbackRoleForArchetype`** — fall through to `'builder'`. Doesn't affect runtime since remote creeps get jobs before legacy roles run, but creates a misleading debug state.
- **`interruptReason`** — written to creep memory in `keepCurrentJob` but never read. Purely observability.

---

## Overall Assessment

The architectural foundation is solid. The reservation system, source plan lifecycle, archetype/capability separation, sticky primary job memory, and legacy-role fallback are all well-designed. The two bugs above were the priority fixes before this branch is production-stable.

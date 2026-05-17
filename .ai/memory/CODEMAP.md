---
name: Code Map
description: Quick mapping from architecture concepts to implementation files
type: project
---

# Code Map

Use this as the first stop before editing code.

## Tick Flow

- `src/main.ts` — Screeps `loop()` entry point, standby miner parking (no standby renew), hostile flee/retreat, home renew gating (economy/recovery-aware with critical-TTL override), debug hooks
- `src/creep.memoryManagement.ts` — dead creep memory cleanup and fallback role/remote initialization
- `src/memoryAudit.ts` — memory consistency audit (runs on deploy when commit hash changes)
- `src/env.ts` — exports `BUILD_COMMIT` from build-injected git hash
- `src/creep.populationControl.ts` — emergency defender spawning before economic spawn planning
- `src/room.controller.ts` — main room-level economic controller (room plans, remotes, spawn planning, job assignment)
- `src/spawn.renewal.ts` — per-tick spawn reservation helper for renew actions
- `src/tower.basics.ts` — tower attack, heal, and repair behavior
- `src/creep.jobRunner.ts` — executes assigned jobs before legacy role fallback

## Shared Utilities

- Hostile detection is centralized in `src/hostileUtils.ts` (`isHostile`, `findHostiles`) and used by `main.ts`, `room.controller.ts`, `tower.basics.ts`, `creep.populationControl.ts`, and `role.defender.ts`.
- `firstStoredResource(store)` — duplicated in `creep.jobRunner.ts` and `room.controller.ts`.
- `closest()` / `closestByRange()` — overlap in `room.controller.ts`.
- `spawn.renewal.ts` — shared `acquireRenewSpawn()` / `nearestSpawn()` helper used by home, remote, and defender renew flows.

## Architecture Docs

- Architecture overview — `architecture/OVERVIEW.md`
- Economy details — `architecture/ECONOMY.md`
- Remote behavior details — `architecture/REMOTES.md`
- Defense details — `architecture/DEFENSE.md`
- Known follow-up work — `.ai/memory/KNOWN_ISSUES.md`
- RCL/labs/power deferred work — `.ai/memory/ROADMAP.md`

## Core Economy

- Source/mineral planning — `src/room.controller.ts`
- Link classification — `src/room.structures.ts`
- Spawn demand selection — `src/room.controller.ts`; multiple free spawns share a pending-request ledger with planned bodies so in-flight creeps count toward capacity and per-source/per-role caps.
- Home room priority gate (blocks remote spawns when home requests pending, throttles remotes under low stored/spawn energy, and rejects uneconomic scaled remote bodies) — `src/room.controller.ts`
- Remote standby miner system (TTL-triggered source-targeted handoff with remote pre-positioning; blank standby reassignment; pending container-site awareness; no standby renew) — `src/room.controller.ts`, `src/creep.jobRunner.ts`, `src/main.ts`
- Remote route health and road placement (degraded-route memory, prioritized road sites, route-health maintainer recovery bypass) — `src/room.controller.ts`
- Body capability derivation — `src/creep.capabilities.ts`
- Body planning by archetype — `src/creep.capabilities.ts`
- Remote hauler capacity cap (per source) — `src/room.controller.ts`
- Hauling, refill, build, repair, upgrade assignment — `src/room.controller.ts`; haulers/workers pick dropped resources, salvage ruins/tombstones, then non-energy minerals from the planned mineral container. Workers prefer room storage as the primary `withdrawEnergy` target whenever storage has energy. Haulers prioritize draining hub/controller/sink links first (keeping them ready for runLinks transfers), then fall back to terminal, source containers, and source links as overflow. Energy-carrying local haulers/support creeps preempt idle/deposit/withdraw/build/repair/upgrade work to refill spawn/extensions during spawn pressure, then low towers. Terminal energy follows an RCL reserve floor (RCL6/7/8 = 5k/10k/50k) breakable only during energy recovery. Non-miner `harvestSource` assignments are treated as temporary fallback jobs and are interrupted once energy is loaded or storage is available.
- Remote maintainer build targeting is sticky on the current road/container site to prevent rapid target oscillation; retargeting happens only when that target is no longer a valid road/container construction site — `src/room.controller.ts`.
- Remote hauler cycle (assigned-source-first remote pickup with cross-source pickup only for large overflow when assigned source is dry, fill-to-full top-up, far-pickup return at >=75% load, home delivery prioritizes spawn/extension refill then low towers before storage/terminal, post-trip renew only when TTL<1000 to TTL>1400, no-job home idle/wander with TTL<500 renew gate; energy pressure can defer starting renew, but active renew cycles persist next to spawn until TTL>1400) — `src/room.controller.ts`; renew requests reserve free spawns through `src/spawn.renewal.ts` so multiple renewers spread across multiple spawns, adjacent renewers can preempt reservations held by creeps still traveling to the spawn, and spawn planning keeps one free spawn when multiple spawns are idle to avoid renew-only reservation lockouts.
- Job execution for those assignments — `src/creep.jobRunner.ts` (includes pass-by remote-hauler opportunistic build/repair within range 3)
- Recovery log regression checker — `.ai/scripts/check-screeps-recovery-regressions.py` parses console NDJSON for recovery-pull mismatches, remote-hauler renew loops, flatlined demand recovery, and stale post-full recovery pull.

## Types And Memory

- Creep, room, spawn memory extensions — `src/types.d.ts`
- Job type union — `src/types.d.ts`
- Archetype union (worker, miner, hauler, doctor, claimer, defender, remoteMiner, remoteHauler, remoteMaintainer, remoteScout, mineralMiner) — `src/types.d.ts`
- Room plan, load, and `energyRecoveryReason` memory — `src/types.d.ts`
- Runtime Memory writes for structures/load/plans — `src/room.controller.ts`, `src/room.structures.ts`

## Repair Utilities (Shared)

`src/role.doctor.ts` exports strategic repair helpers used across the codebase:

- `repairStructureFilter(structure, rcl)` — RCL-staged hit-cap filter for walls/ramparts; imported by `tower.basics.ts` and `room.controller.ts`
- `wallRampartRepairCap(rcl)` — returns the hit cap for the given RCL; imported by `room.controller.ts`
- `repairJob(creep)` / `repairTargetToRepair(creep)` — used by legacy fallback roles

Wall/rampart hit caps live in `wallRampartRepairCap()`. Tower energy thresholds (dynamic peace/combat gates) live in `tower.basics.ts`. To change staged caps, edit `role.doctor.ts` and update `architecture/DEFENSE.md`.

## Legacy Compatibility

- Legacy role balancing helpers — `src/creep.roleBalance.ts`
- Legacy body planner (`balanceSpec()`) — `src/creep.roleBalance.ts` (DO NOT use for strategic-path creeps; use `planBodyForArchetype()` in `creep.capabilities.ts` instead)
- Legacy direct harvesting helper — `src/creep.harvest.ts`
- Legacy fallback roles — `src/role.harvester.ts`, `src/role.builder.ts`, `src/role.upgrader.ts`, `src/role.doctor.ts`
- Emergency defender behavior — `src/role.defender.ts`
- Manual role stub — `src/role.manual.ts`

Legacy role files should not be the primary path for new strategic behavior.
**Warning**: legacy roles (`harvester`, `builder`) can delete creep memory (`delete Memory.creeps[creep.name]`) when idle. See `KNOWN_ISSUES.md`.

## Common Edit Paths

Adding a new local economy job:

1. Add the job to `CreepJobType` in `src/types.d.ts`.
2. Add execution in `src/creep.jobRunner.ts`.
3. Add assignment and reservation logic in `src/room.controller.ts`.
4. Add or update capability/body planning in `src/creep.capabilities.ts` if needed.
5. Update relevant `architecture/*.md` docs if behavior changes.

Adding a new strategic Memory setting:

1. Update `src/types.d.ts`.
2. Initialize defaults in `src/room.controller.ts`.
3. Read the setting in assignment or spawn planning.
4. Add an example in the relevant `architecture/*.md` doc.

Changing construction priority:

1. Update `architecture/ECONOMY.md`.
2. Update `constructionPriority()` in `src/room.controller.ts`.
3. Validate in-game that builders choose the intended sites.

Changing remote behavior:

1. Update `architecture/REMOTES.md`.
2. Update `RemoteRoomPlan` in `src/types.d.ts` if the config changes.
3. Update `updateRemoteRoomPlans()`, `remoteSpawnRequest()`, and `assignRemoteCreep()` in `src/room.controller.ts`.
4. Update console-facing docs in `console/REMOTE_MINING_CONSOLE.md` if API behavior or defaults change.
5. Keep expansion opt-in through Memory.

Changing wall/rampart repair caps or tower repair policy:

1. Update `architecture/DEFENSE.md` first.
2. Edit `wallRampartRepairCap()` in `src/role.doctor.ts` for the staged hit caps.
3. Edit the energy thresholds in `tower.basics.ts` (lines 46–47):
   - `minEnergyForRepair` — controls heal/repair of normal structures (0.5 combat, 0.7 peace)
   - `minEnergyForDefense` — controls wall/rampart repair (0.4 combat, 0.75 peace)
4. The repair-job validity check in `currentJobStillValid()` (`src/room.controller.ts`) automatically uses `wallRampartRepairCap` — no separate update needed.

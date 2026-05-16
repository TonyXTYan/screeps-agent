---
name: RCL6-RCL8 Capability Economy and Expansion Plan
description: Strategy and implementation plan for moving W7N9 from fixed roles to capability-based jobs
type: session
---

# RCL6-RCL8 Capability Economy and Expansion Plan

## Summary

Move W7N9 from fixed creep roles into a room controller that measures workload and spawns creeps with appropriate body capabilities. Creeps can keep archetypes for spawn intent and debugging, but runtime work assignment should be based on body parts, current room demand, and task state.

The strategic priority is Economy First: storage-centered logistics, containers, links, extractor, terminal, labs in passive mode, then RCL7/RCL8 growth and cross-room harvesting/claiming scaffolding.

## Architecture Changes

- Add a room-level controller that computes room load each tick: harvesting demand, hauling demand, spawn/extension refill pressure, tower reserve, construction backlog, repair backlog, upgrade budget, mineral demand, remote demand, and claim/settle demand.
- Replace hardcoded role dispatch as the long-term path with jobs that declare required capabilities such as harvest, haul, build, repair, upgrade, heal, claim, ranged attack, and reserve.
- Derive creep capabilities from body parts: WORK enables harvest/build/repair/upgrade, CARRY enables hauling, MOVE affects travel capacity, CLAIM enables claiming/reserving, combat parts enable defense jobs, and HEAL enables doctor work.
- Keep legacy role memory as compatibility metadata during migration, but make active decisions through `jobType`, `jobTargetId`, and room controller assignment.
- Add spawn planning that behaves like a PID-style load controller: compare measured demand against available creep capacity, maintain target capacity bands, and spawn the body that reduces the highest deficit.
- Add typed memory for room plans, source assignments, structure IDs, link roles, remote rooms, job queues, spawn demand history, and RCL milestone state.

## Economy Strategy

- RCL6 immediate goal: establish source containers, storage as the energy hub, and hauler logistics so general workers stop walking to raw sources unless the room is in emergency recovery.
- Miners should be WORK-heavy creeps assigned to sources; haulers should be CARRY/MOVE-heavy creeps that move energy from source containers, dropped energy, and source links into storage, spawn/extensions, and towers.
- Builders, upgraders, and doctors should become generic WORK-capable workers that withdraw from storage, containers, or links before direct harvesting.
- Links should be classified into source, hub, and controller links; source links push energy inward, and controller/hub links supply upgrading or storage balancing.
- Extractor and mineral support should be passive at first: mine minerals only when the extractor exists, storage energy is healthy, and the mineral is not depleted; deposit minerals into storage or terminal.
- Terminal and labs should be discovered, typed, and reported in Memory/logs, but v1 should not auto-trade, run reactions, or boost creeps.

## RCL7/RCL8 and Expansion Strategy

- RCL7 priorities: second tower first, second spawn second, then stronger logistics and upgrade throughput; factory is detected but not automated in this pass.
- RCL8 priorities: third spawn, observer, power spawn, nuker detection, high wall/rampart budgets, and explicit energy surplus policy for upgrading versus defense.
- Remote harvesting v1: scout configured neighboring rooms, identify sources, evaluate path length and danger, then spawn remote miners/haulers only for whitelisted rooms.
- Remote defense policy: abandon or pause remote jobs when hostiles are detected unless a future combat capability controller assigns guards.
- Claiming v1: support user-approved target rooms only; spawn claim-capable creeps for claim/reserve jobs and bootstrap rooms with minimal miner/hauler/worker economy.
- Multi-room future: each owned room runs its own controller, while a lightweight empire planner tracks expansion targets, remote rooms, and inter-room terminal/storage needs.

## Implementation Phases

- Phase 1: Write this session strategy note and add type definitions for archetypes, capabilities, jobs, room load, spawn requests, structure cache, and remote room config.
- Phase 2: Add structure discovery and room load measurement without removing legacy behavior.
- Phase 3: Add spawn demand generation and capability-based body planning while keeping old role scripts as fallback behavior.
- Phase 4: Implement job assignment for local economy jobs: harvest source, withdraw energy, haul energy, refill spawn/extensions, refill towers, build, repair, upgrade, and idle near hub.
- Phase 5: Migrate existing role behavior behind the job runner and reduce fixed role counts to emergency fallback only.
- Phase 6: Add container/storage/link/extractor/mineral/terminal/lab support in passive mode, then validate the room can run from storage logistics instead of direct harvesting.
- Phase 7: Add RCL7/RCL8 structure policies and remote/claim planning scaffolding, gated by Memory configuration so the bot does not expand or claim without user intent.

## Test Plan

- Run `npm run build` after each implementation phase.
- Add focused checks for capability derivation, body planning, spawn demand priority, structure classification, and job assignment scoring where practical.
- Verify in Screeps that W7N9 preserves existing survival behavior during migration: spawn/extensions refill, towers stay above reserve, creeps do not idle with unmet jobs, and storage energy trends upward.
- Validate RCL7 readiness by checking that the controller prioritizes tower/spawn construction and shifts surplus energy into upgrading only after logistics and defense reserves are satisfied.
- Validate remote/claim scaffolding with disabled-by-default Memory config before enabling actual remote harvesting or claiming.

## Assumptions

- The implementation should prefer capability jobs: creeps are spawned for body capabilities and assigned work dynamically, while archetypes remain useful for planning and debugging.
- The room controller should use PID-like demand balancing conceptually, but the first implementation can use proportional deficit scoring plus demand history rather than a mathematically full PID controller.
- No automatic market trading, lab reactions, boosts, combat squads, or autonomous claiming are included in the first pass.
- W7N9 remains the only active owned room until the user explicitly approves remote rooms or claim targets.

## 2026-05-08 Sticky Scheduler Follow-up

- Implemented sticky active jobs and remembered primary WORK jobs so builders, repairers, and upgraders refuel then return to the same target instead of racing for a new target every tick.
- Added reservation accounting for ruins/tombstones/dropped resources, spawn/tower refill capacity, construction progress, repairs, and controller upgrader work to limit over-assignment.
- Source miner policy now enforces one dedicated miner per source before other spawn needs. Existing duplicate miners can be reassigned to uncovered sources, and new miner bodies wait for room energy capacity when the room is not in emergency recovery.
- Static source/mineral mining now uses stationary targets: no-CARRY miners can stand on containers, while link-backed source miners keep CARRY so they can transfer harvested energy into the nearby link.
- The controller lane is protected: at least one upgrade-capable creep is reserved for controller work and current build/repair jobs can be interrupted to restore that upgrader slot.
- Validation run: `npx tsc --noEmit` and `npm run build` both passed.

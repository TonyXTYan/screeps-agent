# Screeps Game Strategy

This document is the strategy contract for the bot. Code should implement this behavior, and strategy changes should be made here before changing automation.

## Intent

The bot is an AI-assisted Screeps player, not a fully autonomous empire. The user owns strategic choices such as expansion targets, defense posture, market policy, and high-risk resource decisions. The code owns reliable execution of the agreed strategy through TypeScript automation.

Primary strategic posture: economy first, survival always, expansion only when explicitly configured.

## Strategic Principles

1. Keep the room alive before optimizing growth.
2. Prefer stable local economy over opportunistic behavior.
3. Make room-level decisions from measured demand, not fixed role counts.
4. Assign work by creep capabilities and current load.
5. Keep major external actions behind explicit Memory configuration.
6. Treat legacy role scripts as compatibility fallback, not the main design path.
7. Avoid market trading, lab reactions, boosts, power processing, nukes, and autonomous claiming unless the strategy is updated first.

## Execution Model

Each tick should follow this control order:

1. Clean and normalize creep memory.
2. Run memory consistency audit when a new build is detected (commit hash changed).
3. Run emergency defense spawning before normal economic spawning.
4. Run the room controller for each owned room.
5. Run tower behavior.
6. Run assigned creep jobs.
7. Use legacy role behavior only when no job is assigned.

The strategic path is:

`Room state -> load measurement -> capability deficits -> spawn request -> job assignment -> job runner`

New automation should enter through this path unless it is a narrow emergency behavior.

## Local Economy

Local energy economy is the foundation.

- Source miners harvest assigned sources.
- Static miners stand on source containers when possible.
- One local miner per room is kept as a standby substitute near spawn and renewed toward max TTL.
- When an active local miner is near death, the standby miner swaps in on that source and the low-TTL miner rotates to standby/renew duty.
- Remote rooms mirror this: `sources + 1` miners per remote room, with one `remoteStandby` miner idle at the home spawn, dispatched to replace a dying active miner when its TTL drops below 300.
- Link-backed miners may keep carry capacity so they can fill nearby links.
- Haulers move energy from containers, links, dropped resources, ruins, and tombstones into storage, spawn/extensions, towers, and other sinks.
- Remote haulers use pure CARRY+MOVE bodies (no WORK) to maximize carry capacity, minimizing the number of creeps needed per source.
- Hauler capacity demand per remote source is capped at 500, and at most 2 remote haulers are spawned per source regardless of distance.
- Workers build, repair, and upgrade from stored energy before falling back to direct harvesting.
- Direct harvesting by non-miners is an emergency or fallback behavior, not the steady-state goal.

Spawn planning should prioritize:

1. Emergency recovery worker when no creeps exist.
2. Local miner source coverage plus one standby substitute miner per room.
3. Doctor/heal capability once energy capacity supports it.
4. Hauler capacity.
5. Worker work capacity.
6. Passive mineral miner when infrastructure and reserves allow.
7. Configured claim or remote creeps.

## Energy Spending

Energy spending priority for creeps is:

1. Fill spawn and extensions.
2. Keep towers above reserve.
3. Resume the creep's remembered primary build, repair, or upgrade job.
4. Deposit hauler energy into storage or terminal.
5. Guarantee at least one worker building when construction sites exist (before any worker upgrades).
6. Maintain minimum controller upgrade work (filled by remaining workers after the first builder is assigned).
7. Build more construction sites with remaining worker capacity.
8. Repair structures when construction pressure and storage reserves allow.
9. Upgrade with remaining local energy.

Controller upgrading is required to prevent stagnation, but it should not starve spawn refill, tower reserves, or construction. When sites exist, at least one worker always builds before any worker upgrades.

## Construction

Construction priority is:

1. Towers
2. Spawns
3. Extensions
4. Storage
5. Links
6. Terminal
7. Labs
8. Extractor
9. Containers
10. Roads
11. Ramparts
12. Walls

This order favors survival and energy throughput before long-term fortification. Rampart and wall policy should become more explicit before RCL8 wall investment grows.

## Repair And Defense

Towers handle immediate defense:

- Attack hostile creeps first.
- Heal damaged friendly creeps.
- Repair urgent structures when energy is available.

Defender spawning is an emergency override and may take the spawn slot before economic spawning.

Workers may repair when there are no construction sites, or when storage energy is healthy enough to support repair work.

Walls and ramparts use a staged hit cap by RCL to prevent low-RCL rooms from sinking energy into fortifications:

| RCL   | Cap      |
|-------|----------|
| ≤ 2   | 10,000   |
| ≤ 4   | 30,000   |
| ≤ 6   | 100,000  |
| 7     | 300,000  |
| 8     | uncapped |

Towers only repair walls/ramparts when charged to ≥ 90 % and no other repair work or combat is active. Normal structure repair (roads, containers, etc.) proceeds at > 10 % energy as before.

Non-combat creeps should flee nearby hostiles. Remote work should pause or abandon rooms with active danger until a future combat policy exists.

## Infrastructure

Structures should be discovered and classified every tick until a more efficient cache read path exists.

- Links are classified as source, hub, controller, sink, or other.
- Source links send energy inward.
- Hub and controller links receive energy for storage balancing and upgrading.
- Terminal, labs, factory, observer, power spawn, and nuker may be detected and recorded before they are automated.

Automatic infrastructure use is limited to economy-safe behavior. Detection does not imply permission to trade, react, boost, observe, process power, or launch nukes.

## Minerals

Mineral mining is passive and gated.

Mine minerals only when:

- An extractor exists.
- A mineral exists and is not depleted.
- Storage or terminal exists.
- Stored energy is above the configured mineral mining floor.

Minerals should be deposited into terminal first when available, otherwise storage or a suitable container. The bot should not auto-select reactions from available minerals.

## Remotes And Claiming

Remote harvesting, reserving, and claiming are opt-in through room Memory.

Remote rooms must be configured under `room.memory.plan.remoteRooms`. Claim targets must be configured under `room.memory.plan.claimTargets`.

The bot may spawn remote creeps only for configured targets. It must not choose expansion rooms on its own.

Remote harvest policy:

- Home room spawn requests have absolute priority over remote spawns. If any home-room spawn is pending energy, all remote spawn requests are skipped.
- Bootstrap with `remoteScout` when source metadata is unknown.
- While scouting overflow exists, extra scouts should wander instead of idling at home exits.
- Discover and cache per-source remote plan fields (station tile, container id, path, path distance, miner/hauler demand).
- Spawn dedicated per-source `remoteMiner` and `remoteHauler`.
- Remote miners target `sources + 1` per room: one active per source plus one `remoteStandby` idle at home spawn that dispatches when an active miner's TTL drops below 300.
- Remote haulers are capped at 2 per source and use pure CARRY+MOVE bodies (no WORK) to maximize capacity.
- Spawn `remoteMaintainer` when enabled remote roads/containers need build or repair.
- Use `claimer` for reserve/claim modes; reserve mode requires at least 2 `CLAIM` parts. Claimer body scales CLAIM+MOVE segments with available energy, building the largest effective reserving/claiming body possible.
- Apply danger pause (`dangerUntil`) on visible hostile signals and retreat remote creeps home during danger windows.
- Build remote roads/containers only in non-owned rooms so owned-room layouts remain manual.

Remote throughput model:

- `workDemand = ceil(source.energyCapacity / ENERGY_REGEN_TIME / HARVEST_POWER)`
- `haulerCapacityDemand = min(500, ceil((source.energyCapacity / ENERGY_REGEN_TIME) * pathDistance * 2 * 1.2))`
- The hauler capacity cap (500) prevents the distance-multiplied formula from spawning excessive tiny haulers for distant rooms. Combined with the 2-hauler-per-source hard limit, a 2-source room spawns at most 4 remote haulers total.

Example remote Memory config:

```js
Memory.rooms.W7N9.plan.remoteRooms.W7N8 = {
    enabled: true,
    roomName: 'W7N8',
    mode: 'harvest',
    reserve: true,
    buildRoads: true,
    maintainRoads: true
};
```

Example reserve or claim config:

```js
Memory.rooms.W7N9.plan.remoteRooms.W8N9 = {
    enabled: true,
    roomName: 'W8N9',
    mode: 'reserve'
};

Memory.rooms.W7N9.plan.claimTargets = ['W8N9'];
```

Only use one claim target after the user approves the target room.

## RCL Direction

RCL6 focus:

- Stable source mining.
- Storage-centered hauling.
- Tower reserve.
- Construction completion.
- Controlled upgrade throughput.
- Passive extractor/mineral support only when reserves are safe.

RCL7 focus:

- Second tower.
- Second spawn.
- Stronger hauling and upgrade throughput.
- Terminal and link usefulness without market automation.

RCL8 focus:

- Third spawn.
- Explicit rampart and wall budgets.
- Observer, power spawn, nuker, factory, and lab support only after strategy updates define safe policies.
- Upgrade throttling once the controller is maxed.

## Code Alignment Rules

When adding or changing code:

- Add new work types to `CreepJobType`, `creep.jobRunner.ts`, and `room.controller.ts`.
- Add new body needs through `CreepCapabilities` and `planBodyForArchetype`.
- Update Memory types before storing new strategic state.
- Add jobs through measured demand and reservations where multiple creeps could over-assign the same target.
- Keep fixed `role` values as debugging and fallback metadata.
- Keep room behavior generic; avoid hardcoding room names, source IDs, or spawn names in the strategic path.
- Use Memory configuration for remote rooms, claim targets, labs, market, combat, and power decisions.
- Update this document when the intended game behavior changes.

## Change Checklist

For a new job:

1. Update `CreepJobType` in `src/types.d.ts`.
2. Add execution behavior in `src/creep.jobRunner.ts`.
3. Add assignment logic in `src/room.controller.ts`.
4. Add reservation accounting when multiple creeps could target the same work.
5. Update capability or body planning in `src/creep.capabilities.ts` if the job needs a new body shape.
6. Run `npx tsc --noEmit` and `npm run build`.

For a new Memory setting:

1. Update the relevant Memory interface in `src/types.d.ts`.
2. Initialize safe defaults in `src/room.controller.ts`.
3. Keep risky behavior disabled unless Memory explicitly enables it.
4. Add an example to this strategy when it helps future edits.

For a strategic behavior change:

1. Update this strategy first.
2. Update `.ai/memory/CODEMAP.md` or `.ai/memory/CURRENT_ARCHITECTURE.md` if file ownership or flow changes.
3. Move resolved items out of `.ai/memory/KNOWN_ISSUES.md`.
4. Validate with TypeScript, build, and live-room observation before deploying.

## Known Alignment Work

Known follow-up work lives in `.ai/memory/KNOWN_ISSUES.md`. Keep this strategy mostly normative; use the known issues file for operational cleanup and temporary gaps.

## Build Identity And Memory Audit

The build system injects the current 8-character git commit hash into the bundled output at build time. The server-side code stores the last-seen commit hash in `Memory.lastBuildCommit`. On the first tick after a new build is deployed, the memory consistency audit runs once.

The audit performs cleanup that shouldn't run every tick:

- Removes orphaned room memory for rooms with no owned spawns and no references from other rooms.
- Clears expired `dangerUntil` timestamps from remote plans.
- Clears stale `skipReason` when the remote room is visible and has no hostiles.
- Removes stale source plans for sources that no longer exist in the room.
- Fixes duplicate source assignments: keeps the strongest miner (most WORK, then best TTL) on each source and unassigns the rest.
- Clears orphaned source references in creep memory that don't match any source in home or remote room plans.
- Resets stale travel stuck memory (stuck > 20 ticks).
- Clears invalid remote room assignments, orphaned `remoteStandby` flags, stale `scoutWanderRoom` references, and remote fields on non-remote creeps.

The audit skips when CPU bucket is below 500. It can also be invoked manually from the console via `require('memoryAudit').runFullAudit()`.

## Verification

Before deploying strategic code changes:

1. Run `npx tsc --noEmit`.
2. Run `npm run build`.
3. Verify the build banner contains the correct 8-char git hash: `head -1 dist/main.js` should show `var __BUILD_COMMIT__ = "abcd1234";`.
4. Check the live room after deployment for spawn refill, tower reserves, miner coverage, hauling flow, construction progress, upgrade progress, idle creeps, and the `[memoryAudit]` log line on the first tick after deploy.
5. Record durable decisions in `.ai/memory/` or a dated `.ai/session/` note when the strategy changes.

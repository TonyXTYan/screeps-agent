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
2. Run emergency defense spawning before normal economic spawning.
3. Run the room controller for each owned room.
4. Run tower behavior.
5. Run assigned creep jobs.
6. Use legacy role behavior only when no job is assigned.

The strategic path is:

`Room state -> load measurement -> capability deficits -> spawn request -> job assignment -> job runner`

New automation should enter through this path unless it is a narrow emergency behavior.

## Local Economy

Local energy economy is the foundation.

- Source miners harvest assigned sources.
- Static miners stand on source containers when possible.
- Link-backed miners may keep carry capacity so they can fill nearby links.
- Haulers move energy from containers, links, dropped resources, ruins, and tombstones into storage, spawn/extensions, towers, and other sinks.
- Workers build, repair, and upgrade from stored energy before falling back to direct harvesting.
- Direct harvesting by non-miners is an emergency or fallback behavior, not the steady-state goal.

Spawn planning should prioritize:

1. Emergency recovery worker when no creeps exist.
2. At least one miner per source.
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
5. Maintain minimum controller upgrade work.
6. Build construction sites.
7. Repair structures when construction pressure and storage reserves allow.
8. Upgrade with remaining local energy.

Controller upgrading is required to prevent stagnation, but it should not starve spawn refill, tower reserves, construction priorities, or basic hauling.

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

Workers may repair when there are no construction sites, or when storage energy is healthy enough to support repair work. Walls are capped at a low repair target until a higher defense policy is added.

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

The bot may spawn remote miners, remote haulers, or claimers only for configured targets. It must not choose expansion rooms on its own.

Remote v1 policy:

- Remote harvest rooms need a miner and hauler.
- Reserve or claim rooms need a claimer.
- Hostile danger pauses remote spawning until the danger window expires.
- Remote defense beyond retreat/pause is deferred.

Example remote Memory config:

```js
Memory.rooms.W7N9.plan.remoteRooms.W7N8 = {
    enabled: true,
    roomName: 'W7N8',
    mode: 'harvest'
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

## Verification

Before deploying strategic code changes:

1. Run `npx tsc --noEmit`.
2. Run `npm run build`.
3. Check the live room after deployment for spawn refill, tower reserves, miner coverage, hauling flow, construction progress, upgrade progress, and idle creeps.
4. Record durable decisions in `.ai/memory/` or a dated `.ai/session/` note when the strategy changes.

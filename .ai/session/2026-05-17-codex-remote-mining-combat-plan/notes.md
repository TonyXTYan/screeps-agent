# Remote Mining Combat Plan

Date: 2026-05-17
Agent: Codex

## Context

The user wants a plan for remote mining room combat:

- Normal remote mining can be interrupted by NPC invader creeps.
- Source Keeper rooms need explicit handling before they are safe to mine.
- Remote miners and haulers should temporarily retreat while combat creeps clear threats.
- Combat creeps should be able to attack and heal so invaders cannot reliably kill the team.
- Combat creeps also need a renewal plan at the home room.
- Scope selected by the user:
  - V1 targets unboosted NPC invaders and opt-in Source Keeper rooms.
  - Use mixed self-sufficient guards first.
  - Keep room in the design for later leader-pair or formation-based squads.
  - Produce a roadmap for boosted raids, leader-pair formations, Invader Cores, and strongholds.

## Current Repo Fit

Relevant existing systems:

- `src/room.controller.ts`
  - Owns remote room planning, remote creep assignment, remote danger memory, and spawn planning.
  - Current remote danger behavior pauses remote spawning and sends remote creeps home.
  - Existing renewal flow already supports remote maintainers and haulers through `spawn.renewal`.
- `src/main.ts`
  - Runs `roomController.assignRemoteCreep(creep)` before generic job execution.
  - Has non-combat flee behavior and remote retreat danger marking.
- `src/creep.populationControl.ts` and `src/role.defender.ts`
  - Handle home-room emergency defenders only.
  - These should remain focused on owned-room defense rather than being reused for remote combat.
- `src/types.d.ts`
  - Contains the remote plan, source plan, creep archetype, and creep memory fields that need extension.
- `architecture/REMOTES.md` and `architecture/DEFENSE.md`
  - Need updates after implementation because this changes remote lifecycle and defense layering.

## Research Inputs

- Official invader docs:
  - Invaders spawn after remote mining activity.
  - Invaders cannot move between rooms.
  - Raids can include 2-5 creeps with melee, ranged, and healer roles.
  - Boosted raids exist and should be out of V1 scope.
  - Source: https://docs.screeps.com/invaders.html
- Official API docs:
  - `StructureKeeperLair` is indestructible.
  - `StructureKeeperLair.ticksToSpawn` counts down to the next Source Keeper spawn.
  - Source: https://docs.screeps.com/api/#StructureKeeperLair
- Community Source Keeper guidance:
  - Source Keepers guard nearby sources/minerals.
  - They have melee and ranged threat, so workers need guarded mining or careful avoidance.
  - Source: https://wiki.screepspl.us/Source_Keeper/
- Community remote/SK discussion:
  - SK mining is practical but requires defenders, harvesters, repair/maintenance, and renewal from the nearest owned room.
  - Source: https://screeps.com/forum/topic/1566/are-sources-under-source-keeper-worth-fighting-for

## Proposed Implementation

### Memory and Types

Add:

- `remoteGuard` to `CreepArchetype`.
- `RemoteCombatMode = 'guarded' | 'avoid'`.
- `RemoteKeeperMode = 'avoid' | 'guarded'`.
- `RemoteGuardFormation = 'mixed' | 'leaderPair'`.

Extend `RemoteRoomPlan`:

- `combatMode?: RemoteCombatMode`
- `keeperMode?: RemoteKeeperMode`
- `guardFormation?: RemoteGuardFormation`
- `maxGuards?: number`
- `threat?: RemoteThreatMemory`

Suggested threat memory:

```ts
interface RemoteThreatMemory {
    kind?: 'none' | 'invader' | 'sourceKeeper' | 'invaderCore' | 'player' | 'boosted';
    hostileIds?: string[];
    targetId?: string;
    firstSeen?: number;
    lastSeen?: number;
    safeSince?: number;
}
```

Extend `RemoteSourcePlan`:

- `keeperLairId?: string`
- `keeperWaitX?: number`
- `keeperWaitY?: number`
- `lastKeeperSeen?: number`

Extend `CreepMemory`:

- `combatTeamId?: string`
- `combatRole?: 'mixed' | 'attacker' | 'healer'`
- `combatTargetId?: string`

The `leaderPair` fields are for future compatibility. V1 should populate `combatRole: 'mixed'`.

### Console API

Extend `RemoteMiningOptions` and `remoteMining.activate/configure`:

- `combatMode`, default `guarded`
- `keeperMode`, default `avoid`
- `guardFormation`, default `mixed`
- `maxGuards`, default `2`

Example:

```js
remoteMining.configure('W7N9', 'W8N9', {
  combatMode: 'guarded',
  keeperMode: 'guarded',
  guardFormation: 'mixed',
  maxGuards: 2
})
```

### Threat Classification

Add a remote combat helper module, likely `src/remote.combat.ts`, with functions that can be used by `room.controller` and guard role behavior.

Classify visible remote threats:

- `invader`: hostile creeps owned by `Invader`, no boosted active combat parts.
- `sourceKeeper`: hostile creeps owned by `Source Keeper`.
- `invaderCore`: visible `STRUCTURE_INVADER_CORE`.
- `player`: any non-NPC hostile creep or hostile controller control/reservation.
- `boosted`: hostile creep with boosted active combat parts.

V1 engagement policy:

- Engage `invader` and `sourceKeeper`.
- Do not engage `player`, `boosted`, or stronghold-style `invaderCore`; retreat economy and leave danger active.
- Existing home-room defender/tower logic remains unchanged.

### Remote Danger State

Replace the current binary remote danger treatment with a richer state:

- Ordinary invader danger:
  - Mark `remote.threat.kind = 'invader'`.
  - Keep miners/haulers retreating.
  - Allow remote guard spawn requests while danger is active.
  - Clear danger only after the room is visible and threat-free for a short safe window, for example 20 ticks.
- Source Keeper danger:
  - If `keeperMode !== 'guarded'`, treat as avoid-only and do not mine that source.
  - If `keeperMode === 'guarded'`, keep source-specific SK state and allow guard operations.
- Player/boosted/core danger:
  - Keep current conservative behavior: retreat economy, skip economy spawns, do not engage in V1.

### Remote Guard Archetype

Add `remoteGuard` body planning in `creep.capabilities.ts`.

Initial unboosted mixed guard bodies:

- Minimum normal invader guard around 760 energy:
  - `[TOUGH, TOUGH, RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE, MOVE, MOVE]`
- Stronger normal guard candidates scale with more `RANGED_ATTACK`, `HEAL`, and enough `MOVE` for plain mobility.
- Minimum SK guard around 1200 energy:
  - Use at least two `HEAL`, multiple `RANGED_ATTACK`, and full plain mobility.
- Use full room `energyCapacityAvailable` for guard requests rather than the existing `BODY_BUDGET_RATIO` cap.
- Keep `ATTACK` optional for v1. Ranged/heal kiting is safer and more flexible for invaders and Source Keepers.

### Spawn Planning

Remote guard requests should be checked before remote economy requests in `remoteSpawnRequest`.

Rules:

- If a remote has an engageable threat and `combatMode === 'guarded'`, spawn up to `maxGuards`.
- Default `maxGuards = 2`.
- Count active and pending guards assigned to the remote.
- Do not spawn new remote miners/haulers while threat is active unless guard coverage is already healthy.
- Guards are allowed through remote danger gates; economy creeps remain blocked.
- If a hostile raid includes healer creeps, require two guards before engagement.
- If the room energy capacity cannot build the minimum guard body, leave the remote paused and log an occasional skip reason.

### Guard Behavior

Add `src/role.remoteGuard.ts` and run it before `fleeFromHostiles` in `main.ts`, similar to `role.defender`.

Behavior:

- If TTL is low and no active engageable threat exists, renew at home.
- If assigned remote has no visible threat, travel to the remote and hold near the center or near the guarded source/lair.
- If there is an engageable threat:
  - Select target priority: hostile healers, ranged attackers, melee attackers, other combat creeps, then Source Keepers.
  - Maintain range 3 where possible.
  - Use `rangedAttack` or `rangedMassAttack` based on hostile density.
  - Heal self first if damaged heavily, then adjacent ally with `heal`, then ally in range 3 with `rangedHeal`.
  - Do not close into melee unless the body has meaningful `ATTACK` and incoming damage math is favorable.
- Grouping:
  - Mixed guards should converge within range 3 of each other before engaging multi-creep raids or Source Keepers.
  - If alone against a lone unhealed invader, engagement is allowed.
  - If alone against SK or a healer-supported raid, kite/hold and wait for the second guard.
- If a guard falls below a critical health ratio, kite toward home exit while healing.

### Worker Retreat and Resume

Keep the existing retreat behavior for remote miners, haulers, scouts, maintainers, and claimers:

- On hostile proximity, mark remote danger and move toward the home room.
- While `dangerUntil` is active, `assignRemoteCreep` keeps economy creeps home and idle.

Refine resume:

- Clear `skipReason: 'danger'` only after visible threat-free observation.
- When danger clears, existing spawn planner resumes normal remote mining.
- Existing hauler renewal-after-trip behavior should remain intact.

### Source Keeper Handling

Only enable SK mining when `keeperMode === 'guarded'`.

When a room is visible:

- Associate each source/mineral with the nearest `STRUCTURE_KEEPER_LAIR` within a practical radius.
- Store `keeperLairId` on the source plan.
- Store a safe waiting tile outside keeper attack range and not on roads/stations if possible.

Source-specific behavior:

- A source is unsafe if:
  - A Source Keeper is alive near the source/station.
  - The assigned lair has `ticksToSpawn` below a conservative threshold, for example 25-50 ticks.
- Remote miners assigned to unsafe SK sources should:
  - Move to `keeperWaitX/Y` if already in the remote and guarded.
  - Otherwise return home.
- Haulers should avoid pickup jobs at unsafe source containers.
- Guards should treat an active Source Keeper as the target and clear it before mining resumes.

### Renewal

Remote guards should reuse `spawn.renewal`.

Suggested thresholds:

- Start renew around TTL 650 when no active engageable threat exists.
- Stop renew around TTL 1400.
- If a threat is active and TTL is low:
  - Request a replacement guard.
  - Continue fighting only if survival math is safe.
  - Retreat once replacement coverage exists or the room is clear.

Do not renew `CLAIM` creeps; this is already the existing pattern.

## Test Plan

Run:

```bash
npm run build
```

Manual/game scenarios:

- Normal invader in an active remote:
  - Miner/hauler retreat.
  - Remote guards spawn.
  - Guards kill invader.
  - Danger clears and mining resumes.
- Invader raid with healer:
  - Two guards group before engaging.
  - Healer is prioritized.
  - Economy creeps remain home until clear.
- Source Keeper remote with `keeperMode: 'guarded'`:
  - Guards kill the Source Keeper.
  - Miner only works during safe windows.
  - Haulers avoid unsafe SK source containers.
- Source Keeper room with default `keeperMode: 'avoid'`:
  - Bot does not attempt guarded SK mining.
- Boosted or player hostile:
  - Economy retreats.
  - Guards do not suicide-engage.
  - Danger remains visible in memory/debug output.
- Regression:
  - Home defender spawning still works.
  - Tower behavior is unchanged.
  - Existing remote standby miner replacement still works after danger clears.

## Documentation and Memory Updates

After implementation, update:

- `architecture/REMOTES.md`
  - Add remote combat fields, guard spawning, SK mode, danger clear behavior, and renewal.
- `architecture/DEFENSE.md`
  - Add remote combat as a separate defense layer from home-room defenders.
- `architecture/OVERVIEW.md`
  - Add any new modules and archetype/job flow.
- `.ai/memory/CODEMAP.md`, `.ai/memory/KNOWN_ISSUES.md`, `.ai/memory/ROADMAP.md`, and `.ai/memory/MEMORY.md` if the implementation changes durable project knowledge.

## Roadmap

- V1: Unboosted invader defense and opt-in SK guarded mining with mixed remote guards.
- V2: Formation profiles, including strict leader-pair attacker/healer squads.
- V3: Boost-aware guard planning and optional lab boost hooks.
- V4: Level-0 Invader Core cleanup for remote controller blockers.
- V5: Stronghold assault planning and loot recovery.


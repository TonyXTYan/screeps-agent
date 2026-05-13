# Defense Architecture

## Three-Layer Defense

```
┌──────────────────────────────────────────┐
│ Layer 1: Towers                           │
│ - Attack armed hostiles (highest priority)│
│ - Heal injured friendly creeps            │
│ - Repair urgent structures                │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ Layer 2: Defender Creeps                  │
│ - Emergency spawn override                │
│ - Runs before economic spawn planning     │
│ - Combat behavior bypasses job runner     │
└──────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ Layer 3: Non-Combat Flee                  │
│ - All non-defender creeps flee hostiles   │
│ - Heal-capable creeps do emergency heal   │
│   instead of fleeing                      │
└──────────────────────────────────────────┘
```

## Layer 1: Towers (tower.basics.ts)

Executed every tick per room in `towerBasics.run(room)`.

### Priority per tower (in order):

```
1. Attack closest armed hostile creep
2. Heal closest injured friendly creep        (only if energy > 50%)
3. Repair:
   a. Very urgent  (< 500 hits, non-wall)     [hits ascending]
   b. Urgent       (< 10K hits, non-wall)     [hits ascending]
   c. Normal       (repairStructureFilter)     [hits ascending]
   d. Walls/ramparts (only if energy ≥ 90%)   [hits ascending]
```

**Claim distribution**: Towers track claimed repair IDs per tick so multiple towers don't all
repair the same target. Each tower picks the next-most-urgent unclaimed structure.

### Repair thresholds

- **Normal structures**: repair when hits < 90% of max
- **Walls/ramparts**: staged cap by RCL (see below), only at ≥90% tower energy
- **Tower minimum energy**: heal/repair branch only runs when tower energy is > 50%

### Wall/rampart staged caps

| RCL   | Max hits |
|-------|----------|
| ≤ 2   | 10,000   |
| ≤ 4   | 30,000   |
| ≤ 6   | 100,000  |
| 7     | 300,000  |
| 8     | ∞        |

From `wallRampartRepairCap()` in `role.doctor.ts`.

### Tower under-siege override

`tryFillTowerUnderSiege(creep)` — when hostiles are present, any creep carrying energy will
fill the nearest tower before doing other work. This is called from legacy role scripts.

## Layer 2: Defender Creeps (creep.populationControl.ts + role.defender.ts)

### Spawning

`populationControl.checkDefenders(room)` runs before the room controller's spawn planner:

```
If room has armed hostiles:
  1. Count current defenders in room
  2. Target defenders = ceil(hostile_count × 1.5)
  3. If below target every 5 ticks:
     a. Use balanceSpec() defender body (TOUGH+MOVE+ATTACK+RANGED_ATTACK)
     b. Minimum body: [TOUGH, MOVE, ATTACK] at 300 energy
     c. Spawn with role = 'defender', attacking = true, homeRoom = room.name
```

### Combat behavior (role.defender.ts)

When `attacking`:
- Find closest armed hostile by range
- Ranged attack + melee attack
- Move into range

When no hostiles present:
- Rally near `rallySpawnId` (nearest spawn)
- Renew at spawn when TTL is low (request under 800, top up toward 1000)

### Execution priority

In the main loop, defenders run **before** the job runner:
```
if (creep.memory.role === 'defender') { roleDefender.run(creep); continue; }
```
This gives defenders immediate combat/renewal behavior and bypasses economic job assignment.

## Layer 3: Non-Combat Flee (main.ts)

### Flee behavior

When a non-defender creep has a hostile within range 5:

1. **Emergency heal**: if the creep has HEAL parts and there's a critically injured ally
   (hits < 35% or in hostile radius 4), chase and heal them instead of fleeing.
2. **Retreat heal**: if fleeing but has HEAL, heal lowest-hp ally in range 1 (melee) or 3 (ranged).
3. **PathFinder flee**: `PathFinder.search()` with `{ flee: true }` from hostiles at range 5.
4. **Edge nudge**: if at room edge, move inward.
5. **Home retreat**: if in foreign room, move toward home room.

### Emergency heal target criteria

```ts
target.hits / target.hitsMax <= 0.35          // critically injured
// OR
target has hostile within 4 range             // in combat danger zone
```

The most critical target is selected by: lowest ratio → most missing HP → closest range.

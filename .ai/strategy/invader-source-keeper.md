# Source Keeper Remote Strategy (Single + Pair)

Scope:
- Remote mining rooms with Source Keepers and Keeper Lairs.
- Practical single/pair combat envelopes for rooms containing 1-4 keepers.

Primary sources:
- `https://docs.screeps.com/api/#StructureKeeperLair`
- `https://wiki.screepspl.us/Invader/` (behavior notes include source-keeper engagement patterns)
- `https://docs.screeps.com/resources.html`

## Key Facts and Assumptions

Officially documented:
- `StructureKeeperLair` spawn cycle is `300` ticks.
- Source Keepers use both melee and ranged behavior when in close range.

Assumption for numeric sizing in this note:
- Per-source-keeper pressure model used:
- `100` damage/tick at range (ranged only).
- `400` damage/tick at range 1 (melee + ranged in same tick).

Why this assumption is explicit:
- Official docs describe behavior but do not publish a full keeper body table on the referenced pages.
- If your shard/version differs, keep the formulas and substitute your measured per-keeper DPS.

Combat constants:
- `HEAL` = `12` per part per tick.
- Required team heal parts for sustained ranged-kite against `N` keepers:
- `ceil(100 * N / 12)` unboosted.

## Heal Requirement by Concurrent Aggro Count

Unboosted required team `HEAL` parts (ranged-only pressure):

| Concurrent keepers on you | Team heal needed |
|---|---:|
| 1 | 9 |
| 2 | 17 |
| 3 | 25 |
| 4 | 34 |

With heal boosts (`LO/LHO2/XLHO2`):

| Concurrent keepers | T1 (`LO`, x2) | T2 (`LHO2`, x3) | T3 (`XLHO2`, x4) |
|---|---:|---:|---:|
| 1 | 5 | 3 | 3 |
| 2 | 9 | 6 | 5 |
| 3 | 13 | 9 | 7 |
| 4 | 17 | 12 | 9 |

## Practical Body Configs

### Solo keeper hunter (1 keeper at a time, unboosted)

`6 TOUGH, 10 RANGED_ATTACK, 9 HEAL, 25 MOVE` (50 parts, 5060 energy)

Output:
- `100` damage/tick
- `108` self-heal/tick

Use:
- Sustained 1-keeper ranged-kite.
- Not intended to tank repeated point-blank face-checks.

### Pair template (2 keepers concurrently, unboosted)

Per creep:
- `6 TOUGH, 12 RANGED_ATTACK, 9 HEAL, 23 MOVE` (50 parts, 5260 energy)

Pair total:
- `240` damage/tick
- `216` self-heal/tick

Use:
- Stable for 2-keeper concurrent pressure with range control.
- Can clear 3-4-keeper rooms by taking fights in sequence.

### If you expect 3-4 concurrent aggro

Unboosted:
- Pair sustain becomes very expensive in heal parts (`25-34` team `HEAL`) and crowds out offense/mobility.

Recommended:
- Keep pair bodies similar, add heal boosts (`LO` minimum).
- Or enforce strict pull discipline so only 1-2 keepers are active at once.

## 1-4 Keeper Room Planning

Interpretation:
- "Room has 1,2,3,4 keepers" does not mean all must be fought simultaneously.
- Real control variable is peak concurrent aggro.

Suggested planning:

| Keepers present in room | Recommended combat plan |
|---|---|
| 1 | 1 solo hunter is enough |
| 2 | 1 strong solo can work; pair is safer |
| 3 | Pair recommended; avoid 3-way simultaneous pulls |
| 4 | Pair minimum, boosted pair preferred for mistakes/overlap |

Operational notes:
- Fight near lair timers; avoid chaining fresh spawns.
- Pre-position and reset if two keepers close distance at once.
- In high-throughput SK rooms, pair uptime is usually better than one oversized solo.

# Paired Siege Envelope (Melee + Ranged)

Scope: two-creep assault concept where one creep is melee and one is ranged.

Concept:
- Creep A: `TOUGH + ATTACK + HEAL + MOVE`
- Creep B: `TOUGH + RANGED_ATTACK + HEAL + MOVE`

Primary sources:
- `https://docs.screeps.com/creeps.html`
- `https://docs.screeps.com/resources.html`
- `https://docs.screeps.com/simultaneous-actions.html`

Assumptions:
- Target is under `N` hostile towers at optimal range (`<= 5`), so incoming is `N * 600` per tick.
- Two creeps stay adjacent and both can heal the focus-fired target each tick.
- Each creep has a 50-part cap.
- Minimum buffer per creep is `6 TOUGH`.
- Each creep keeps at least one offense part (`ATTACK` on melee, `RANGED_ATTACK` on ranged).
- "Practical" means sustain holds and both creeps still retain offense parts.

Pair sustain formula:
- `requiredTotalHealParts >= ceil(N * 600 * toughMult / (12 * healMult))`

Boost multipliers used:
- `HEAL`: none `1x`, T1 `2x` (`LO`), T2 `3x` (`LHO2`), T3 `4x` (`XLHO2`)
- `ATTACK`: none `1x`, T1 `2x` (`UH`), T2 `3x` (`UH2O`), T3 `4x` (`XUH2O`)
- `RANGED_ATTACK`: none `1x`, T1 `2x` (`KO`), T2 `3x` (`KHO2`), T3 `4x` (`XKHO2`)
- `TOUGH` damage multiplier: none `1.0`, T1 `0.7` (`GO`), T2 `0.5` (`GHO2`), T3 `0.3` (`XGHO2`)
- `MOVE` fatigue relief: none `2`, T1 `4` (`ZO`), T2 `6` (`ZHO2`), T3 `8` (`XZHO2`)

Road-speed movement floors for a 50-part creep:
- no MOVE boost: `17 MOVE`
- T1/T2/T3 MOVE boost: `10 / 8 / 6 MOVE`

Notation:
- `A/R` means leftover `ATTACK` on melee creep / leftover `RANGED_ATTACK` on ranged creep at minimum sustain.
- `IMP` means impractical under constraints above.

## How to Read `A/R` into Body Specs

Conversion rules (for a given tier/package):
- Pick `MOVE` count from that package (`17` unboosted, or `10/8/6` for T1/T2/T3 MOVE boost).
- Use fixed `6 TOUGH` per creep.
- Let table cell be `A/R`.
- Then:
- melee HEAL = `50 - 6 - MOVE - A`
- ranged HEAL = `50 - 6 - MOVE - R`

Recommended body order:
- `TOUGH` first, then combat/heal mix, then `MOVE`.

Worked examples:
- `T0`, 1 tower, `A/R = 2/2` (no boosts, `MOVE=17`)
- Melee: `6 TOUGH, 25 HEAL, 2 ATTACK, 17 MOVE`
- Ranged: `6 TOUGH, 25 HEAL, 2 RANGED_ATTACK, 17 MOVE`
- `T2` in `HEAL+MOVE`, 3 towers, `A/R = 11/11` (`MOVE=8`)
- Melee: `6 TOUGH, 25 HEAL, 11 ATTACK, 8 MOVE`
- Ranged: `6 TOUGH, 25 HEAL, 11 RANGED_ATTACK, 8 MOVE`
- `T3` full package, 6 towers, `A/R = 26/27` (`MOVE=6`, boosted `TOUGH`)
- Melee: `6 TOUGH, 12 HEAL, 26 ATTACK, 6 MOVE`
- Ranged: `6 TOUGH, 11 HEAL, 27 RANGED_ATTACK, 6 MOVE`

For example, full bodyparts configs:
- `T0` (`A/R = 2/2`, full package at 1 tower, no boosts on any part)
- Melee body: `TOUGHx6, HEALx25, ATTACKx2, MOVEx17`
- Ranged body: `TOUGHx6, HEALx25, RANGED_ATTACKx2, MOVEx17`
- `T1` (`A/R = 7/8`, full package at 3 towers, `TOUGH+HEAL+ATTACK+RANGED_ATTACK+MOVE` tier-1 boosted)
- Boost set: `GO` on `TOUGH`, `LO` on `HEAL`, `UH` on `ATTACK`, `KO` on `RANGED_ATTACK`, `ZO` on `MOVE`
- Melee body: `TOUGHx6, HEALx27, ATTACKx7, MOVEx10`
- Ranged body: `TOUGHx6, HEALx26, RANGED_ATTACKx8, MOVEx10`
- `T2` (`A/R = 11/11`, `HEAL+MOVE` at 3 towers, only `HEAL` and `MOVE` boosted)
- Boost set: `LHO2` on `HEAL`, `ZHO2` on `MOVE`, `TOUGH/ATTACK/RANGED_ATTACK` unboosted
- Melee body: `TOUGHx6, HEALx25, ATTACKx11, MOVEx8`
- Ranged body: `TOUGHx6, HEALx25, RANGED_ATTACKx11, MOVEx8`
- `T3` (`A/R = 26/27`, full package at 6 towers, `TOUGH+HEAL+ATTACK+RANGED_ATTACK+MOVE` tier-3 boosted)
- Boost set: `XGHO2` on `TOUGH`, `XLHO2` on `HEAL`, `XUH2O` on `ATTACK`, `XKHO2` on `RANGED_ATTACK`, `XZHO2` on `MOVE`
- Melee body: `TOUGHx6, HEALx12, ATTACKx26, MOVEx6`
- Ranged body: `TOUGHx6, HEALx11, RANGED_ATTACKx27, MOVEx6`

## No-Boost Baseline (Tier 0)

This table is strict no boost on all parts (`HEAL/TOUGH/ATTACK/RANGED_ATTACK/MOVE` all unboosted).

| Towers | Required total HEAL (pair) | Feasible? | Minimum `A/R` | Example body pair |
|---|---:|---|---|---|
| 1 | 50 | yes | `2/2` | A: `6 TOUGH, 25 HEAL, 2 ATTACK, 17 MOVE` / B: `6 TOUGH, 25 HEAL, 2 RANGED_ATTACK, 17 MOVE` |
| 2 | 100 | no | `IMP` | impractical |
| 3 | 150 | no | `IMP` | impractical |
| 4 | 200 | no | `IMP` | impractical |
| 5 | 250 | no | `IMP` | impractical |
| 6 | 300 | no | `IMP` | impractical |

## Package Comparison (Unboosted `TOUGH`)

### 1) Only Boost `HEAL`

| Tier | 1 tower | 2 towers | 3 towers | 4 towers | 5 towers | 6 towers |
|---|---|---|---|---|---|---|
| T0 (none) | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` | `IMP` |
| T1 (`LO`) | `14/15` | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` |
| T2 (`LHO2`) | `18/19` | `10/10` | `2/2` | `IMP` | `IMP` | `IMP` |
| T3 (`XLHO2`) | `20/21` | `14/15` | `8/8` | `2/2` | `IMP` | `IMP` |

### 2) Boost `HEAL+MOVE`

| Tier | 1 tower | 2 towers | 3 towers | 4 towers | 5 towers | 6 towers |
|---|---|---|---|---|---|---|
| T0 (none) | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` | `IMP` |
| T1 (`LO+ZO`) | `21/22` | `9/9` | `IMP` | `IMP` | `IMP` | `IMP` |
| T2 (`LHO2+ZHO2`) | `27/28` | `19/19` | `11/11` | `2/3` | `IMP` | `IMP` |
| T3 (`XLHO2+XZHO2`) | `31/32` | `25/26` | `19/19` | `13/13` | `6/7` | `IMP` |

### 3) Boost `HEAL+ATTACK`

Part-count feasibility is the same as "Only Boost `HEAL`" (same `MOVE` and unboosted `TOUGH` assumptions):

| Tier | 1 tower | 2 towers | 3 towers | 4 towers | 5 towers | 6 towers |
|---|---|---|---|---|---|---|
| T0 | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` | `IMP` |
| T1 | `14/15` | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` |
| T2 | `18/19` | `10/10` | `2/2` | `IMP` | `IMP` | `IMP` |
| T3 | `20/21` | `14/15` | `8/8` | `2/2` | `IMP` | `IMP` |

### 4) Boost `HEAL+ATTACK+MOVE`

Part-count feasibility is the same as "Boost `HEAL+MOVE`":

| Tier | 1 tower | 2 towers | 3 towers | 4 towers | 5 towers | 6 towers |
|---|---|---|---|---|---|---|
| T0 | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` | `IMP` |
| T1 | `21/22` | `9/9` | `IMP` | `IMP` | `IMP` | `IMP` |
| T2 | `27/28` | `19/19` | `11/11` | `2/3` | `IMP` | `IMP` |
| T3 | `31/32` | `25/26` | `19/19` | `13/13` | `6/7` | `IMP` |

Practical ceiling with unboosted `TOUGH`:
- T0: `1` tower
- T1: `2` towers
- T2: `4` towers (very low offense at 4)
- T3: `5` towers (low offense at 5)
- `6` towers: impractical

## Tier-Matched Full Combat Package (Includes `TOUGH`)

Package:
- `TOUGH`: `GO / GHO2 / XGHO2`
- `HEAL`: `LO / LHO2 / XLHO2`
- `ATTACK`: `UH / UH2O / XUH2O`
- `RANGED_ATTACK`: `KO / KHO2 / XKHO2`
- `MOVE`: `ZO / ZHO2 / XZHO2`

| Tier | 1 tower | 2 towers | 3 towers | 4 towers | 5 towers | 6 towers |
|---|---|---|---|---|---|---|
| T0 full package (none) | `2/2` | `IMP` | `IMP` | `IMP` | `IMP` | `IMP` |
| T1 full package | `25/25` | `16/17` | `7/8` | `IMP` | `IMP` | `IMP` |
| T2 full package | `31/32` | `27/28` | `23/24` | `19/19` | `15/15` | `11/11` |
| T3 full package | `36/36` | `34/34` | `32/32` | `30/31` | `28/29` | `26/27` |

Takeaways:
- Pairing melee+ranged is significantly stronger than solo dive envelopes.
- Without `TOUGH` boosts, part budget is still the limiting factor at high tower counts.
- With tier-matched full combat boosts, `6` towers becomes practical at T2/T3.

# Solo Siege Envelope (Tower Tank + Melee)

Scope: single creep intended to survive tower fire while dealing melee `ATTACK` damage.

Primary sources:
- `https://docs.screeps.com/creeps.html`
- `https://docs.screeps.com/resources.html`
- `https://docs.screeps.com/simultaneous-actions.html`

Assumptions used in this note:
- Target is under `N` hostile towers, each in optimal range (`<= 5`).
- Tower damage at optimal range is `600` per tower per tick.
- Damage is absorbed by boosted `TOUGH` first (spawn body ordered with `TOUGH` first).
- Creep uses `heal(self)` every tick for the sustain table.
- Alternative table includes the intentionally worse 1-tick `HEAL`, 1-tick `ATTACK` cycle.

## Boost multipliers by tier

From official boosts:
- `HEAL`: none `1x`, `LO` (T1) `2x`, `LHO2` (T2) `3x`, `XLHO2` (T3) `4x`
- `ATTACK`: none `1x`, `UH` (T1) `2x`, `UH2O` (T2) `3x`, `XUH2O` (T3) `4x`
- `TOUGH` damage multiplier: none `1.0`, `GO` (T1) `0.7`, `GHO2` (T2) `0.5`, `XGHO2` (T3) `0.3`

Per-body-part base:
- `HEAL` heals `12` at range 1.
- `ATTACK` deals `30` at range 1.

## Required HEAL parts to sustain tower damage

Formula:
- Every-tick heal sustain: `HEAL >= ceil(N * 600 * toughMult / (12 * healMult))`
- Alternating (`HEAL` one tick, `ATTACK` next tick): `HEAL >= ceil(N * 600 * toughMult / (6 * healMult))`

Per-tier required `HEAL` parts for `N = 1..6` towers:

| Tier | Every-tick HEAL sustain | 1-tick HEAL / 1-tick ATTACK sustain |
|---|---|---|
| none | `50, 100, 150, 200, 250, 300` | `100, 200, 300, 400, 500, 600` |
| T1 (`GO` + `LO`) | `18, 35, 53, 70, 88, 105` | `35, 70, 105, 140, 175, 210` |
| T2 (`GHO2` + `LHO2`) | `9, 17, 25, 34, 42, 50` | `17, 34, 50, 67, 84, 100` |
| T3 (`XGHO2` + `XLHO2`) | `4, 8, 12, 15, 19, 23` | `8, 15, 23, 30, 38, 45` |

Notes:
- 50-part cap makes most non-T3 single-creep sustain cases impossible at high tower counts.
- Alternating heal/attack massively increases required `HEAL`; avoid it for siege creeps.
- `attack()` and `heal()` can be issued in the same tick; prefer every-tick self-heal.

## Practical T3 single-creep body splits (1-6 towers)

Definition of practical for this table:
- Includes boosted `TOUGH` buffer (`6` parts).
- Keeps usable movement (`17 MOVE`): road speed 1 tile/tick, plain speed ~1 tile/2 ticks.
- Sustains with every-tick self-heal (not alternating).

Recommended body order: all `TOUGH` first, then mixed combat parts, then `MOVE`.

Recommended 50-part templates:

| Towers | Body | T3 melee DPS | Practical |
|---|---|---:|---|
| 1 | `6 TOUGH, 5 HEAL, 22 ATTACK, 17 MOVE` | `22*120 = 2640` | Practical |
| 2 | `6 TOUGH, 9 HEAL, 18 ATTACK, 17 MOVE` | `2160` | Practical |
| 3 | `6 TOUGH, 13 HEAL, 14 ATTACK, 17 MOVE` | `1680` | Practical |
| 4 | `6 TOUGH, 16 HEAL, 11 ATTACK, 17 MOVE` | `1320` | Practical |
| 5 | `6 TOUGH, 20 HEAL, 7 ATTACK, 17 MOVE` | `840` | Practical (low DPS) |
| 6 | `6 TOUGH, 24 HEAL, 3 ATTACK, 17 MOVE` | `360` | Impractical for offense |

Why 6 towers is marked impractical:
- It can be made tower-stable on paper, but attack throughput is too low for meaningful solo breach pressure.
- In real fights, pathing friction, range drift, and focus fire variance can also break knife-edge sustain.

## Practicality of alternating HEAL/ATTACK cycle (T3)

With a practical mobility/buffer floor (`6 TOUGH`, `17 MOVE`):
- 1 tower: practical
- 2 towers: practical
- 3 towers: marginal
- 4-6 towers: impractical

Conclusion:
- For solo siege, use every-tick `heal(self)` and issue `attack()` in the same tick.
- Do not design around strict heal/attack alternation except in low-pressure situations.

## Boost Package Sections

This section compares four requested boost packages:
- only boost `HEAL`
- boost `HEAL+MOVE`
- boost `HEAL+ATTACK`
- boost `HEAL+ATTACK+MOVE`

Assumptions for all four sections:
- `TOUGH` is **unboosted** in these package comparisons.
- Sustain still uses every-tick `heal(self)`.
- Tower model remains optimal-range `600` damage per tower per tick.
- For "practical" single-creep templates, reserve at least `6 TOUGH` as a minimum attrition buffer.

### 1) Only Boost `HEAL`

Compounds:
- T1 `LO` (`HEAL x2`)
- T2 `LHO2` (`HEAL x3`)
- T3 `XLHO2` (`HEAL x4`)

Required `HEAL` parts to sustain `1..6` towers:

| HEAL tier | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|
| T1 | 25 | 50 | 75 | 100 | 125 | 150 |
| T2 | 17 | 34 | 50 | 67 | 84 | 100 |
| T3 | 13 | 25 | 38 | 50 | 63 | 75 |

Practical envelope (road-speed unboosted movement, `17 MOVE`):
- max practical towers with `>=6 TOUGH`: T1 `1`, T2 `1`, T3 `2`

### 2) Boost `HEAL+MOVE`

Compounds:
- `HEAL`: `LO` / `LHO2` / `XLHO2`
- `MOVE`: `ZO` / `ZHO2` / `XZHO2`

MOVE fatigue clearing per `MOVE` part:
- none `2`, T1 `4`, T2 `6`, T3 `8`

Minimum `MOVE` for full road speed (50-part creep):
- T1 `10 MOVE`, T2 `8 MOVE`, T3 `6 MOVE`

Required `HEAL` parts are identical to section (1), since `TOUGH` is still unboosted.

Practical envelope (using road-speed MOVE minima above):
- max practical towers with `>=6 TOUGH`: T1 `1`, T2 `2`, T3 `3`

Reference practical limit bodies:
- T1 @1 tower: `15 TOUGH, 25 HEAL, 10 MOVE`
- T2 @2 towers: `8 TOUGH, 34 HEAL, 8 MOVE`
- T3 @3 towers: `6 TOUGH, 38 HEAL, 6 MOVE`

### 3) Boost `HEAL+ATTACK`

Compounds:
- `HEAL`: `LO` / `LHO2` / `XLHO2`
- `ATTACK`: `UH` / `UH2O` / `XUH2O`

For offensive templates with unboosted movement (`17 MOVE`) and `6 TOUGH` buffer:
- `ATTACK = 50 - 17 - 6 - HEAL = 27 - HEAL`

Practical offense envelope (`ATTACK >= 1` and sustain satisfied):
- T1: up to `1` tower (`2 ATTACK` left)
- T2: up to `1` tower (`10 ATTACK` left)
- T3: up to `2` towers (`2 ATTACK` left at 2 towers)

Conclusion for this package:
- Works only at low tower counts unless `TOUGH` is also boosted.

### 4) Boost `HEAL+ATTACK+MOVE`

Compounds:
- `HEAL`: `LO` / `LHO2` / `XLHO2`
- `ATTACK`: `UH` / `UH2O` / `XUH2O`
- `MOVE`: `ZO` / `ZHO2` / `XZHO2`

With `6 TOUGH` buffer and road-speed MOVE minima (`10/8/6`):
- T1: `ATTACK = 34 - HEAL`
- T2: `ATTACK = 36 - HEAL`
- T3: `ATTACK = 38 - HEAL`

Practical offense envelope (`ATTACK >= 1` and sustain satisfied):
- T1: up to `1` tower (`9 ATTACK` left)
- T2: up to `2` towers (`2 ATTACK` left)
- T3: up to `2` towers (`13 ATTACK` left at 2 towers; `0` at 3 towers)

Operational note:
- For serious multi-tower solo dives, the limiting factor is usually unboosted `TOUGH`.
- If your goal is sustained deep tower soaking, include `TOUGH` boosts (`GO/GHO2/XGHO2`) as in earlier sections.

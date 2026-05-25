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

## Pure HEAL/TOUGH/MOVE drain tank (all boost tiers)

Scope: single creep whose job is to soak tower fire and drain tower energy, not deal structure DPS.

Assumptions for these templates:
- Every-tick `heal(self)` sustain (not alternating).
- `50` total body parts.
- `TOUGH` parts are first in body order.
- "Matched tier" means `TOUGH`, `HEAL`, and `MOVE` are all boosted at the same tier.

Sustain formula (same as above):
- `HEAL >= ceil(N * 600 * toughMult / (12 * healMult))`

MOVE fatigue math (from `creeps.html` movement rules plus MOVE boosts from `resources.html`):
- Every non-`MOVE` part adds fatigue: road `1`, plain `2`, swamp `10`.
- One unboosted `MOVE` removes `2` fatigue/tick.
- Boosted `MOVE` uses multipliers: `ZO` (T1) `2x`, `ZHO2` (T2) `3x`, `XZHO2` (T3) `4x`.
- So one `MOVE` removes fatigue/tick: none `2`, T1 `4`, T2 `6`, T3 `8`.

Minimum `MOVE` for full speed (1 tile/tick) with 50-part creep:
- Road: `MOVE >= ceil(50 / (fatigueClearPerMove + 1))`
- Plain: `MOVE >= ceil(100 / (fatigueClearPerMove + 2))`

Road / plain minimums by MOVE tier:
- none: `17 / 25`
- T1 (`ZO`): `10 / 17`
- T2 (`ZHO2`): `8 / 13`
- T3 (`XZHO2`): `6 / 10`

The tables below optimize for road-speed mobility (use the road minimum for each tier), which is the usual base-drain pathing target.

### None (no boosts)

| Towers | Min HEAL | 50-part pure drain body (road-speed `17 MOVE`) | Practical |
|---|---:|---|---|
| 1 | 50 | Impractical | Impractical |
| 2 | 100 | Impractical | Impractical |
| 3 | 150 | Impractical | Impractical |
| 4 | 200 | Impractical | Impractical |
| 5 | 250 | Impractical | Impractical |
| 6 | 300 | Impractical | Impractical |

### T1 (`GO` + `LO`)

| Towers | Min HEAL | 50-part pure drain body (road-speed `10 MOVE`, with `ZO`) | Practical |
|---|---:|---|---|
| 1 | 18 | `22 TOUGH, 18 HEAL, 10 MOVE` | Practical |
| 2 | 35 | `5 TOUGH, 35 HEAL, 10 MOVE` | Practical (thin TOUGH buffer) |
| 3 | 53 | Impractical | Impractical |
| 4 | 70 | Impractical | Impractical |
| 5 | 88 | Impractical | Impractical |
| 6 | 105 | Impractical | Impractical |

### T2 (`GHO2` + `LHO2`)

| Towers | Min HEAL | 50-part pure drain body (road-speed `8 MOVE`, with `ZHO2`) | Practical |
|---|---:|---|---|
| 1 | 9 | `33 TOUGH, 9 HEAL, 8 MOVE` | Practical |
| 2 | 17 | `25 TOUGH, 17 HEAL, 8 MOVE` | Practical |
| 3 | 25 | `17 TOUGH, 25 HEAL, 8 MOVE` | Practical |
| 4 | 34 | `8 TOUGH, 34 HEAL, 8 MOVE` | Practical (low TOUGH buffer) |
| 5 | 42 | `0 TOUGH, 42 HEAL, 8 MOVE` | Impractical (no TOUGH buffer) |
| 6 | 50 | Impractical | Impractical |

### T3 (`XGHO2` + `XLHO2`)

| Towers | Min HEAL | 50-part pure drain body (road-speed `6 MOVE`, with `XZHO2`) | Practical |
|---|---:|---|---|
| 1 | 4 | `40 TOUGH, 4 HEAL, 6 MOVE` | Practical |
| 2 | 8 | `36 TOUGH, 8 HEAL, 6 MOVE` | Practical |
| 3 | 12 | `32 TOUGH, 12 HEAL, 6 MOVE` | Practical |
| 4 | 15 | `29 TOUGH, 15 HEAL, 6 MOVE` | Practical |
| 5 | 19 | `25 TOUGH, 19 HEAL, 6 MOVE` | Practical |
| 6 | 23 | `21 TOUGH, 23 HEAL, 6 MOVE` | Practical |

Operational note:
- This section is for tower draining/aggro only. If you need breach damage, use mixed `ATTACK` bodies from the previous section.

# Remote Invader + InvaderCore Response

Scope:
- Remote mining defense in rooms where NPC Invaders are the light (`RCL < 4`) type.
- Clearing lesser `InvaderCore` structures that reserve remote controllers.
- Evaluate whether one shared body can do both jobs well.

Primary sources:
- `https://docs.screeps.com/invaders.html`
- `https://docs.screeps.com/api/#StructureInvaderCore`
- `https://docs.screeps.com/resources.html`
- `https://wiki.screepspl.us/Private_Server_Common_Tasks/` (explicit light-invader body arrays)

## NPC Profiles Used

From official Invaders doc:
- Remote/low-level rooms get light invader variants.
- Raid invaders can be boosted with `UH`, `KO`, `LO`, `ZH`, `GO`.

Body arrays used for light invader calculations (community reference with explicit arrays):
- `invader_small_melee`: `2 TOUGH, 5 MOVE, 3 ATTACK`
- `invader_small_ranged`: `2 TOUGH, 5 MOVE, 3 RANGED_ATTACK`
- `invader_small_healer`: `5 MOVE, 5 HEAL`

Combat constants:
- `ATTACK` = `30` damage/part/tick
- `RANGED_ATTACK` = `10` damage/part/tick
- `HEAL` = `12` heal/part/tick
- T1 boost multipliers used here:
- `UH` (`ATTACK x2`), `KO` (`RANGED_ATTACK x2`), `LO` (`HEAL x2`), `GO` (`TOUGH damage x0.7`)

## Threat Envelope (Light Invaders)

Per creep combat output:

| Type | Unboosted | T1-boosted |
|---|---:|---:|
| small melee | `90` dmg/tick | `180` dmg/tick |
| small ranged | `30` dmg/tick | `60` dmg/tick |
| small healer | `60` heal/tick | `120` heal/tick |

Notes:
- To kill a boosted healer, your focus-fire must exceed `120` damage/tick.
- `GO` on 2 `TOUGH` parts increases effective HP of those first 200 HP by about `43%`.

## Practical Defender Bodies

### Single-light-invader interceptor

`2 TOUGH, 6 ATTACK, 7 MOVE, 1 HEAL` (16 parts, 1100 energy)

Use case:
- Cheap remote guard for lone light invaders.
- Works best if invaders are not in 2-5 raid packs.

### Strong single guard

`4 TOUGH, 8 ATTACK, 10 MOVE, 4 HEAL` (26 parts, 2180 energy)

Use case:
- Better against boosted lone invaders and short skirmishes.
- Still not a guaranteed answer to a full boosted raid pack by itself.

### Raid-response pair (recommended for 2-5 invader packs)

Melee anchor:
- `4 TOUGH, 10 ATTACK, 10 MOVE, 2 HEAL` (26 parts, 1840 energy)

Ranged support:
- `4 TOUGH, 8 RANGED_ATTACK, 10 MOVE, 4 HEAL` (26 parts, 2740 energy)

Combined output:
- `380` damage/tick, `72` self-heal/tick across the pair.

Operationally:
- Focus fire healer first.
- Avoid prolonged stand-and-trade if the whole enemy pack is boosted.

## Lesser InvaderCore Clearing

From API/constants:
- `InvaderCore` has `100,000` hits.
- Lesser cores reserve/attack controller but do not run a full stronghold structure cluster in remote expansions.

Fastest cheap damage source:
- `WORK` dismantle (`50`/part/tick) is far better than `ATTACK` (`30`/part/tick) for core busting.

Core-killer templates (unboosted):

| Home RCL target | Body | Dismantle DPS | 100k TTK |
|---|---|---:|---:|
| RCL3 | `2 TOUGH, 5 WORK, 3 MOVE` | `250` | `400` ticks |
| RCL4 | `4 TOUGH, 9 WORK, 6 MOVE` | `450` | `223` ticks |
| RCL5 | `6 TOUGH, 13 WORK, 8 MOVE` | `650` | `154` ticks |
| RCL6 | `8 TOUGH, 16 WORK, 10 MOVE` | `800` | `125` ticks |

## Can Invader-Fighter and Core-Buster Be Shared?

Short answer:
- Possible, but inefficient.

Example shared hybrid:
- `4 TOUGH, 8 ATTACK, 4 RANGED_ATTACK, 4 HEAL, 10 MOVE`
- Cost `2780`, combat DPS `280`, core TTK `358` ticks.

Compared to specialized bodies:
- Specialized core-buster at similar/less cost kills core much faster (`~125-223` ticks).
- Specialized invader guard has more practical combat resilience per energy.

Recommendation:
- Use separate roles:
- `remoteGuard` for invaders.
- `remoteCoreBuster` (WORK-heavy) for lesser cores.

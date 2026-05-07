Resources | Screeps Documentation































































There are 4 kinds of resources in the game: **energy**, **minerals**, **power**, and **commodities**.
Resources can be harvested, processed, traded on the market, carried by creeps, and stored in structures.
All resource kinds have different purposes, and you start playing only with access to the most basic one: energy.

## [](#Energy)Energy[](#Energy)
**Where to get:** a [`Source`](/api/#Source) in almost any room.

**How to get:** send a creep with a `WORK` part and [`harvest`](/api/#Creep.harvest) it.

**Needed for:** spawning creeps, building structures.

Energy is the main construction material in the Screeps world. Your base works on energy, so harvesting plenty of it is vital for any colony.
You can harvest energy not only in your home room, but also in other rooms remotely to increase energy income.

## [](#Minerals)Minerals[](#Minerals)
**Where to get:** a [`Mineral`](/api/#Mineral) in almost any room.

**How to get:** build a [`StructureExtractor`](/api/#StructureExtractor), send a creep with a `WORK` part, and [`harvest`](/api/#Creep.harvest) it.

**Needed for:** boosting creeps' capabilities, and also for producing trade commodities.

By mining and processing minerals, you can significantly speed up your economy and boost the effectiveness of your creeps.
Working with minerals consists of 3 steps:

### [](#Harvesting)Harvesting[](#Harvesting)
There are 7 types of base minerals shown in the picture below.
*
Each room contains only one mineral type, so in order to handle them effectively you need either access to several suitable rooms or trade relationships with other players.
A mineral deposit is located in a room at a spot marked by a special symbol. To start mining the deposit, you need to construct the special structure [**Extractor**](/api/#StructureExtractor) on top of it (available at Room Controller Level 6). Upon building it, you can start applying the method [`harvest`](/api/#Creep.harvest) to the deposit thus mining the corresponding mineral in the same way you harvest energy.

### [](#Mineral-compounds)Mineral compounds[](#Mineral-compounds)
Base minerals are useless on their own. In order to impart some useful capabilities to them, you have to combine them according to special formulas in the structure called [**Lab**](/api/#StructureLab).

One reaction requires three labs: two as reagent sources, and the third one as the produce collector. The labs should be within the range of 2 squares from each other. One lab cannot contain more than one mineral type at the same time.

```js
var labs = room.find(FIND_MY_STRUCTURES,
{filter: {structureType: STRUCTURE_LAB}});

labs[0].runReaction(labs[1], labs[2]);

// on the next tick...

console.log(labs[0].mineralType) // -> OH
console.log(labs[1].mineralType) // -> O
console.log(labs[2].mineralType) // -> H
```

### [](#Creep-boosts)Creep boosts[](#Creep-boosts)
Apart from running chemical reactions with minerals, a lab can use resulting compounds to permanently upgrade your creeps boosting their specific properties.
Each compound is applied to one body part of the creep of a certain type using the [`StructureLab.boostCreep`](/api/#StructureLab.boostCreep) method according to the table below and boosts the effectiveness of one of the actions of this creep. The boosted part works as two, three, or even four corresponding parts. To boost the whole creep, you need to boost all its parts of the given type.
Boosting one body part takes 30 mineral compound units and 20 energy units. One body part can be boosted only with one compound type.

*
Mineral compounds
*(click to expand)*

| Name | Formula | Time | Body part | Effect |
| --- | --- | --- | --- | --- |
| Base compounds |
| *hydroxide |  +  | 20 | — | — |
| zynthium keanite |  +  | 5 | — | — |
| utrium lemergite |  +  | 5 | — | — |
| ghodium |  +  | 5 | — | — |
| Tier 1 compounds |
| utrium hydride |  +  | 10 | `ATTACK` | +100% `attack` effectiveness |
| utrium oxide |  +  | 10 | `WORK` | +200% `harvest` effectiveness |
| keanium hydride |  +  | 10 | `CARRY` | +50 capacity |
| keanium oxide |  +  | 10 | `RANGED_ATTACK` | +100% `rangedAttack` and `rangedMassAttack` effectiveness |
| lemergium hydride |  +  | 15 | `WORK` | +50% `repair` and `build` effectiveness without increasing the energy cost |
| lemergium oxide |  +  | 10 | `HEAL` | +100% `heal` and `rangedHeal` effectiveness |
| zynthium hydride |  +  | 20 | `WORK` | +100% `dismantle` effectiveness |
| zynthium oxide |  +  | 10 | `MOVE` | +100% fatigue decrease speed |
| ghodium hydride |  +  | 10 | `WORK` | +50% `upgradeController` effectiveness without increasing the energy cost |
| ghodium oxide |  +  | 10 | `TOUGH` | -30% damage taken |
| Tier 2 compounds |
| utrium acid |  +  | 5 | `ATTACK` | +200% `attack` effectiveness |
| utrium alkalide |  +  | 5 | `WORK` | +400% `harvest` effectiveness |
| keanium acid |  +  | 5 | `CARRY` | +100 capacity |
| keanium alkalide |  +  | 5 | `RANGED_ATTACK` | +200% `rangedAttack` and `rangedMassAttack` effectiveness |
| lemergium acid |  +  | 10 | `WORK` | +80% `repair` and `build` effectiveness without increasing the energy cost |
| lemergium alkalide |  +  | 5 | `HEAL` | +200% `heal` and `rangedHeal` effectiveness |
| zynthium acid |  +  | 40 | `WORK` | +200% `dismantle` effectiveness |
| zynthium alkalide |  +  | 5 | `MOVE` | +200% fatigue decrease speed |
| ghodium acid |  +  | 15 | `WORK` | +80% `upgradeController` effectiveness without increasing the energy cost |
| ghodium alkalide |  +  | 30 | `TOUGH` | -50% damage taken |
| Tier 3 compounds |
| catalyzed utrium acid |  +  | 60 | `ATTACK` | +300% `attack` effectiveness |
| catalyzed utrium alkalide |  +  | 60 | `WORK` | +600% `harvest` effectiveness |
| catalyzed keanium acid |  +  | 60 | `CARRY` | +150 capacity |
| catalyzed keanium alkalide |  +  | 60 | `RANGED_ATTACK` | +300% `rangedAttack` and `rangedMassAttack` effectiveness |
| catalyzed lemergium acid |  +  | 65 | `WORK` | +100% `repair` and `build` effectiveness without increasing the energy cost |
| catalyzed lemergium alkalide |  +  | 60 | `HEAL` | +300% `heal` and `rangedHeal` effectiveness |
| catalyzed zynthium acid |  +  | 160 | `WORK` | +300% `dismantle` effectiveness |
| catalyzed zynthium alkalide |  +  | 60 | `MOVE` | +300% fatigue decrease speed |
| catalyzed ghodium acid |  +  | 80 | `WORK` | +100% `upgradeController` effectiveness without increasing the energy cost |
| catalyzed ghodium alkalide |  +  | 150 | `TOUGH` | -70% damage taken |

## [](#Commodities)Commodities[](#Commodities)
**Where to get:** a [`Deposit`](/api/#Deposit) in "highway" rooms.

**How to get:** send a creep with a `WORK` part and [`harvest`](/api/#Creep.harvest) it.

**Needed for:** producing trade commodities and earning credits.

Trade commodities are resources that NPC market traders are most interested in. These resources have no other purpose
other than to be sold and generate credits. Producing high-level commodities is the most profitable business in the game.

### [](#Harvesting-1)Harvesting[](#Harvesting-1)
You harvest raw commodities from a [`Deposit`](/api/#Deposit) in "highway" rooms that divide living sectors on the map.
There are 4 types of raw resources: Metal, Silicon, Biomass, Mist.
They are distributed unevenly across the world map: one resource type per map quadrant (NW, NE, SW, SE).

Unlike minerals, these deposits exhaust as you harvest them: the more you harvest, the longer cooldown becomes.
They vanish when you stop harvesting it after some time, and reappear elsewhere nearby.
Also, a new deposit will appear in the sector if all other deposits are exhausted below some level.

### [](#Basic-commodities)Basic commodities[](#Basic-commodities)
Selling raw resources may be not very profitable.
This is why it's a better idea to build a [**Factory**](/api/#StructureFactory) (available at RCL 7) in order to [`produce`](/api/#StructureFactory.produce) more complex commodities.
A newly built factory has no level which means it can produce just a few basic commodities out of all kinds of existing resources ("any level" tier in the tables below).
They also can be used to store resources in a "compressed" form.

*
Compressing commodities
*(click to expand)*
*


| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Utrium bar &times; *100* | Any level | Utrium &times; *500*
Energy &times; *200* | 20 ticks |
| Lemergium bar &times; *100* | Any level | Lemergium &times; *500*
Energy &times; *200* | 20 ticks |
| Zynthium bar &times; *100* | Any level | Zynthium &times; *500*
Energy &times; *200* | 20 ticks |
| Keanium bar &times; *100* | Any level | Keanium &times; *500*
Energy &times; *200* | 20 ticks |
| Ghodium melt &times; *100* | Any level | Ghodium &times; *500*
Energy &times; *200* | 20 ticks |
| Oxidant &times; *100* | Any level | Oxygen &times; *500*
Energy &times; *200* | 20 ticks |
| Reductant &times; *100* | Any level | Hydrogen &times; *500*
Energy &times; *200* | 20 ticks |
| Purifier &times; *100* | Any level | Catalyst &times; *500*
Energy &times; *200* | 20 ticks |
| Battery &times; *50* | Any level | Energy &times; *600* | 10 ticks |

You can decompress to recover raw resources when you need them.



*
Decompressing commodities
*(click to expand)*
*



| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Utrium &times; *500* | Any level | Utrium bar &times; *100*
Energy &times; *200* | 20 ticks |
| Lemergium &times; *500* | Any level | Lemergium bar &times; *100*
Energy &times; *200* | 20 ticks |
| Zynthium &times; *500* | Any level | Zynthium bar &times; *100*
Energy &times; *200* | 20 ticks |
| Keanium &times; *500* | Any level | Keanium bar &times; *100*
Energy &times; *200* | 20 ticks |
| Ghodium &times; *500* | Any level | Ghodium melt &times; *100*
Energy &times; *200* | 20 ticks |
| Oxygen &times; *500* | Any level | Oxidant &times; *100*
Energy &times; *200* | 20 ticks |
| Hydrogen &times; *500* | Any level | Reductant &times; *100*
Energy &times; *200* | 20 ticks |
| Catalyst &times; *500* | Any level | Purifier &times; *100*
Energy &times; *200* | 20 ticks |
| Energy &times; *500* | Any level | Battery &times; *50* | 10 ticks |





When you gain access to regional deposit resources, you can start producing additional basic commodities from them.

*
Basic regional commodities
*(click to expand)*
*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Wire &times; *20* | Any level | Utrium bar &times; *20*
Silicon &times; *100*
Energy &times; *40* | 8 ticks |
| Cell &times; *20* | Any level | Lemergium bar &times; *20*
Biomass &times; *100*
Energy &times; *40* | 8 ticks |
| Alloy &times; *20* | Any level | Zynthium bar &times; *20*
Metal &times; *100*
Energy &times; *40* | 8 ticks |
| Condensate &times; *20* | Any level | Keanium bar &times; *20*
Mist &times; *100*
Energy &times; *40* | 8 ticks |

All commodities above can be produced in a factory of any level.

### [](#Higher-commodities)Higher commodities[](#Higher-commodities)
The full use of factories is possible with [Operators](power.html#Power-Creeps) only, and their `OPERATE_FACTORY` power.
When an Operator uses this power on a factory without a level, the level of the factory is permanently set to the level of the power, and the same effect is applied on the factory.
It enables the factory to produce commodities of the corresponding level.
The factory can only produce commodities of exactly the same level, or "any level" commodities.
Once set, the factory level cannot be changed.
When the effect duration ends, the factory simply becomes inactive, but its level remains the same ("any level" commodities are still available though).
You need an Operator with the same power level to reactivate it again.
Another level cannot be applied, the only way to change the factory level is to rebuild it.
Each of high-level commodities requires lower level commodities to be produced which forms production chains. There are four production chains, one for each of new resource types:
**Mechanical** (consumes Metal), **Electronical** (consumes Silicon), **Biological** (consumes Biomass), and **Mystical** (consumes Mist), as well as common components.
These commodities have the most lucrative prices on the market.

*
Common higher commodities
*(click to expand)*
*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Composite &times; *20* | Lvl 1 | Utrium bar &times; *20*
Zynthium bar &times; *20*
Energy &times; *20* | 50 ticks |
| Crystal &times; *6* | Lvl 2 | Lemergium bar &times; *6*
Keanium bar &times; *6*
Purifier &times; *6*
Energy &times; *45* | 21 ticks |
| Liquid &times; *12* | Lvl 3 | Oxidant &times; *12*
Reductant &times; *12*
Ghodium melt &times; *12*
Energy &times; *90* | 60 ticks |

*
Mechanical chain
*(click to expand)*
*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Tube &times; *2* | Lvl 1 | Alloy &times; *40*
Zynthium bar &times; *16*
Energy &times; *8* | 45 ticks |
| Fixtures | Lvl 2 | Composite &times; *20*
Alloy &times; *41*
Oxidant &times; *161*
Energy &times; *8* | 115 ticks |
| Frame | Lvl 3 | Fixtures &times; *2*
Tube &times; *4*
Reductant &times; *330*
Zynthium bar &times; *31*
Energy &times; *16* | 125 ticks |
| Hydraulics | Lvl 4 | Liquid &times; *150*
Fixtures &times; *3*
Tube &times; *15*
Purifier &times; *208*
Energy &times; *32* | 800 ticks |
| Machine | Lvl 5 | Hydraulics &times; *1*
Frame &times; *2*
Fixtures &times; *3*
Tube &times; *12*
Energy &times; *64* | 600 ticks |

*
Biological chain
*(click to expand)*
*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Phlegm &times; *2* | Lvl 1 | Cell &times; *20*
Oxidant &times; *36*
Lemergium bar &times; *16*
Energy &times; *8* | 35 ticks |
| Tissue &times; *2* | Lvl 2 | Phlegm &times; *10*
Cell &times; *10*
Reductant &times; *110*
Energy &times; *16* | 164 ticks |
| Muscle | Lvl 3 | Tissue &times; *3*
Phlegm &times; *3*
Zynthium bar &times; *50*
Reductant &times; *50*
Energy &times; *16* | 250 ticks |
| Organoid | Lvl 4 | Muscle &times; *1*
Tissue &times; *5*
Purifier &times; *208*
Oxidant &times; *256*
Energy &times; *32* | 800 ticks |
| Organism | Lvl 5 | Organoid &times; *1*
Liquid &times; *150*
Tissue &times; *6*
Cell &times; *310*
Energy &times; *64* | 600 ticks |

*
Electronical chain
*(click to expand)*
*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Switch &times; *5* | Lvl 1 | Wire &times; *40*
Oxidant &times; *95*
Utrium bar &times; *35*
Energy &times; *20* | 70 ticks |
| Transistor | Lvl 2 | Switch &times; *4*
Wire &times; *15*
Reductant &times; *85*
Energy &times; *8* | 59 ticks |
| Microchip | Lvl 3 | Transistor &times; *2*
Composite &times; *50*
Wire &times; *117*
Purifier &times; *25*
Energy &times; *16* | 250 ticks |
| Circuit | Lvl 4 | Microchip &times; *1*
Transistor &times; *5*
Switch &times; *4*
Oxidant &times; *115*
Energy &times; *32* | 800 ticks |
| Device | Lvl 5 | Circuit &times; *1*
Microchip &times; *3*
Crystal &times; *110*
Ghodium melt &times; *150*
Energy &times; *64* | 600 ticks |

*
Mystical chain
*(click to expand)*

| Product | Factory | Components | Cooldown |
| --- | --- | --- | --- |
| Concentrate &times; *3* | Lvl 1 | Condensate &times; *30*
Keanium bar &times; *15*
Reductant &times; *54*
Energy &times; *12* | 41 ticks |
| Extract &times; *2* | Lvl 2 | Concentrate &times; *10*
Condensate &times; *30*
Oxidant &times; *60*
Energy &times; *16* | 128 ticks |
| Spirit | Lvl 3 | Extract &times; *2*
Concentrate &times; *6*
Reductant &times; *90*
Purifier &times; *20*
Energy &times; *16* | 200 ticks |
| Emanation | Lvl 4 | Spirit &times; *2*
Extract &times; *2*
Concentrate &times; *3*
Keanium bar &times; *112*
Energy &times; *32* | 800 ticks |
| Essence | Lvl 5 | Emanation &times; *1*
Spirit &times; *3*
Crystal &times; *110*
Ghodium melt &times; *150*
Energy &times; *64* | 600 ticks |

## [](#Power)Power[](#Power)
**Where to get:** a [`StructurePowerBank`](/api/#StructurePowerBank) in "highway" rooms.

**How to get:** destroy the structure and loot the dropped resource.

**Needed for:** creating Power Creeps.

See this article for more info: [Power](power.html).








**Contents**
1. [Energy](#Energy)
2. [Minerals](#Minerals)[Harvesting](#Harvesting)
3. [Mineral compounds](#Mineral-compounds)
4. [Creep boosts](#Creep-boosts)
[Commodities](#Commodities)1. [Harvesting](#Harvesting-1)
2. [Basic commodities](#Basic-commodities)
3. [Higher commodities](#Higher-commodities)
[Power](#Power)
[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
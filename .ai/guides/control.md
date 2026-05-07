Control | Screeps Documentation
































































## [](#Global-Control-Level)Global Control Level[](#Global-Control-Level)
To expand your empire in the game world, you need to develop your main game indicator – your **Global Control Level** (GCL). It affects two important factors:
- **Your CPU Limit.** On the official server you begin the game with a 20 CPU limit which allows you to control just a small number of creeps. However, if your CPU is unlocked with a "CPU Unlock" item, you gain 10 CPU for each GCL level until your limit reaches 300 CPU. Then it stops increasing.
- **The amount of rooms you can control.** For example, to control 3 rooms, you need to have GCL 3.

Your current Global Control Level is displayed at your [overview page](https://screeps.com/a/#!/overview).

## [](#Room-Controller-Level)Room Controller Level[](#Room-Controller-Level)
In order to build any facilities in a room, you need to control it. In the majority of rooms (but not all), there are special objects called **Room Controllers**. In your first room, the Controller is owned by you by default. Any neutral Controller can be [claimed](/api/#Creep.claimController) by your creeps with the `CLAIM` body part, which instantly puts the room under your control.

A newly-seized Controller allows you to build one spawn in the room. In order for you to build extra spawns, roads, and extensions, you have to upgrade the Room Controller Level (RCL) by pumping energy into the controller using [`Creep.upgradeController`](/api/#Creep.upgradeController) method.

## [](#Available-structures-per-RCL)Available structures per RCL[](#Available-structures-per-RCL)
| RCL | Energy to upgrade | Structures |
| --- | --- | --- |
| 0 | — | Roads, 5 Containers |
| 1 | 200 | Roads, 5 Containers, 1 Spawn |
| 2 | 45,000 | Roads, 5 Containers, 1 Spawn, 5 Extensions (50 capacity), Ramparts (300K max hits), Walls |
| 3 | 135,000 | Roads, 5 Containers, 1 Spawn, 10 Extensions (50 capacity), Ramparts (1M max hits), Walls, 1 Tower |
| 4 | 405,000 | Roads, 5 Containers, 1 Spawn, 20 Extensions (50 capacity), Ramparts (3M max hits), Walls, 1 Tower, Storage |
| 5 | 1,215,000 | Roads, 5 Containers, 1 Spawn, 30 Extensions (50 capacity), Ramparts (10M max hits), Walls, 2 Towers, Storage, 2 Links |
| 6 | 3,645,000 | Roads, 5 Containers, 1 Spawn, 40 Extensions (50 capacity), Ramparts (30M max hits), Walls, 2 Towers, Storage, 3 Links, Extractor, 3 Labs, Terminal |
| 7 | 10,935,000 | Roads, 5 Containers, 2 Spawns, 50 Extensions (100 capacity), Ramparts (100M max hits), Walls, 3 Towers, Storage, 4 Links, Extractor, 6 Labs, Terminal, Factory |
| 8 | — | Roads, 5 Containers, 3 Spawns, 60 Extensions (200 capacity), Ramparts (300M max hits), Walls, 6 Towers, Storage, 6 Links, Extractor, 10 Labs, Terminal, Factory, Observer, Power Spawn, Nuker |

## [](#Attacking-controllers)Attacking controllers[](#Attacking-controllers)
A Controller cannot be damaged or destroyed. However, a Controller not affected by an [`upgradeController`](/api/#Creep.upgradeController) action will run a downgrade timer losing 20,000 game ticks at RCL 1, or 5,000 game ticks at RCL 2 to 150,000 game ticks at RCL 8. All timers are listed in the [`StructureController`](/api/#StructureController) prototype. As soon as its level reaches 0, a Controller becomes neutral, and another player can reclaim it. Make sure that you upgrade your Controllers from time to time to keep their levels!
You can attack another player's controller downgrade timer by applying [`attackController`](/api/#Creep.attackController) on it.

## [](#Raising-GCL)Raising GCL[](#Raising-GCL)
Upgrading GCL requires pumping energy into your Controllers – GCL grows in parallel with the level of your Controllers. Any contribution to any of your Controllers affects your GCL, even if the Controller is fully upgraded to the level 8.
Having upgraded your GCL once, you will never lose it. Even after complete fail in the game and loss of all your rooms, your GCL is stored in your account forever. It allows you to respawn at a new place and quickly regain your former glory.
If some day in the future you plan to claim a room that requires a higher GCL than you have, you can still [reserve](/api/#Creep.reserveController) its Controller. Also, reserving a Controller in a neutral room restores energy sources to their full capacity.








**Contents**
1. [Global Control Level](#Global-Control-Level)
2. [Room Controller Level](#Room-Controller-Level)
3. [Available structures per RCL](#Available-structures-per-RCL)
4. [Attacking controllers](#Attacking-controllers)
5. [Raising GCL](#Raising-GCL)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
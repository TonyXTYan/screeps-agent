Understanding game loop, time and ticks | Screeps Documentation































































Screeps is a real-time game. The game time is essentially a number of game "ticks" (or turns, cycles) that have passed since the start of the game servers. The number of the current tick is stored in the `Game.time` property. It is a global counter that increases during the entire game lifespan.
Generally, ticks run in an infinite loop of your `main` module. It is important to understand that this loop is turn- and multiplayer-based: the next tick (next `Game.time` value) begins only after the full execution of all `main` modules of all players.
We will now analyze the tick execution mechanism with conditional dividing it into beginning, middle, and end stages.

In the **beginning of the tick, **there is a certain game situation: different game objects with some property values. Take note that any changes in these properties, appearing of new objects, and dismantling of old ones will happen only at the start of the next tick.
In the **middle part of the tick,** the `main` module is executed (along with the modules required from it). The `main` operates the unchangeable game condition in the beginning of the tick. For example, by executing `creep.move()` and then (in the same tick) `creep.attack()` the attack still runs from the old coordinates, since properties `creep.pos.x` / `creep.pos.y` will change only in the next tick.
In the **end of the tick, **the commands specified in the `main` accumulate in order to change the game situation by the beginning of the next tick instantaneously and independently from each other. If any conflicts arise – for example, multiple creeps want to move to the same coordinates, or you have scheduled contradictory orders – these conflicts are solved according to [predefined priorities](/simultaneous-actions.html). Another example: a mutual attack does not result in a conflict, and creeps can die at the same time.

## [](#Additional-information)Additional information[](#Additional-information)
- Physically, resource intensity of the `main` execution is limited by the available CPU (see [`Game.cpuLimit`](/api/#Game.cpuLimit)) .
- The amount of CPU actually used in the current tick is shown by [`Game.getUsedCpu`](/api/#Game.getUsedCpu).
- The correlation between the game tick counter ([`Game.time`](/api/#Game.time)) and real time depends on overall capacity of servers affected.
- All runtime global scope with all the variables between ticks is erased. See more in [this article](/global-objects.html).
- A console command is governed by the same rules: execution is made within one tick as though it is added to the end of `main`.

## [](#See-also)See also[](#See-also)
- [How does CPU limit work](/cpu-limit.html)
- [Server-side architecture overview](/architecture.html)








**Contents**
1. [Additional information](#Additional-information)
2. [See also](#See-also)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
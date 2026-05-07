Simultaneous execution of creep actions | Screeps Documentation































































The exact methods available to a creep are determined by its parts. You may opt to create an all-in-one creep out of all existing parts, but you won't be able to execute all methods simultaneously. Here are the dependencies:

If you try to execute all the dependent methods within one tick, **only the most right one will be executed**. Each attempt means a correct execution returning the `OK` result. For example:

```js
// tick 1
creep.build(constructionSite); // ERR_NOT_ENOUGH_ENERGY
creep.harvest(source); // OK – executed, creep gained energy
// tick 2
creep.build(constructionSite); // OK – executed
creep.harvest(source); // OK, but execution failed since it was blocked by build
```
However, you may execute multiple methods by combining methods from different pipelines (including those which are not involved in any dependency above). For example:

```js
creep.moveTo(target);
creep.rangedMassAttack();
creep.heal(target);
creep.transfer(target, RESOURCE_ENERGY, amountTransfer);
creep.drop(amountDrop, RESOURCE_ENERGY);
creep.pickup(energy);
creep.claimController(controller);
```
All these methods may be successfully executed within one tick.
Combining methods with energy usage may have two possible results:
- with enough energy for executing all scheduled operations, all of them will be executed,
- othwerwise, the conflict will arise and only the most right one will be executed.

## [](#Methods-call-priority)Methods call priority[](#Methods-call-priority)
The sequence of calling commands for different methods in the code is irrelevant, only the aforementioned priorities matter. But if the same method is specified, the last call has the priority. For example:

```js
creep.moveTo(target); // will be ignored
creep.move(RIGHT); // will be ignored
creep.move(LEFT); // will be executed
```
The creep will move to the left in this tick.

## [](#Additionally)Additionally[](#Additionally)
1. Though healing healthy creeps and repairing undamaged building may be senseless, it returns `OK` and blocks more left methods in its pipeline.
2. While `transfer` may work along with `drop`, you cannot execute `transfer` two and more times per tick (to transfer energy to multiple objects). The same is true for all similar methods.
3. Simultaneously executed methods using `CARRY` body part don't affect each other. Each of them has the amount of energy available in the beginning of the tick. See more about this in [Understanding game loop, time and ticks](/game-loop.html).








**Contents**
1. [Methods call priority](#Methods-call-priority)
2. [Additionally](#Additionally)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
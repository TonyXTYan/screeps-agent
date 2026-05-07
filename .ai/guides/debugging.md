Debugging | Screeps Documentation































































There is a standard `console.log()` method as everywhere in Javascript world.

```js
for(var i in Game.creeps) {
console.log(Game.creeps[i]);
}
```
Each action command returns code `OK` if the execution was successful and one of the `ERR_*` codes in case of error.

```js
var result = creep.attack(target);
if(result != OK) {
console.log(creep + ' failed to attack the target ' + target +
' with the code: ' + result);
}
```
Note that a seemingly successful command may not always be executed (for example, your creep faces an obstacle it did not know about when the script started).
In order to safely test your scripts in a parallel copy of the world, you can use our [Public Test Realm](/ptr.html) server.

## [](#Debugging-in-the-web-version)Debugging in the web version[](#Debugging-in-the-web-version)
When playing using the web version of the game, all the console output is being forwarded to the browser console. When you are in the Simulation mode and your script is executed in your browser, that allows you to expand the objects, see and traverse their properties, etc.
Also, in Chrome browser you can use `debugger` JavaScript keyword to put a breakpoint in the Simulation mode which allows you to pause your script execution for debugging:

```js
var result = creep.attack(target);
if(result != OK) {
debugger;
}
```

## [](#Memory-inspector)Memory inspector[](#Memory-inspector)
If you want to track some values in real-time, write them into Memory and add the corresponding watches in the Memory inspector panel. They will be updated automatically each tick.








**Contents**
1. [Debugging in the web version](#Debugging-in-the-web-version)
2. [Memory inspector](#Memory-inspector)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
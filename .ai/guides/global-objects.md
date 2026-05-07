Global Objects | Screeps Documentation
































































## [](#Game-object)`Game` object[](#Game-object)
You operate the game through the global [`Game`](/api/#Game) object which is described in detail in the [API Reference](/api/) section. This object lets you access the complete list of your creeps, "review" rooms, pass commands, etc.

```js
var target = Game.spawns.Spawn1;
for(var i in Game.creeps) {
Game.creeps[i].moveTo(target);
}
```
No changes in the `Game` object are passed from tick to tick. Even if you manually change any properties of the object, it will not affect the game state. Changing properties and giving commands are possible only through special methods of game objects.
The `Game` object is created from scratch and filled with data at each tick. In order to memorize information between game ticks, you can use the Memory object. See the next article for more about it.

## [](#Memory-object)`Memory` object[](#Memory-object)
Each player has access to the global object `Memory` in which he/she may store any information in the JSON format. All the changes written in it are automatically stored using `JSON.stringify` and passed from tick to tick, allowing you memorize the setting, your own decisions, and temporary data.

```js
Memory.someData = {...};
```
The amount of memory available to a player is limited to **2 MB**.
For your convenience, some game objects are linked to the global `Memory` object and store their own keys in it. For example, you may address the memory of an individual creep with the help of its `memory` property:

```js
Game.creeps.John.memory = {...};
```
Actually, this property is an alias for a corresponding key in the global `Memory` object:

```js
Game.creeps.John.memory.role = 'harvester';
console.log(Memory.creeps.John.role); // -> 'harvester'
```
Information is stored and recorded via the `Memory` object, but game objects just allow quick access to some corresponding keys. You can use the memory addressing method which is more convenient for you.

### [](#Storing-game-objects-in-memory)Storing game objects in memory[](#Storing-game-objects-in-memory)
You should not store functions or full game objects as is in `Memory`. The `Memory` object is for storing JSON data and cannot contain live objects references. Their data will not be relevant. Moreover, it will waste your memory which is limited.

```js
// This is an incorrect example!
var source = creep.pos.findClosestByRange(FIND_SOURCES);
creep.memory.source = source;
// ...
creep.moveTo(creep.memory.source); // ERR_INVALID_TARGET
```
Instead of storing live objects, it is better to store the `id` property that any game object has, and then use [`Game.getObjectById`](/api/#Game.getObjectById) to retrieve the game object by its `id`:

```js
// This is correct
var source = creep.pos.findClosestByRange(FIND_SOURCES);
creep.memory.sourceId = source.id;
// ...
var source = Game.getObjectById(creep.memory.sourceId);
creep.moveTo(source); // OK
```

### [](#Serialization)Serialization[](#Serialization)
The Memory object is stored in the stringified form and is parsed each time upon the first in the tick access from your script with the help of the `JSON.parse` method. The CPU cost of this method execution is counted as your script expense. If you wish, you may write your own stringifier/destringifier using the global variable [`RawMemory`](/api/#RawMemory). It stores the original memory representation as a string. In fact, the default work of the memory basically corresponds to the following code:

```js
Memory = JSON.parse(RawMemory.get()); //on the first access to Memory object
// ...your script
RawMemory.set(JSON.stringify(Memory));
```
You can implement your own algorithm using [`RawMemory`](/api/#RawMemory) getter/setter.








**Contents**
1. [Game object](#Game-object)
2. [Memory object](#Memory-object)[Storing game objects in memory](#Storing-game-objects-in-memory)
3. [Serialization](#Serialization)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)
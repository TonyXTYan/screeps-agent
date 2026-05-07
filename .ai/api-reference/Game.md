The main global game object containing all the game play information.

## Game.constructionSitesobject<string, [ConstructionSite](#ConstructionSite)>

A hash containing all your construction sites with their id as hash keys.

## Game.cpuobject

A global object containing information about your CPU usage and methods. See the [documentation](#Game-cpu) below.

## Game.creepsobject<string, [Creep](#Creep)>

```js
for(const i in Game.creeps) {
Game.creeps[i].moveTo(flag);
}
```
A hash containing all your creeps with creep names as hash keys.

## Game.flagsobject<string, [Flag](#Flag)>

```js
creep.moveTo(Game.flags.Flag1);
```
A hash containing all your flags with flag names as hash keys.

## Game.gclobject

Your [Global Control Level](/control.html#Global-Control-Level), an object with the following properties :
| parameter | type | description |
| --- | --- | --- |
| `level` | number | The current level. |
| `progress` | number | The current progress to the next level. |
| `progressTotal` | number | The progress required to reach the next level. |

## Game.gplobject

Your Global Power Level, an object with the following properties :
| parameter | type | description |
| --- | --- | --- |
| `level` | number | The current level. |
| `progress` | number | The current progress to the next level. |
| `progressTotal` | number | The progress required to reach the next level. |

## Game.mapobject

A global object representing world map. See the [documentation](#Game-map) below.

## Game.marketobject

A global object representing the in-game market. See the [documentation](#Game-market) below.

## Game.powerCreepsobject<string, [PowerCreep](#PowerCreep)>

```js
Game.powerCreeps['PC1'].moveTo(flag);
```
A hash containing all your power creeps with their names as hash keys. Even power creeps
not spawned in the world can be accessed here.

## Game.resourcesobject

An object with your global resources that are bound to the account, like pixels or cpu unlocks. Each object key is a resource constant, values are resources amounts.

## Game.roomsobject<string, [Room](#Room)>

A hash containing all the rooms available to you with room names as hash keys. A room is visible if you have a creep or an owned structure in it.

## Game.shardobject

A global object describing the world shard where your script is currently being executed in. See the [documentation](#Game-shard) below.

## Game.spawnsobject<string, [StructureSpawn](#StructureSpawn)>

```js
for(const i in Game.spawns) {
Game.spawns[i].createCreep(body);
}
```
A hash containing all your spawns with spawn names as hash keys.

## Game.structuresobject<string, [Structure](#Structure)>

A hash containing all your structures with structure id as hash keys.

## Game.timenumber

```js
console.log(Game.time);
```
System game tick counter. It is automatically incremented on every tick. [Learn more](/game-loop.html)

## Game.getObjectById(id)



```js
creep.memory.sourceId = creep.pos.findClosestByRange(FIND_SOURCES).id;
const source = Game.getObjectById(creep.memory.sourceId);
```
Get an object with the specified unique ID. It may be a game object of any type. Only objects from the rooms which are visible to you can be accessed.
| parameter | type | description |
| --- | --- | --- |
| `id` | string | The unique identificator. |

### [](#Return-value)Return value
Returns an object instance or null if it cannot be found.

## Game.notify(message, [groupInterval])



```js
if(creep.hits  creep.memory.lastHits) {
Game.notify('Creep '+creep+' has been attacked at '+creep.pos+'!');
}
creep.memory.lastHits = creep.hits;
```

```js
if(Game.spawns['Spawn1'].energy == 0) {
Game.notify(
'Spawn1 is out of energy',
180  // group these notifications for 3 hours
);
}
```
Send a custom message at your profile email. This way, you can set up notifications to yourself on any occasion within the game. You can schedule up to 20 notifications during one game tick. Not available in the Simulation Room.
| parameter | type | description |
| --- | --- | --- |
| `message` | string | Custom text which will be sent in the message. Maximum length is 1000 characters. |
| `groupInterval` | number | If set to 0 (default), the notification will be scheduled immediately. Otherwise, it will be grouped with other notifications and mailed out later using the specified time in minutes. |
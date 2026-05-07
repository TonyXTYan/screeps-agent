An object representing the room in which your units and structures are in.
It can be used to look around, find paths, etc. Every `RoomObject` in the room contains
its linked `Room` instance in the `room` property.

## controller[StructureController](#StructureController)

The Controller structure of this room, if present, otherwise undefined.

## energyAvailablenumber

Total amount of energy available in all spawns and extensions in the room.

## energyCapacityAvailablenumber

Total amount of `energyCapacity` of all spawns and extensions in the room.

## memoryany

```js
room.memory.stage = 2;
```
A shorthand to `Memory.rooms[room.name]`. You can use it for quick access the room’s specific memory data object. [Learn more about memory](/global-objects.html#Memory-object)

## namestring

The name of the room.

## storage[StructureStorage](#StructureStorage)

The Storage structure of this room, if present, otherwise undefined.

## terminal[StructureTerminal](#StructureTerminal)

The Terminal structure of this room, if present, otherwise undefined.

## visual[RoomVisual](#RoomVisual)

A [RoomVisual](#RoomVisual) object for this room. You can use this object to draw simple shapes (lines, circles, text labels) in the room.

## Room.serializePath(path)



```js
const path = spawn.pos.findPathTo(source);
Memory.path = Room.serializePath(path);
creep.moveByPath(Memory.path);
```
Serialize a path array into a short string representation, which is suitable to store in memory.
| parameter | type | description |
| --- | --- | --- |
| `path` | array | A path array retrieved from `[Room.findPath](#Room.findPath)`. |

### [](#Return-value)Return value
A serialized string form of the given path.

## Room.deserializePath(path)



```js
const path = Room.deserializePath(Memory.path);
creep.moveByPath(path);
```
Deserialize a short string path representation into an array form.
| parameter | type | description |
| --- | --- | --- |
| `path` | string | A serialized path string. |

### [](#Return-value-1)Return value
A path array.

## createConstructionSite(x, y, structureType, [name])
(pos, structureType, [name])



```js
Game.rooms.sim.createConstructionSite(10, 15, STRUCTURE_ROAD);
```

```js
Game.rooms.sim.createConstructionSite(10, 15, STRUCTURE_SPAWN,
'MySpawn2');
```
Create new [ConstructionSite](#ConstructionSite) at the specified location.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X position. |
| `y` | number | The Y position. |
| `pos` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |
| `structureType` | string | One of the `STRUCTURE_*` constants. |
| `name`
*optional* | string | The name of the structure, for structures that support it (currently only spawns). The name length limit is 100 characters. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | The room is claimed or reserved by a hostile player. |
| `ERR_INVALID_TARGET` | -7 | The structure cannot be placed at the specified location. |
| `ERR_FULL` | -8 | You have too many construction sites. The maximum number of construction sites per player is 100. |
| `ERR_INVALID_ARGS` | -10 | The location is incorrect. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient. [Learn more](/control.html) |

## createFlag(x, y, [name], [color], [secondaryColor])
(pos, [name], [color], [secondaryColor])



```js
Game.rooms.sim.createFlag(5, 12, 'Flag1');
```
Create new [Flag](#Flag) at the specified location.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X position. |
| `y` | number | The Y position. |
| `pos` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |
| `name`
*optional* | string | The name of a new flag. It should be unique, i.e. the `Game.flags` object should not contain another flag with the same name (hash key). If not defined, a random name will be generated. The maximum length is 100 characters. |
| `color`
*optional* | number | The color of a new flag. Should be one of the `COLOR_*` constants. The default value is `COLOR_WHITE`. |
| `secondaryColor`
*optional* | string | The secondary color of a new flag. Should be one of the `COLOR_*` constants. The default value is equal to `color`. |

### [](#Return-value-3)Return value
The name of a new flag, or one of the following error codes:
| constant | value | description |
| --- | --- | --- |
| `ERR_NAME_EXISTS` | -3 | There is a flag with the same name already. |
| `ERR_FULL` | -8 | You have too many flags. The maximum number of flags per player is 10000. |
| `ERR_INVALID_ARGS` | -10 | The location or the name or the color constant is incorrect. |

## find(type, [opts])



```js
const targets = creep.room.find(FIND_DROPPED_RESOURCES);
if(targets.length) {
creep.moveTo(targets[0]);
creep.pickup(targets[0]);
}
```

```js
const extensions = Game.spawns['Spawn1'].room.find(FIND_MY_STRUCTURES, {
filter: { structureType: STRUCTURE_EXTENSION }
});
console.log('Spawn has '+extensions.length+' extensions available');
```

```js
const targets = creep.room.find(FIND_HOSTILE_CREEPS, {
filter: function(object) {
return object.getActiveBodyparts(ATTACK) == 0;
}
});
```
Find all objects of the specified type in the room. Results are cached automatically for the specified room and type before applying any custom filters. This automatic cache lasts until the end of the tick.
| parameter | type | description |
| --- | --- | --- |
| `type` | number | One of the `FIND_*` constants. |
| `opts`
*optional* | object | An object with additional options:                     - filter                             object, function, string                             The result list will be filtered using the [Lodash.filter](https://lodash.com/docs#filter) method.
|

### [](#Return-value-4)Return value
An array with the objects found.
| constant | type | description |
| --- | --- | --- |
| `FIND_EXIT_TOP` | RoomPosition | Only exit positions located at the top of the room. |
| `FIND_EXIT_RIGHT` | RoomPosition | Only exit positions located on the right side of the room. |
| `FIND_EXIT_BOTTOM` | RoomPosition | Only exit positions located at the bottom of the room. |
| `FIND_EXIT_LEFT` | RoomPosition | Only exit positions located on the left side of the room. |
| `FIND_EXIT` | RoomPosition | All exit positions. |
| `FIND_CREEPS` | Creep | All creeps. |
| `FIND_MY_CREEPS` | Creep | Only creeps owned by you. |
| `FIND_HOSTILE_CREEPS` | Creep | Only creeps not owned by you. |
| `FIND_POWER_CREEPS` | PowerCreep | All power creeps. |
| `FIND_MY_POWER_CREEPS` | PowerCreep | Only power creeps owned by you. |
| `FIND_HOSTILE_POWER_CREEPS` | PowerCreep | Only power creeps not owned by you. |
| `FIND_SOURCES_ACTIVE` | Source | Only sources that have energy. |
| `FIND_SOURCES` | Source | All sources. |
| `FIND_DROPPED_RESOURCES` | Resource | All dropped resources. |
| `FIND_STRUCTURES` | Structure | All structures. |
| `FIND_MY_STRUCTURES` | Structure | Only structures owned by you. Does not include neutral structures. |
| `FIND_HOSTILE_STRUCTURES` | Structure | Only structures not owned by you. Does not include neutral structures. |
| `FIND_FLAGS` | Flag | All flags |
| `FIND_MY_SPAWNS` | StructureSpawn | Only spawns owned by you. |
| `FIND_HOSTILE_SPAWNS` | StructureSpawn | Spawns not owned by you. |
| `FIND_CONSTRUCTION_SITES` | ConstructionSite | All construction sites. |
| `FIND_MY_CONSTRUCTION_SITES` | ConstructionSite | Only construction sites owned by you. |
| `FIND_HOSTILE_CONSTRUCTION_SITES` | ConstructionSite | Only construction sites not owned by you. |
| `FIND_MINERALS` | Mineral | All mineral deposits. |
| `FIND_NUKES` | Nuke | All launched nukes. |
| `FIND_TOMBSTONES` | Tombstone | All tombstones. |
| `FIND_RUINS` | Ruin | All ruins |

## findExitTo(room)



```js
const exitDir = creep.room.findExitTo(anotherCreep.room);
const exit = creep.pos.findClosestByRange(exitDir);
creep.moveTo(exit);

// or simply:
creep.moveTo(anotherCreep);
creep.moveTo(new RoomPosition(25,25, anotherCreep.pos.roomName));
```
Find the exit direction en route to another room. Please note that this method is not required for inter-room movement, you can simply pass the target in another room into [`Creep.moveTo`](#Creep.moveTo) method.
| parameter | type | description |
| --- | --- | --- |
| `room` | string, [Room](#Room) | Another room name or room object. |

### [](#Return-value-5)Return value
The room direction constant, one of the following:
- `FIND_EXIT_TOP`
- `FIND_EXIT_RIGHT`
- `FIND_EXIT_BOTTOM`
- `FIND_EXIT_LEFT`

Or one of the following error codes:
| constant | value | description |
| --- | --- | --- |
| `ERR_NO_PATH` | -2 | Path can not be found. |
| `ERR_INVALID_ARGS` | -10 | The location is incorrect. |

## findPath(fromPos, toPos, [opts])



```js
const path = creep.room.findPath(creep.pos, targetPos);
creep.move(path[0].direction);
```

```js
PathFinder.use(true);
const path = creep.room.findPath(creep.pos, targetPos, {
costCallback: function(roomName, costMatrix) {
if(roomName == 'W1N5') {
// set anotherCreep's location as walkable
costMatrix.set(anotherCreep.pos.x, anotherCreep.pos.y, 0);
// set flag location as an obstacle
costMatrix.set(flag.pos.x, flag.pos.y, 255);
// increase cost for (25,20) location to 50
costMatrix.set(25, 20, 50);
}
}
});
```

```js
let path = creep.room.findPath(creep.pos, targetPos, {maxOps: 200});
if( !path.length || !targetPos.isEqualTo(path[path.length - 1]) ) {
path = creep.room.findPath(creep.pos, targetPos, {
maxOps: 1000, ignoreDestructibleStructures: true
});
}
if( path.length ) {
creep.move(path[0].direction);
}
```
Find an optimal path inside the room between fromPos and toPos using [Jump Point Search algorithm](http://en.wikipedia.org/wiki/Jump_point_search).
| parameter | type | description |
| --- | --- | --- |
| `fromPos` | [RoomPosition](#RoomPosition) | The start position. |
| `toPos` | [RoomPosition](#RoomPosition) | The end position. |
| `opts`
*optional* | object | An object containing additonal pathfinding flags: - ignoreCreeps         boolean         Treat squares with creeps as walkable. Can be useful with too many moving creeps around or in some other cases. The default value is false.
- ignoreDestructibleStructures         boolean         Treat squares with destructible structures (constructed walls, ramparts, spawns, extensions) as walkable. The default value is false.
- ignoreRoads         boolean         Ignore road structures. Enabling this option can speed up the search. The default value is false. This is only used when the new [`PathFinder`](#PathFinder) is enabled.
- costCallback         function(string, CostMatrix)         You can use this callback to modify a [`CostMatrix`](#PathFinder-CostMatrix) for any room during the search. The callback accepts two arguments, `roomName` and `costMatrix`. Use the `costMatrix` instance to make changes to the positions costs. If you return a new matrix from this callback, it will be used instead of the built-in cached one. This option is only used when the new [`PathFinder`](#PathFinder) is enabled.
- ignore         array         An array of the room's objects or [RoomPosition](#RoomPosition) objects which should be treated as walkable tiles during the search. This option cannot be used when the new [`PathFinder`](#PathFinder) is enabled (use `costCallback` option instead).
- avoid         array         An array of the room's objects or [RoomPosition](#RoomPosition) objects which should be treated as obstacles during the search. This option cannot be used when the new [`PathFinder`](#PathFinder) is enabled (use `costCallback` option instead).
- maxOps         number         The maximum limit of possible pathfinding operations. You can limit CPU time used for the search based on ratio 1 op ~ 0.001 CPU. The default value is 2000.
- heuristicWeight         number         Weight to apply to the heuristic in the A* formula `F = G + weight `* H. Use this option only if you understand the underlying A* algorithm mechanics! The default value is 1.2.
- serialize         boolean         If true, the result path will be serialized using `[Room.serializePath](#Room.serializePath)`. The default is false.
- maxRooms         number         The maximum allowed rooms to search. The default (and maximum) is 16. This is only used when the new [`PathFinder`](#PathFinder) is enabled.
- range         number         Find a path to a position in specified linear range of target. The default is 0.
- plainCost         number         Cost for walking on plain positions. The default is 1.
- swampCost         number         Cost for walking on swamp positions. The default is 5.
|

### [](#Return-value-6)Return value
An array with path steps in the following format:

```js
[
{ x: 10, y: 5, dx: 1,  dy: 0, direction: RIGHT },
{ x: 10, y: 6, dx: 0,  dy: 1, direction: BOTTOM },
{ x: 9,  y: 7, dx: -1, dy: 1, direction: BOTTOM_LEFT },
...
]
```

## getEventLog([raw])



```js
// track events performed by a particular creep
_.filter(creep.room.getEventLog(), {objectId: creep.id});
```

```js
// Find all hostile actions against your creeps and structures
_.forEach(Game.rooms, room => {
let eventLog = room.getEventLog();
let attackEvents = _.filter(eventLog, {event: EVENT_ATTACK});
attackEvents.forEach(event => {
let target = Game.getObjectById(event.data.targetId);
if(target && target.my) {
console.log(event);
}
});
});
```
Returns an array of events happened on the previous tick in this room.
| parameter | type | description |
| --- | --- | --- |
| `raw`
*optional* | boolean | If this parameter is false or undefined, the method returns an object parsed using `JSON.parse` which incurs some CPU cost on the first access (the return value is cached on subsequent calls). If `raw` is truthy, then raw JSON in string format is returned. |

### [](#Return-value-7)Return value
An array of events. Each event represents some game action in the following format:

```js
{
event: EVENT_ATTACK,
objectId: '54bff72ab32a10f73a57d017',
data: { /* ... */ }
}
```
The `data` property is different for each event type according to the following table:
| event | description |
| --- | --- |
| `EVENT_ATTACK` | A creep or a structure performed an attack to another object.             - `targetId` - the target object ID
- `damage` - the amount of hits damaged
- `attackType` - one of the following constants:                                              `EVENT_ATTACK_TYPE_MELEE` - a creep attacked with [attack](#Creep.attack)
- `EVENT_ATTACK_TYPE_RANGED` - a creep attacked with [rangedAttack](#Creep.rangedAttack), or a tower attacked with [attack](#StructureTower.attack)
- `EVENT_ATTACK_TYPE_RANGED_MASS` - a creep attacked with [rangedMassAttack](#Creep.rangedMassAttack)
- `EVENT_ATTACK_TYPE_DISMANTLE` - a creep attacked with [dismantle](#Creep.dismantle)
- `EVENT_ATTACK_TYPE_HIT_BACK` - a creep hit back on another creep's [attack](#Creep.attack)
- `EVENT_ATTACK_TYPE_NUKE` - a nuke landed
|
| `EVENT_OBJECT_DESTROYED` | A game object is destroyed or killed.             - `type` - the type of the destroyed object
|
| `EVENT_ATTACK_CONTROLLER` | A creep performed [`attackController`](#Creep.attackController) in the room. |
| `EVENT_BUILD` | A creep performed [`build`](#Creep.build) in the room.             - `targetId` - the target object ID
- `amount` - the amount of build progress gained
- `structureType` - one of the STRUCTURE_* constants*
- `x` - the X position of the target construction site
- `y` - the Y position of the target construction site
- `incomplete` - status of build progress
|
| `EVENT_HARVEST` | A creep performed [`harvest`](#Creep.harvest) in the room.             - `targetId` - the target object ID
- `amount` - the amount of resource harvested
|
| `EVENT_HEAL` | A creep or a tower healed a creep.             - `targetId` - the target object ID
- `amount` - the amount of hits healed
- `healType` - one of the following constants:                                              `EVENT_HEAL_TYPE_MELEE` - a creep healed with [heal](#Creep.heal)
- `EVENT_HEAL_TYPE_RANGED` - a creep healed with [rangedHeal](#Creep.rangedHeal), or a tower healed with [heal](#StructureTower.heal)
|
| `EVENT_REPAIR` | A creep or a tower repaired a structure.             - `targetId` - the target object ID
- `amount` - the amount of hits repaired
- `energySpent` - the energy amount spent on the operation
|
| `EVENT_RESERVE_CONTROLLER` | A creep performed [`reserveController`](#Creep.reserveController) in the room.             - `amount` - the amount of reservation time gained
|
| `EVENT_UPGRADE_CONTROLLER` | A creep performed [`upgradeController`](#Creep.upgradeController) in the room.             - `amount` - the amount of control points gained
- `energySpent` - the energy amount spent on the operation
|
| `EVENT_EXIT` | A creep moved to another room.             - `room` - the name of the target room
- `x`, `y` - the coordinates in another room where the creep has appeared
|
| `EVENT_TRANSFER` | A link performed [`transferEnergy`](https://docs.screeps.com/api/#StructureLink.transferEnergy) or a creep performed [`transfer`](#Creep.transfer) or [`withdraw`](#Creep.withdraw).             - `targetId` - the target object ID
- `resourceType` - the type of resource transferred
- `amount` - the amount of resource transferred
|
| `EVENT_POWER` | Apply one the creep's powers on the specified target.             - `targetId` - the target object ID
- `power` - the power ability to use, one of the PWR_ constants
|

## getPositionAt(x, y)



```js
const pos = Game.rooms.sim.getPositionAt(5,12);
const source = pos.findClosestByRange(FIND_SOURCES_ACTIVE);
```
Creates a [RoomPosition](#RoomPosition) object at the specified location.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X position. |
| `y` | number | The Y position. |

### [](#Return-value-8)Return value
A
[RoomPosition](#RoomPosition)
object or null if it cannot be obtained.

## getTerrain()



```js
const terrain = Game.rooms['W1N1'].getTerrain();
switch(terrain.get(10,15)) {
case TERRAIN_MASK_WALL:
break;
case TERRAIN_MASK_SWAMP:
break;
case 0:
break;
}
```
Get a [`Room.Terrain`](#Room-Terrain) object which provides fast access to static terrain data. This method works for any room in the world even if you have no access to it.

### [](#Return-value-9)Return value
Returns new [`Room.Terrain`](#Room-Terrain) object.

## lookAt(x, y)
(target)



```js
const look = creep.room.lookAt(target);
look.forEach(function(lookObject) {
if(lookObject.type == LOOK_CREEPS &&
lookObject[LOOK_CREEPS].getActiveBodyparts(ATTACK) == 0) {
creep.moveTo(lookObject.creep);
}
});
```
Get the list of objects at the specified room position.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-10)Return value
An array with objects at the specified position in the following format:

```js
[
{ type: 'creep', creep: {...} },
{ type: 'structure', structure: {...} },
...
{ type: 'terrain', terrain: 'swamp' }
]
```

## lookAtArea(top, left, bottom, right, [asArray])



```js
const look = creep.room.lookAtArea(10,5,11,7);
```
Get the list of objects at the specified room area.
| parameter | type | description |
| --- | --- | --- |
| `top` | number | The top Y boundary of the area. |
| `left` | number | The left X boundary of the area. |
| `bottom` | number | The bottom Y boundary of the area. |
| `right` | number | The right X boundary of the area. |
| `asArray`
*optional* | boolean | Set to true if you want to get the result as a plain array. |

### [](#Return-value-11)Return value
If `asArray` is set to false or undefined, the method returns
an object with all the objects in the specified area in the following format:

```js
// 10,5,11,7

{
10: {
5: [{ type: 'creep', creep: {...} },
{ type: 'terrain', terrain: 'swamp' }],
6: [{ type: 'terrain', terrain: 'swamp' }],
7: [{ type: 'terrain', terrain: 'swamp' }]
},
11: {
5: [{ type: 'terrain', terrain: 'plain' }],
6: [{ type: 'structure', structure: {...} },
{ type: 'terrain', terrain: 'swamp' }],
7: [{ type: 'terrain', terrain: 'wall' }]
}
}
```
If `asArray` is set to true, the method returns an array in the following format:

```js
[
{x: 5, y: 10, type: 'creep', creep: {...}},
{x: 5, y: 10, type: 'terrain', terrain: 'swamp'},
{x: 6, y: 10, type: 'terrain', terrain: 'swamp'},
{x: 7, y: 10, type: 'terrain', terrain: 'swamp'},
{x: 5, y: 11, type: 'terrain', terrain: 'plain'},
{x: 6, y: 11, type: 'structure', structure: {...}},
{x: 6, y: 11, type: 'terrain', terrain: 'swamp'},
{x: 7, y: 11, type: 'terrain', terrain: 'wall'}
]
```

## lookForAt(type, x, y)
(type, target)



```js
const found = creep.room.lookForAt(LOOK_CREEPS, target);
if(found.length && found[0].getActiveBodyparts(ATTACK) == 0) {
creep.moveTo(found[0]);
}
```
Get an object with the given type at the specified room position.
| parameter | type | description |
| --- | --- | --- |
| `type` | string | One of the `LOOK_*` constants. |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-12)Return value
An array of objects of the given type at the specified position if found.

## lookForAtArea(type, top, left, bottom, right, [asArray])



```js
const look = creep.room.lookForAtArea(LOOK_STRUCTURES,10,5,11,7);
```
Get the list of objects with the given type at the specified room area.
| parameter | type | description |
| --- | --- | --- |
| `type` | string | One of the `LOOK_*` constants. |
| `top` | number | The top Y boundary of the area. |
| `left` | number | The left X boundary of the area. |
| `bottom` | number | The bottom Y boundary of the area. |
| `right` | number | The right X boundary of the area. |
| `asArray`
*optional* | boolean | Set to true if you want to get the result as a plain array. |

### [](#Return-value-13)Return value
If `asArray` is set to false or undefined, the method returns an object
with all the objects of the given type in the specified area in the following format:

```js
// 10,5,11,7

{
10: {
5: [{...}],
6: undefined,
7: undefined
},
11: {
5: undefined,
6: [{...}, {...}],
7: undefined
}
}
```
If `asArray` is set to true, the method returns an array in the following format:

```js
[
{x: 5, y: 10, structure: {...}},
{x: 6, y: 11, structure: {...}},
{x: 6, y: 11, structure: {...}}
]
```
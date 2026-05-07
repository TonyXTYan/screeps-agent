An object representing the specified position in the room. Every `RoomObject` in the room
contains `RoomPosition` as the `pos` property. The position object of a custom location
can be obtained using the [`Room.getPositionAt`](#Room.getPositionAt) method or using the constructor.

## constructor(x, y, roomName)



```js
const pos = new RoomPosition(10, 25, 'sim');
```
You can create new `RoomPosition` object using its constructor.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `roomName` | string | The room name. |

## roomNamestring

The name of the room.

## xnumber

X position in the room.

## ynumber

Y position in the room.

## createConstructionSite(structureType, [name])



```js
Game.flags['Flag1'].pos.createConstructionSite(STRUCTURE_ROAD);
```

```js
Game.flags['Flag1'].pos.createConstructionSite(STRUCTURE_SPAWN, 'MySpawn2');
```
Create new [ConstructionSite](#ConstructionSite) at the specified location.
| parameter | type | description |
| --- | --- | --- |
| `structureType` | string | One of the `STRUCTURE_*` constants. |
| `name`
*optional* | string | The name of the structure, for structures that support it (currently only spawns). |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_INVALID_TARGET` | -7 | The structure cannot be placed at the specified location. |
| `ERR_FULL` | -8 | You have too many construction sites. The maximum number of construction sites per player is 100. |
| `ERR_INVALID_ARGS` | -10 | The location is incorrect. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient. [Learn more](/control.html) |

## createFlag([name], [color], [secondaryColor])



```js
creep.pos.createFlag('Flag1');
```
Create new [Flag](#Flag) at the specified location.
| parameter | type | description |
| --- | --- | --- |
| `name`
*optional* | string | The name of a new flag. It should be unique, i.e. the `Game.flags` object should not contain another flag with the same name (hash key). If not defined, a random name will be generated. |
| `color`
*optional* | string | The color of a new flag. Should be one of the `COLOR_*` constants. The default value is `COLOR_WHITE`. |
| `secondaryColor`
*optional* | string | The secondary color of a new flag. Should be one of the `COLOR_*` constants. The default value is equal to `color`. |

### [](#Return-value-1)Return value
The name of a new flag, or one of the following error codes:

| constant | value | description |
| --- | --- | --- |
| `ERR_NAME_EXISTS` | -3 | There is a flag with the same name already. |
| `ERR_INVALID_ARGS` | -10 | The location or the color constant is incorrect. |

## findClosestByPath(type, [opts])
(objects, [opts])



```js
const target = creep.pos.findClosestByPath(FIND_MY_SPAWNS);
creep.moveTo(target);
```

```js
const target = creep.pos.findClosestByPath(FIND_MY_SPAWNS, {maxOps: 500});
creep.moveTo(target);
```

```js
const target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
filter: function(object) {
return object.getActiveBodyparts(ATTACK) == 0;
}
});
```

```js
const target = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {
filter: { owner: { username: 'Invader' } }
});
```

```js
const targets = [
Game.creeps.John,
Game.creeps.Mike,
room.getPositionAt(10,10)
];
const closest = creep.pos.findClosestByPath(targets);
```
Find an object with the shortest path from the given position. Uses [Jump Point Search algorithm](http://en.wikipedia.org/wiki/Jump_point_search) and [Dijkstra's algorithm](http://en.wikipedia.org/wiki/Dijkstra).
| parameter | type | description |
| --- | --- | --- |
| `type` | number | See [Room.find](#Room.find). |
| `objects` | array | An array of room's objects or [RoomPosition](#RoomPosition) objects that the search should be executed against. |
| `opts`
*optional* | object | An object containing pathfinding options (see [Room.findPath](#Room.findPath)), or one of the following:                     - filter                             object, function, string                             Only the objects which pass the filter using the [Lodash.filter](https://lodash.com/docs#filter) method will be used.
- algorithm                             string                             One of the following constants:                                                                      `astar` is faster when there are relatively few possible targets;
- `dijkstra` is faster when there are a lot of possible targets or when the closest target is nearby.
The default value is determined automatically using heuristics.                                               |

### [](#Return-value-2)Return value
The closest object if found, null otherwise.

## findClosestByRange(type, [opts])
(objects, [opts])



```js
const target = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
creep.moveTo(target);
```

```js
const target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
filter: function(object) {
return object.getActiveBodyparts(ATTACK) == 0;
}
});
```

```js
const target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
filter: { owner: { username: 'Invader' } }
});
```

```js
const targets = [
Game.creeps.John,
Game.creeps.Mike,
room.getPositionAt(10,10)
];
const closest = creep.pos.findClosestByRange(targets);
```
Find an object with the shortest linear distance from the given position.
| parameter | type | description |
| --- | --- | --- |
| `type` | number | See [Room.find](#Room.find). |
| `objects` | array | An array of room's objects or [RoomPosition](#RoomPosition) objects that the search should be executed against. |
| `opts`
*optional* | object | An object containing one of the following options:                     - filter                             object, function, string                             Only the objects which pass the filter using the [Lodash.filter](https://lodash.com/docs#filter) method will be used.
|

### [](#Return-value-3)Return value
The closest object if found, null otherwise.

## findInRange(type, range, [opts])
(objects, range, [opts])



```js
const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
if(targets.length > 0) {
creep.rangedAttack(targets[0]);
}
```

```js
const targets = [
Game.creeps.John,
Game.creeps.Mike,
room.getPositionAt(10,10)
];
const inRangeTargets = creep.pos.findInRange(targets, 3);
```
Find all objects in the specified linear range.
| parameter | type | description |
| --- | --- | --- |
| `type` | number | See [Room.find](#Room.find). |
| `objects` | array | An array of room's objects or [RoomPosition](#RoomPosition) objects that the search should be executed against. |
| `range` | number | The range distance. |
| `opts`
*optional* | object | See [Room.find](#Room.find). |

### [](#Return-value-4)Return value
An array with the objects found.

## findPathTo(x, y, [opts])
(target, [opts])



```js
const path = creep.pos.findPathTo(target);
creep.move(path[0].direction);
```

```js
let path = creep.pos.findPathTo(target, {maxOps: 200});
if( !path.length || !target.equalsTo(path[path.length - 1]) ) {
path = creep.pos.findPathTo(target,
{maxOps: 1000, ignoreDestructibleStructures: true});
}
if( path.length ) {
creep.move(path[0].direction);
}
```
Find an optimal path to the specified position using [Jump Point Search algorithm](http://en.wikipedia.org/wiki/Jump_point_search). This method is a shorthand for [Room.findPath](#Room.findPath). If the target is in another room, then the corresponding exit will be used as a target.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |
| `opts`
*optional* | object | An object containing pathfinding options flags (see [Room.findPath](#Room.findPath) for more details). |

### [](#Return-value-5)Return value
An array with path steps in the following format:

```js
[
{ x: 10, y: 5, dx: 1,  dy: 0, direction: RIGHT },
{ x: 10, y: 6, dx: 0,  dy: 1, direction: BOTTOM },
{ x: 9,  y: 7, dx: -1, dy: 1, direction: BOTTOM_LEFT },
...
]
```

## getDirectionTo(x,y)
(target)



```js
const direction = creep.pos.getDirectionTo(target);
creep.move(direction);
```
Get linear direction to the specified position.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-6)Return value
A number representing one of the direction constants.

## getRangeTo(x,y)
(target)



```js
const range = creep.pos.getRangeTo(target);
if(range  3) {
creep.rangedAttack(target);
}
```
Get linear range to the specified position.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-7)Return value
A number of squares to the given position.

## inRangeTo(x, y, range)
(target, range)



```js
if(creep.pos.inRangeTo(target, 3)) {
creep.rangedAttack(target);
}
```
Check whether this position is in the given range of another position.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the same room. |
| `y` | number | Y position in the same room. |
| `target` | [RoomPosition](#RoomPosition) | The target position. |
| `range` | number | The range distance. |

### [](#Return-value-8)Return value
A boolean value.

## isEqualTo(x,y)
(target)



```js
if(creep.pos.isEqualTo(10,25)) {
creep.move(RIGHT);
}
```

```js
if(creep.pos.isEqualTo(Game.flags.Flag1)) {
creep.move(RIGHT);
}
```
Check whether this position is the same as the specified position.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-9)Return value
A boolean value.

## isNearTo(x,y)
(target)



```js
if(creep.pos.isNearTo(target)) {
creep.transfer(target, RESOURCE_ENERGY);
}
```
Check whether this position is on the adjacent square to the specified position. The same as `inRangeTo(target, 1)`.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-10)Return value
A boolean value.

## look()



```js
const look = Game.flags.Flag1.pos.look();
look.forEach(function(lookObject) {
if(lookObject.type == LOOK_CREEPS &&
lookObject[LOOK_CREEPS].getActiveBodyparts(ATTACK) == 0) {
creep.moveTo(lookObject.creep);
}
});
```
Get the list of objects at the specified room position.

### [](#Return-value-11)Return value
An array with objects at the specified position in the following format:

```js
[
{ type: 'creep', creep: {...} },
{ type: 'structure', structure: {...} },
...
{ type: 'terrain', terrain: 'swamp' }
]
```

## lookFor(type)



```js
const found = Game.flags.Flag1.pos.lookFor(LOOK_CREEPS);
if(found.length && found[0].getActiveBodyparts(ATTACK) == 0) {
creep.moveTo(found[0]);
}
```
Get an object with the given type at the specified room position.
| parameter | type | description |
| --- | --- | --- |
| `type` | string | One of the `LOOK_*` constants. |

### [](#Return-value-12)Return value
An array of objects of the given type at the specified position if found.
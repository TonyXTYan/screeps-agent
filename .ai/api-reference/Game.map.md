A global object representing world map. Use it to navigate between rooms.

## Game.map.describeExits(roomName)



```js
const exits = Game.map.describeExits('W8N3');
```
List all exits available from the room with the given name.
| parameter | type | description |
| --- | --- | --- |
| `roomName` | string | The room name. |

### [](#Return-value)Return value
The exits information in the following format, or null if the room not found.

```js
{
"1": "W8N4",    // TOP
"3": "W7N3",    // RIGHT
"5": "W8N2",    // BOTTOM
"7": "W9N3"     // LEFT
}
```

## Game.map.findExit(fromRoom, toRoom, [opts])



```js
if(creep.room != anotherRoomName) {
const exitDir = Game.map.findExit(creep.room, anotherRoomName);
const exit = creep.pos.findClosestByRange(exitDir);
creep.moveTo(exit);
}
else {
// go to some place in another room
}
```

```js
creep.moveTo(new RoomPosition(25, 25, anotherRoomName));
```
Find the exit direction from the given room en route to another room.
| parameter | type | description |
| --- | --- | --- |
| `fromRoom` | string, [Room](#Room) | Start room name or room object. |
| `toRoom` | string, [Room](#Room) | Finish room name or room object. |
| `opts`
*optional* | object | An object with the pathfinding options. See `[findRoute](#Game.map.findRoute)`. |

### [](#Return-value-1)Return value
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

## Game.map.findRoute(fromRoom, toRoom, [opts])



```js
const route = Game.map.findRoute(creep.room, anotherRoomName);
if(route.length > 0) {
console.log('Now heading to room '+route[0].room);
const exit = creep.pos.findClosestByRange(route[0].exit);
creep.moveTo(exit);
}
```

```js
const route = Game.map.findRoute(creep.room, anotherRoomName, {
routeCallback(roomName, fromRoomName) {
if(roomName == 'W10S10') {    // avoid this room
return Infinity;
}
return 1;
}});
```

```js
let from = new RoomPosition(25, 25, 'E1N1');
let to = new RoomPosition(25, 25, 'E4N1');

// Use `findRoute` to calculate a high-level plan for this path,
// prioritizing highways and owned rooms
let allowedRooms = { [ from.roomName ]: true };
Game.map.findRoute(from.roomName, to.roomName, {
routeCallback(roomName) {
let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
let isHighway = (parsed[1] % 10 === 0) ||
(parsed[2] % 10 === 0);
let isMyRoom = Game.rooms[roomName] &&
Game.rooms[roomName].controller &&
Game.rooms[roomName].controller.my;
if (isHighway || isMyRoom) {
return 1;
} else {
return 2.5;
}
}
}).forEach(function(info) {
allowedRooms[info.room] = true;
});

// Invoke PathFinder, allowing access only to rooms from `findRoute`
let ret = PathFinder.search(from, to, {
roomCallback(roomName) {
if (allowedRooms[roomName] === undefined) {
return false;
}
}
});

console.log(ret.path);
```
Find route from the given room to another room.
| parameter | type | description |
| --- | --- | --- |
| `fromRoom` | string, [Room](#Room) |   Start room name or room object. |
| `toRoom` | string, [Room](#Room) | Finish room name or room object. |
| `opts`
*optional* | object | An object with the following options:                     - routeCallback                             function                             This callback accepts two arguments: `function(roomName, fromRoomName)`. It can be used to calculate the cost of entering that room. You can use this to do things like prioritize your own rooms, or avoid some rooms. You can return a floating point cost or `Infinity` to block the room.
|

### [](#Return-value-2)Return value
The route array in the following format:

```js
[
{ exit: FIND_EXIT_RIGHT, room: 'arena21' },
{ exit: FIND_EXIT_BOTTOM, room: 'arena22' },
...
]
```
Or one of the following error codes:
| constant | value | description |
| --- | --- | --- |
| `ERR_NO_PATH` | -2 | Path can not be found. |

## Game.map.getRoomLinearDistance(roomName1, roomName2, [continuous])



```js
Game.map.getRoomLinearDistance('W1N1', 'W4N2'); // 3
Game.map.getRoomLinearDistance('E65S55','W65S55', false) // 131
Game.map.getRoomLinearDistance('E65S55','W65S55', true) // 11
```
Get the linear distance (in rooms) between two rooms. You can use this function to estimate the energy cost of sending resources through terminals, or using observers and nukes.
| parameter | type | description |
| --- | --- | --- |
| `roomName1` | string | The name of the first room. |
| `roomName2` | string | The name of the second room. |
| `continuous`
*optional* | boolean | Whether to treat the world map continuous on borders. Set to true if you want to calculate the trade or terminal send cost. Default is false. |

### [](#Return-value-3)Return value
A number of rooms between the given two rooms.

## Game.map.getRoomTerrain(roomName)



```js
const terrain = Game.map.getRoomTerrain("E2S7");
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
| parameter | type | description |
| --- | --- | --- |
| `roomName` | string | The room name. |

### [](#Return-value-4)Return value
Returns new [`Room.Terrain`](#Room-Terrain) object.

## Game.map.getTerrainAt(x, y, roomName)
(pos)



This method is deprecated and will be removed soon. Please use a faster method [`Game.map.getRoomTerrain`](#Game.map.getRoomTerrain) instead.

```js
console.log(Game.map.getTerrainAt(25,20,'W10N10'));
```

```js
console.log(Game.map.getTerrainAt(new RoomPosition(25,20,'W10N10'));
```
Get terrain type at the specified room position. This method works for any room in the world even if you have no access to it.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `roomName` | string | The room name. |
| `pos` | [RoomPosition](#RoomPosition) | The position object. |

### [](#Return-value-5)Return value
One of the following string values:
- `plain`
- `swamp`
- `wall`

## Game.map.getWorldSize()



Returns the world size as a number of rooms between world corners. For example, for a world with rooms from W50N50
to E50S50 this method will return 102.

## Game.map.isRoomAvailable(roomName)



This method is deprecated and will be removed soon. Please use [`Game.map.getRoomStatus`](#Game.map.getRoomStatus) instead.

```js
if(Game.map.isRoomAvailable(room.name)) {
creep.moveTo(room.getPositionAt(25,25));
}
```
Check if the room is available to move into.
| parameter | type | description |
| --- | --- | --- |
| `roomName` | string | The room name. |

### [](#Return-value-6)Return value
A boolean value.

## Game.map.getRoomStatus(roomName)



```js
if(Game.map.getRoomStatus(room.name).status == 'normal') {
nuker.launchNuke(room.getPositionAt(25,25));
}
```
Gets availablity status of the room with the specified name. Learn more about starting areas from [this article](/start-areas.html).
| parameter | type | description |
| --- | --- | --- |
| `roomName` | string | The room name. |

### [](#Return-value-7)Return value
An object containing the following properties:
| property | type | description |
| --- | --- | --- |
| `status` | string | One of the following string values: - `normal` &ndash; the room has no restrictions
- `closed` &ndash; the room is not available
- `novice` &ndash; the room is part of a novice area
- `respawn` &ndash; the room is part of a respawn area
|
| `timestamp` | number | Status expiration time [in milliseconds since UNIX epoch time](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime#Syntax). This property is null if the status is permanent. |
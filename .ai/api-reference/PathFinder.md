Contains powerful methods for pathfinding in the game world. This module is written in fast native C++ code and supports custom navigation costs and paths which span multiple rooms.

## PathFinder.search(origin, goal, [opts])



```js
let creep = Game.creeps.John;

let goals = _.map(creep.room.find(FIND_SOURCES), function(source) {
// We can't actually walk on sources-- set `range` to 1
// so we path next to it.
return { pos: source.pos, range: 1 };
});

let ret = PathFinder.search(
creep.pos, goals,
{
// We need to set the defaults costs higher so that we
// can set the road cost lower in `roomCallback`
plainCost: 2,
swampCost: 10,

roomCallback: function(roomName) {

let room = Game.rooms[roomName];
// In this example `room` will always exist, but since
// PathFinder supports searches which span multiple rooms
// you should be careful!
if (!room) return;
let costs = new PathFinder.CostMatrix;

room.find(FIND_STRUCTURES).forEach(function(struct) {
if (struct.structureType === STRUCTURE_ROAD) {
// Favor roads over plain tiles
costs.set(struct.pos.x, struct.pos.y, 1);
} else if (struct.structureType !== STRUCTURE_CONTAINER &&
(struct.structureType !== STRUCTURE_RAMPART ||
!struct.my)) {
// Can't walk through non-walkable buildings
costs.set(struct.pos.x, struct.pos.y, 0xff);
}
});

// Avoid creeps in the room
room.find(FIND_CREEPS).forEach(function(creep) {
costs.set(creep.pos.x, creep.pos.y, 0xff);
});

return costs;
},
}
);

let pos = ret.path[0];
creep.move(creep.pos.getDirectionTo(pos));
```
Find an optimal path between `origin` and `goal`.
| parameter | type | description |
| --- | --- | --- |
| `origin` | [RoomPosition](#RoomPosition) | The start position. |
| `goal` | object | A goal or an array of goals. If more than one goal is supplied then the cheapest path found out of all the goals will be returned. A goal is either a RoomPosition or an object as defined below. ***Important:*** Please note that if your goal is not walkable (for instance, a source) then you should set `range` to at least 1 or else you will waste many CPU cycles searching for a target that you can't walk on.                     - pos                             [`RoomPosition`](#RoomPosition)                             The target.
- range                             number                             Range to `pos` before goal is considered reached. The default is 0.
|
| `opts`
*optional* | object | An object containing additional pathfinding flags. - roomCallback         function         Request from the pathfinder to generate a [`CostMatrix`](#PathFinder-CostMatrix) for a certain room. The callback accepts one argument, `roomName`. This callback will only be called once per room per search. If you are running multiple pathfinding operations in a single room and in a single tick you may consider caching your CostMatrix to speed up your code. Please read the CostMatrix documentation below for more information on CostMatrix. If you return `false` from the callback the requested room will not be searched, and it won't count against `maxRooms`
- plainCost         number         Cost for walking on plain positions. The default is 1.
- swampCost         number         Cost for walking on swamp positions. The default is 5.
- flee         boolean         Instead of searching for a path *to* the goals this will search for a path *away* from the goals. The cheapest path that is out of `range` of every goal will be returned. The default is false.
- maxOps         number         The maximum allowed pathfinding operations. You can limit CPU time used for the search based on ratio 1 op ~ 0.001 CPU. The default value is 2000.
- maxRooms         number         The maximum allowed rooms to search. The default is 16, maximum is 64.
- maxCost         number         The maximum allowed cost of the path returned. If at any point the pathfinder detects that it is impossible to find a path with a cost less than or equal to `maxCost` it will immediately halt the search. The default is Infinity.
- heuristicWeight         number         Weight to apply to the heuristic in the A* formula `F = G + weight * H`. Use this option only if you understand the underlying A* algorithm mechanics! The default value is 1.2.
|

### [](#Return-value)Return value
An object containing the following properties:
| property | description |
| --- | --- |
| `path` | An array of RoomPosition objects. |
| `ops` | Total number of operations performed before this path was calculated. |
| `cost` | The total cost of the path as derived from `plainCost`, `swampCost` and any given CostMatrix instances. |
| `incomplete` | If the pathfinder fails to find a complete path, this will be true. Note that `path` will still be populated with a partial path which represents the closest path it could find given the search parameters. |

## PathFinder.use(isEnabled)



This method is deprecated and will be removed soon.


```js
PathFinder.use(true);
Game.creeps.John.moveTo(Game.spawns['Spawn1']);
```
Specify whether to use this new experimental pathfinder in game objects methods. This method should be invoked every tick. It affects the following methods behavior: [`Room.findPath`](#Room.findPath), [`RoomPosition.findPathTo`](#RoomPosition.findPathTo), [`RoomPosition.findClosestByPath`](#RoomPosition.findClosestByPath), [`Creep.moveTo`](#Creep.moveTo).
| parameter | type | description |
| --- | --- | --- |
| `isEnabled` | boolean | Whether to activate the new pathfinder or deactivate. The default is `true`. |
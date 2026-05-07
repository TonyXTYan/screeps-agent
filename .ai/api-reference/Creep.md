Creeps are your units. Creeps can move, harvest energy, construct structures, attack another creeps, and perform other actions. Each creep consists of up to 50 body parts with the following possible types:

| Body part | Build cost | Effect per one body part |
| --- | --- | --- |
| `MOVE` | 50 | Decreases fatigue by 2 points per tick. |
| `WORK` | 100 | Harvests 2 energy units from a source per tick.             Harvests 1 resource unit from a mineral or a deposit per tick.             Builds a structure for 5 energy units per tick.             Repairs a structure for 100 hits per tick consuming 1 energy unit per tick.             Dismantles a structure for 50 hits per tick returning 0.25 energy unit per tick.             Upgrades a controller for 1 energy unit per tick. |
| `CARRY` | 50 | Can contain up to 50 resource units. |
| `ATTACK` | 80 | Attacks another creep/structure with 30 hits per tick in a short-ranged attack. |
| `RANGED_ATTACK` | 150 | Attacks another single creep/structure with 10 hits per tick in a long-range attack up to 3 squares long.             Attacks all hostile creeps/structures within 3 squares range with 1-4-10 hits (depending on the range). |
| `HEAL` | 250 | Heals self or another creep restoring 12 hits per tick in short range or 4 hits per tick at a distance. |
| `CLAIM` | 600 | Claims a neutral room controller.             Reserves a neutral room controller for 1 tick per body part.             Attacks a hostile room controller downgrading its timer by 300 ticks per body parts.             Attacks a neutral room controller reservation timer by 1 tick per body parts.             A creep with this body part will have a reduced life time of 600 ticks and cannot be renewed. |
| `TOUGH` | 10 | No effect, just additional hit points to the creep's body. Can be boosted to resist damage. |

## Inherited from [RoomObject](#RoomObject)effectsarray

Applied effects, an array of objects with the following properties:
| parameter | type | description |
| --- | --- | --- |
| `effect` | number | Effect ID of the applied effect. Can be either natural effect ID or Power ID. |
| `level`
*optional* | number | Power level of the applied effect. Absent if the effect is not a Power effect. |
| `ticksRemaining` | number | How many ticks will the effect last. |

## Inherited from [RoomObject](#RoomObject)pos[RoomPosition](#RoomPosition)

An object representing the position of this object in the room.

## Inherited from [RoomObject](#RoomObject)room[Room](#Room)

The link to the Room object. May be undefined in case if an object is a flag or a construction site and is placed in a room that is not visible to you.

## bodyarray

An array describing the creep’s body. Each element contains the following properties:
| parameter | type | description |
| --- | --- | --- |
| `boost` | string | undefined | If the body part is boosted, this property specifies the mineral type which is used for boosting. One of the `RESOURCE_*` constants. [Learn more](/resources.html) |
| `type` | string | One of the body part types constants. |
| `hits` | number | The remaining amount of hit points of this body part. |

## carryobject
This property is deprecated and will be removed soon.

An alias for [`Creep.store`](#Creep.store).

## carryCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`Creep.store.getCapacity()`](#Store.getCapacity).

## fatiguenumber

The movement fatigue indicator. If it is greater than zero, the creep cannot move.

## hitsnumber

The current amount of hit points of the creep.

## hitsMaxnumber

The maximum amount of hit points of the creep.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## memoryany

```js
creep.memory.task = 'building';
```
A shorthand to `Memory.creeps[creep.name]`. You can use it for quick access the creep’s specific memory data object. [Learn more about memory](/global-objects.html#Memory-object)

## myboolean

Whether it is your creep or foe.

## namestring

Creep’s name. You can choose the name while creating a new creep, and it cannot be changed later. This name is a hash key to access the creep via the [Game.creeps](#Game.creeps) object.

## ownerobject

An object with the creep’s owner info containing the following properties:
| parameter | type | description |
| --- | --- | --- |
| `username` | string | The name of the owner user. |

## sayingstring

The text message that the creep was saying at the last tick.

## spawningboolean

Whether this creep is still being spawned.

## store[Store](#Store)

```js
if(creep.store[RESOURCE_ENERGY]  creep.store.getCapacity()) {
goHarvest(creep);
}
```
A [`Store`](#Store) object that contains cargo of this creep.

## ticksToLivenumber

The remaining amount of game ticks after which the creep will die.

## attack(target)



```js
const target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
if(target) {
if(creep.attack(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Attack another creep, power creep, or structure in a short-ranged attack. Requires the `ATTACK` body part. If the target is inside a rampart, then the rampart is attacked instead. The target has to be at adjacent square to the creep. If the target is a creep with `ATTACK` body parts and is not inside a rampart, it will automatically hit back at the attacker.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep), [Structure](#Structure) | The target object to be attacked. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid attackable object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `ATTACK` body parts in this creep’s body. |

## attackController(target)



```js
if(creep.room.controller && !creep.room.controller.my) {
if(creep.attackController(creep.room.controller) == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
}
```
Decreases the controller's downgrade timer by 300 ticks per every `CLAIM` body part, or reservation timer by 1 tick per every `CLAIM` body part. If the controller under attack is owned, it cannot be upgraded or attacked again for the next 1,000 ticks. The target has to be at adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target controller object. |

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid owned or reserved controller object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_TIRED` | -11 | You have to wait until the next attack is possible. |
| `ERR_NO_BODYPART` | -12 | There are not enough `CLAIM` body parts in this creep’s body. |

## build(target)



```js
const target = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
if(target) {
if(creep.build(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Build a structure at the target construction site using carried energy. Requires `WORK` and `CARRY` body parts. The target has to be within 3 squares range of the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [ConstructionSite](#ConstructionSite) | The target construction site to be built. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have any carried energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid construction site object or the structure cannot be built here (probably because of a creep at the same square). |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `WORK` body parts in this creep’s body. |

## cancelOrder(methodName)



```js
creep.move(LEFT);
creep.cancelOrder('move');
//The creep will not move in this game tick
```
Cancel the order given during the current game tick.
| parameter | type | description |
| --- | --- | --- |
| `methodName` | string | The name of a creep's method to be cancelled. |

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been cancelled successfully. |
| `ERR_NOT_FOUND` | -5 | The order with the specified name is not found. |

## claimController(target)



```js
if(creep.room.controller) {
if(creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
}
```
Claims a neutral controller under your control. Requires the `CLAIM` body part. The target has to be at adjacent square to the creep. You need to have the corresponding Global Control Level in order to claim a new room. If you don't have enough GCL, consider [reserving](#reserveController) this room instead. [Learn more](/control.html#Global-Control-Level)
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target controller object. |

### [](#Return-value-4)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid neutral controller object. |
| `ERR_FULL` | -8 | You cannot claim more than 3 rooms in the Novice Area. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `CLAIM` body parts in this creep’s body. |
| `ERR_GCL_NOT_ENOUGH` | -15 | Your Global Control Level is not enough. |
| `ERR_ACCESS_DENIED` | -16 | You do not have access to this restricted shard. Use [`Game.shard.activateAccess`](#Game.shard.activateAccess) to activate access. |

## dismantle(target)



```js
const target = creep.pos.findClosestByRange(FIND_STRUCTURES,
{filter: {structureType: STRUCTURE_WALL}});
if(target) {
if(creep.dismantle(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Dismantles any structure that can be constructed (even hostile) returning 50% of the energy spent on its repair. Requires the `WORK` body part. If the creep has an empty `CARRY` body part, the energy is put into it; otherwise it is dropped on the ground. The target has to be at adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Structure](#Structure) | The target structure. |

### [](#Return-value-5)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid structure object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `WORK` body parts in this creep’s body. |

## drop(resourceType, [amount])



```js
creep.drop(RESOURCE_ENERGY);
```

```js
// drop all resources
for(const resourceType in creep.carry) {
creep.drop(resourceType);
}
```
Drop this resource on the ground.
| parameter | type | description |
| --- | --- | --- |
| `resourceType` | string | One of the `RESOURCE_*` constants. |
| `amount`
*optional* | number | The amount of resource units to be dropped. If omitted, all the available carried amount is used. |

### [](#Return-value-6)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have the given amount of resources. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not a valid `RESOURCE_*` constants. |

## generateSafeMode(target)



```js
if(creep.generateSafeMode(creep.room.controller) == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
```
Add one more available safe mode activation to a room controller. The creep has to be at adjacent square to the target room controller and have 1000 ghodium resource.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target room controller. |

### [](#Return-value-7)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have enough ghodium. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid controller object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

## getActiveBodyparts(type)



```js
const target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
filter: function(object) {
return object.getActiveBodyparts(ATTACK) == 0;
}
});
if(target) {
creep.moveTo(target);
}
```
Get the quantity of live body parts of the given type. Fully damaged parts do not count.
| parameter | type | description |
| --- | --- | --- |
| `type` | string | A body part type, one of the following body part constants:                     - `MOVE`
- `WORK`
- `CARRY`
- `ATTACK`
- `RANGED_ATTACK`
- `HEAL`
- `TOUGH`
|

### [](#Return-value-8)Return value
A number representing the quantity of body parts.

## harvest(target)



```js
const target = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
if(target) {
if(creep.harvest(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Harvest energy from the source or resources from minerals and deposits. Requires the `WORK` body part. If the creep has an empty `CARRY` body part, the harvested resource is put into it; otherwise it is dropped on the ground. The target has to be at an adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Source](#Source), [Mineral](#Mineral), [Deposit](#Deposit) | The object to be harvested. |

### [](#Return-value-9)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep, or the room controller is owned or reserved by another player. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_FOUND` | -5 | Extractor not found. You must build an extractor structure to harvest minerals. [Learn more](/resources.html) |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The target does not contain any harvestable energy or mineral. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid source or mineral object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_TIRED` | -11 | The extractor or the deposit is still cooling down. |
| `ERR_NO_BODYPART` | -12 | There are no `WORK` body parts in this creep’s body. |

## heal(target)



```js
const target = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
filter: function(object) {
return object.hits  object.hitsMax;
}
});
if(target) {
if(creep.heal(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Heal self or another creep. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the `HEAL` body part. The target has to be at adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep) | The target creep object. |

### [](#Return-value-10)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid creep object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `HEAL` body parts in this creep’s body. |

## move(direction)



```js
creep.move(RIGHT);
```

```js
const path = creep.pos.findPathTo(Game.flags.Flag1);
if(path.length > 0) {
creep.move(path[0].direction);
}
```

```js
creep1.move(TOP);
creep1.pull(creep2);
creep2.move(creep1);
```
Move the creep one square in the specified direction. Requires the `MOVE` body part, or another creep nearby [pulling](#Creep.pull) the creep. In case if you call `move` on a creep nearby, the `ERR_TIRED` and the `ERR_NO_BODYPART` checks will be bypassed; otherwise, the `ERR_NOT_IN_RANGE` check will be bypassed.
| parameter | type | description |
| --- | --- | --- |
| `direction` | [Creep](#Creep)|number | A creep nearby, or one of the following constants:                     - `TOP`
- `TOP_RIGHT`
- `RIGHT`
- `BOTTOM_RIGHT`
- `BOTTOM`
- `BOTTOM_LEFT`
- `LEFT`
- `TOP_LEFT`
|

### [](#Return-value-11)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_IN_RANGE` | -9 | The target creep is too far away |
| `ERR_INVALID_ARGS` | -10 | The provided direction is incorrect. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |
| `ERR_NO_BODYPART` | -12 | There are no MOVE body parts in this creep’s body. |

## moveByPath(path)



```js
const path = spawn.room.findPath(spawn, source);
creep.moveByPath(path);
```

```js
if(!creep.memory.path) {
creep.memory.path = creep.pos.findPathTo(target);
}
creep.moveByPath(creep.memory.path);
```
Move the creep using the specified predefined path. Requires the `MOVE` body part.
| parameter | type | description |
| --- | --- | --- |
| `path` | array|string | A path value as returned from [`Room.findPath`](#Room.findPath), [`RoomPosition.findPathTo`](#RoomPosition.findPathTo), or [`PathFinder.search`](#PathFinder.search) methods. Both array form and serialized string form are accepted. |

### [](#Return-value-12)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_FOUND` | -5 | The specified path doesn't match the creep's location. |
| `ERR_INVALID_ARGS` | -10 | `path` is not a valid path array. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |
| `ERR_NO_BODYPART` | -12 | There are no `MOVE` body parts in this creep’s body. |

## moveTo(x, y, [opts])
(target, [opts])



```js
creep.moveTo(10, 20);
```

```js
creep.moveTo(Game.flags.Flag1);
```

```js
creep.moveTo(new RoomPosition(25, 20, 'W10N5'));
```

```js
creep.moveTo(pos, {reusePath: 50});
```

```js
// Execute moves by cached paths at first
for(const name in Game.creeps) {
Game.creeps[name].moveTo(target, {noPathFinding: true});
}

// Perform pathfinding only if we have enough CPU
if(Game.cpu.tickLimit - Game.cpu.getUsed() > 20) {
for(const name in Game.creeps) {
Game.creeps[name].moveTo(target);
}
}
```
Find the optimal path to the target within the same room and move to it. A shorthand to consequent calls of [pos.findPathTo()](#RoomPosition.findPathTo) and [move()](#Creep.move) methods. If the target is in another room, then the corresponding exit will be used as a target. Requires the `MOVE` body part.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position of the target in the same room. |
| `y` | number | Y position of the target in the same room. |
| `target` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). The position doesn't have to be in the same room with the creep. |
| `opts`
*optional* | object | An object containing additional options:                     - reusePath                             number                             This option enables reusing the path found along multiple game ticks. It allows to save CPU time, but can result in a slightly slower creep reaction behavior. The path is stored into the creep's memory to the `_move` property. The `reusePath` value defines the amount of ticks which the path should be reused for. The default value is 5. Increase the amount to save more CPU, decrease to make the movement more consistent. Set to 0 if you want to disable path reusing.
- serializeMemory                             boolean                             If `reusePath` is enabled and this option is set to true, the path will be stored in memory in the short serialized form using [`Room.serializePath`](#Room.serializePath). The default value is true.
- noPathFinding                             boolean                             If this option is set to true, `moveTo` method will return `ERR_NOT_FOUND` if there is no memorized path to reuse. This can significantly save CPU time in some cases. The default value is false.
- visualizePathStyle                             object                             Draw a line along the creep’s path using [`RoomVisual.poly`](#RoomVisual.poly). You can provide either an empty object or custom style parameters. The default style is equivalent to:                                  ```js {     fill: 'transparent',     stroke: '#fff',     lineStyle: 'dashed',     strokeWidth: .15,     opacity: .1 } ```
- Any options supported by [`Room.findPath`](#Room.findPath) method.
|

### [](#Return-value-13)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_NO_PATH` | -2 | No path to the target could be found. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_FOUND` | -5 | The creep has no memorized path to reuse. |
| `ERR_INVALID_TARGET` | -7 | The target provided is invalid. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |
| `ERR_NO_BODYPART` | -12 | There are no MOVE body parts in this creep’s body. |

## notifyWhenAttacked(enabled)



```js
if(creep.memory.role == 'scout') {
creep.notifyWhenAttacked(false);
}
else {
creep.notifyWhenAttacked(true);
}
```
Toggle auto notification when the creep is under attack. The notification will be sent to your account email. Turned on by default.
| parameter | type | description |
| --- | --- | --- |
| `enabled` | boolean | Whether to enable notification or disable. |

### [](#Return-value-14)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_ARGS` | -10 | `enable` argument is not a boolean value. |

## pickup(target)



```js
const target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES);
if(target) {
if(creep.pickup(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
}
}
```
Pick up an item (a dropped piece of energy). Requires the `CARRY` body part. The target has to be at adjacent square to the creep or at the same square.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Resource](#Resource) | The target object to be picked up. |

### [](#Return-value-15)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object to pick up. |
| `ERR_FULL` | -8 | The creep cannot receive any more resource. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

## pull(target)



```js
creep1.move(TOP);
creep1.pull(creep2);
creep2.move(creep1);
```

```js
const target = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
filter: function(object) {
return (object.getActiveBodyparts(MOVE) == 0) &&
object.memory.destinationId &&
!object.pos.isNearTo(Game.getObjectById(object.memory.destinationId));
}
});
if(target) {
if(creep.pull(target) == ERR_NOT_IN_RANGE) {
creep.moveTo(target);
} else {
target.move(creep);
if(creep.pos.isNearTo(Game.getObjectById(target.memory.destinationId))) {
creep.move(creep.pos.getDirectionTo(target));
} else {
creep.moveTo(Game.getObjectById(target.memory.destinationId));
}
}
}
```
Help another creep to follow this creep. The fatigue generated for the target's move will be added to the creep instead of the target. Requires the `MOVE` body part. The target has to be at adjacent square to the creep. The creep must [move](#Creep.move) elsewhere, and the target must [move](#Creep.move) towards the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep) | The target creep. |

### [](#Return-value-16)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target provided is invalid. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

## rangedAttack(target)



```js
const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
if(targets.length > 0) {
creep.rangedAttack(targets[0]);
}
```
A ranged attack against another creep or structure. Requires the `RANGED_ATTACK` body part. If the target is inside a rampart, the rampart is attacked instead. The target has to be within 3 squares range of the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep), [Structure](#Structure) | The target object to be attacked. |

### [](#Return-value-17)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid attackable object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `RANGED_ATTACK` body parts in this creep’s body. |

## rangedHeal(target)



```js
const target = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
filter: function(object) {
return object.hits  object.hitsMax;
}
});
if(target) {
creep.moveTo(target);
if(creep.pos.isNearTo(target)) {
creep.heal(target);
}
else {
creep.rangedHeal(target);
}
}
```
Heal another creep at a distance. It will restore the target creep’s damaged body parts function and increase the hits counter. Requires the `HEAL` body part. The target has to be within 3 squares range of the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep) | The target creep object. |

### [](#Return-value-18)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid creep object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `HEAL` body parts in this creep’s body. |

## rangedMassAttack()



```js
const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
if(targets.length > 0) {
creep.rangedMassAttack();
}
```
A ranged attack against all hostile creeps or structures within 3 squares range. Requires the `RANGED_ATTACK` body part. The attack power depends on the range to each target. Friendly units are not affected.

### [](#Return-value-19)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NO_BODYPART` | -12 | There are no `RANGED_ATTACK` body parts in this creep’s body. |

## repair(target)



```js
const targets = creep.room.find(FIND_STRUCTURES, {
filter: object => object.hits  object.hitsMax
});

targets.sort((a,b) => a.hits - b.hits);

if(targets.length > 0) {
if(creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
creep.moveTo(targets[0]);
}
}
```
Repair a damaged structure using carried energy. Requires the `WORK` and `CARRY` body parts. The target has to be within 3 squares range of the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Structure](#Structure) | The target structure to be repaired. |

### [](#Return-value-20)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not carry any energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid structure object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `WORK` body parts in this creep’s body. |

## reserveController(target)



```js
if(creep.room.controller) {
if(creep.reserveController(creep.room.controller) == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
}
```
Temporarily block a neutral controller from claiming by other players and restore energy sources to their full capacity. Each tick, this command increases the counter of the period during which the controller is unavailable by 1 tick per each `CLAIM` body part. The maximum reservation period to maintain is 5,000 ticks. The target has to be at adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target controller object to be reserved. |

### [](#Return-value-21)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid neutral controller object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `CLAIM` body parts in this creep’s body. |
| `ERR_ACCESS_DENIED` | -16 | You do not have access to this restricted shard. Use [`Game.shard.activateAccess`](#Game.shard.activateAccess) to activate access. |

## say(message, [public])



```js
const hostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 10);
if(hostiles.length > 0) {
creep.say('OMG!😨');
creep.moveTo(Game.spawns['Spawn1']);
}
else {
doWork(creep);
}
```
Display a visual speech balloon above the creep with the specified message. The message will be available for one tick. You can read the last message using the `saying` property. Any valid Unicode characters are allowed, including [emoji](http://unicode.org/emoji/charts/emoji-style.txt).
| parameter | type | description |
| --- | --- | --- |
| `message` | string | The message to be displayed. Maximum length is 10 characters. |
| `public`
*optional* | boolean | Set to true to allow other players to see this message. Default is false. |

### [](#Return-value-22)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |

## signController(target, text)



```js
if(creep.room.controller) {
if(creep.signController(creep.room.controller, "I'm going to claim this room in a few days. I warned ya!") == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
}
```
Sign a controller with an arbitrary text visible to all players. This text will appear in the room UI, in the world map, and can be accessed via the API. You can sign unowned and hostile controllers. The target has to be at adjacent square to the creep. Pass an empty string to remove the sign.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target controller object to be signed. |
| `text` | string | The sign text. The string is cut off after 100 characters. |

### [](#Return-value-23)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid controller object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

## suicide()



Kill the creep immediately.

### [](#Return-value-24)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |

## transfer(target, resourceType, [amount])



```js
if(creep.transfer(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
creep.moveTo(storage);
}
```

```js
// transfer all resources
for(const resourceType in creep.carry) {
creep.transfer(storage, resourceType);
}
```
Transfer resource from the creep to another object. The target has to be at adjacent square to the creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep), [Structure](#Structure) | The target object. |
| `resourceType` | string | One of the `RESOURCE_*` constants. |
| `amount`
*optional* | number | The amount of resources to be transferred. If omitted, all the available carried amount is used. |

### [](#Return-value-25)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have the given amount of resources. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object which can contain the specified resource. |
| `ERR_FULL` | -8 | The target cannot receive any more resources. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not one of the `RESOURCE_*` constants, or the amount is incorrect. |

## upgradeController(target)



```js
if(creep.room.controller) {
if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
creep.moveTo(creep.room.controller);
}
}
```
Upgrade your controller to the next level using carried energy. Upgrading controllers raises your Global Control Level in parallel. Requires `WORK` and `CARRY` body parts. The target has to be within 3 squares range of the creep.
A fully upgraded level 8 controller can't be upgraded over 15 energy units per tick regardless of creeps abilities. The cumulative effect of all the creeps performing `upgradeController` in the current tick is taken into account. This limit can be increased by using [ghodium mineral boost](/resources.html).
Upgrading the controller raises its `ticksToDowngrade` timer by 100. The timer must be full in order for controller to be levelled up.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructureController](#StructureController) | The target controller object to be upgraded. |

### [](#Return-value-26)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep or the target controller. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have any carried energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid controller object, or the controller upgrading is blocked. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_NO_BODYPART` | -12 | There are no `WORK` body parts in this creep’s body. |
| `ERR_ACCESS_DENIED` | -16 | You do not have access to this restricted shard. Use [`Game.shard.activateAccess`](#Game.shard.activateAccess) to activate access. |

## withdraw(target, resourceType, [amount])



```js
if(creep.withdraw(storage, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
creep.moveTo(storage);
}
```
Withdraw resources from a structure or tombstone. The target has to be at adjacent square to the creep. Multiple creeps can withdraw from the same object in the same tick. Your creeps can withdraw resources from hostile structures/tombstones as well, in case if there is no hostile rampart on top of it.
This method should not be used to transfer resources between creeps. To transfer between creeps, use the [`transfer`](#Creep.transfer) method on the original creep.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Structure](#Structure), [Tombstone](#Tombstone), [Ruin](#Ruin) | The target object. |
| `resourceType` | string | One of the `RESOURCE_*` constants. |
| `amount`
*optional* | number | The amount of resources to be transferred. If omitted, all the available amount is used. |

### [](#Return-value-27)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep, or there is a hostile rampart on top of the target. |
| `ERR_BUSY` | -4 | The creep is still being spawned. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The target does not have the given amount of resources. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object which can contain the specified resource. |
| `ERR_FULL` | -8 | The creep's carry is full. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not one of the `RESOURCE_*` constants, or the amount is incorrect. |
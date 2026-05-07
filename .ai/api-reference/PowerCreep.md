Power Creeps are immortal "heroes" that are tied to your account and can be respawned in any `PowerSpawn` after death.
You can upgrade their abilities ("powers") up to your account Global Power Level (see [`Game.gpl`](#Game.gpl)).
| **Time to live** | 5,000 |
| --- | --- |
| **Hits** | 1,000 per level |
| **Capacity** | 100 per level |

[Full list of available powers](/power.html#Powers)

## PowerCreep.create(name, className)



```js
PowerCreep.create('PowerCreep1', POWER_CLASS.OPERATOR);
```
A static method to create new Power Creep instance in your account. It will be added in an unspawned state,
use [`spawn`](#PowerCreep.spawn) method to spawn it in the world.
You need one free Power Level in your account to perform this action.
| parameter | type | description |
| --- | --- | --- |
| `name` | string | The name of the new power creep. The name length limit is 100 characters. |
| `className` | string | The class of the new power creep, one of the `POWER_CLASS` constants. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NAME_EXISTS` | -3 | A power creep with the specified name already exists. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You don't have free Power Levels in your account. |
| `ERR_INVALID_ARGS` | -10 | The provided power creep name is exceeds the limit, or the power creep class is invalid. |



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

## carryobject
This property is deprecated and will be removed soon.

An alias for [`PowerCreep.store`](#PowerCreep.store).

## carryCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`PowerCreep.store.getCapacity()`](#Store.getCapacity).

## classNamestring

The power creep's class, one of the `POWER_CLASS` constants.

## deleteTimenumber

A timestamp when this creep is marked to be permanently deleted from the account, or undefined otherwise.

## hitsnumber

The current amount of hit points of the creep.

## hitsMaxnumber

The maximum amount of hit points of the creep.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## levelnumber

The power creep's level.

## memoryany

```js
creep.memory.task = 'building';
```
A shorthand to `Memory.powerCreeps[creep.name]`. You can use it for quick access the creep’s specific memory data object. [Learn more about memory](/global-objects.html#Memory-object)

## myboolean

Whether it is your creep or foe.

## namestring

Power creep’s name. You can choose the name while creating a new power creep, and it cannot be changed later. This name is a hash key to access the creep via the [Game.powerCreeps](#Game.powerCreeps) object.

## ownerobject

An object with the creep’s owner info containing the following properties:

## store[Store](#Store)

```js
if(creep.store[RESOURCE_ENERGY]  creep.store.getCapacity()) {
goHarvest(creep);
}
```
A [`Store`](#Store) object that contains cargo of this creep.

## powersobject

Available powers, an object with power ID as a key, and the following properties:
| parameter | type | description |
| --- | --- | --- |
| `level` | number | Current level of the power. |
| `cooldown` | number | Cooldown ticks remaining, or undefined if the power creep is not spawned in the world. |

## sayingstring

The text message that the creep was saying at the last tick.

## shardstring

The name of the shard where the power creep is spawned, or undefined.

## spawnCooldownTimenumber

```js
if(!(Game.powerCreeps['PowerCreep1'].spawnCooldownTime > Date.now())) {
Game.powerCreeps['PowerCreep1'].spawn(powerSpawn);
}
```
The timestamp when spawning or deleting this creep will become available.
Undefined if the power creep is spawned in the world.

## ticksToLivenumber

The remaining amount of game ticks after which the creep will die and become unspawned. Undefined if the creep
is not spawned in the world.

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

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been cancelled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_FOUND` | -5 | The order with the specified name is not found. |

## delete([cancel])



```js
Game.powerCreeps['PowerCreep1'].delete();
```
Delete the power creep permanently from your account. It should NOT be spawned in the world. The creep is not deleted
immediately, but a 24-hours delete timer is started instead (see [`deleteTime`](#PowerCreep.deleteTime)). You can cancel deletion by calling `delete(true)`.
| parameter | type | description |
| --- | --- | --- |
| `cancel` | boolean | Set this to true to cancel previously scheduled deletion. |



### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep. |
| `ERR_BUSY` | -4 | The power creep is spawned in the world. |

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

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have the given amount of energy. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not a valid `RESOURCE_*` constants. |

```js
Game.powerCreeps['PowerCreep1'].usePower(PWR_GENERATE_OPS);
```

## enableRoom(controller)



```js
powerCreep.enableRoom(powerCreep.room.controller);
```
Enable powers usage in this room. The room controller should be at adjacent tile.
| parameter | type | description |
| --- | --- | --- |
| `controller` | [StructureController](#StructureController) | The room controller. |

### [](#Return-value-4)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_INVALID_TARGET` | -7 | The target is not a controller structure. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

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
Move the creep one square in the specified direction.
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

### [](#Return-value-5)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_IN_RANGE` | -9 | The target creep is too far away |
| `ERR_INVALID_ARGS` | -10 | The provided direction is incorrect. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |

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
Move the creep using the specified predefined path.
| parameter | type | description |
| --- | --- | --- |
| `path` | array|string | A path value as returned from [`Room.findPath`](#Room.findPath), [`RoomPosition.findPathTo`](#RoomPosition.findPathTo), or [`PathFinder.search`](#PathFinder.PathFinder-search) methods. Both array form and serialized string form are accepted. |

### [](#Return-value-6)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_FOUND` | -5 | The specified path doesn't match the creep's location. |
| `ERR_INVALID_ARGS` | -10 | `path` is not a valid path array. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |

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
Find the optimal path to the target within the same room and move to it. A shorthand to consequent calls of [pos.findPathTo()](#RoomPosition.findPathTo) and [move()](#Creep.move) methods. If the target is in another room, then the corresponding exit will be used as a target.
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

### [](#Return-value-7)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_NO_PATH` | -2 | No path to the target could be found. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_FOUND` | -5 | The creep has no memorized path to reuse. |
| `ERR_INVALID_TARGET` | -7 | The target provided is invalid. |
| `ERR_TIRED` | -11 | The fatigue indicator of the creep is non-zero. |

## notifyWhenAttacked(enabled)



```js
Game.powerCreeps['PC1'].notifyWhenAttacked(true);
```
Toggle auto notification when the creep is under attack. The notification will be sent to your account email. Turned on by default.
| parameter | type | description |
| --- | --- | --- |
| `enabled` | boolean | Whether to enable notification or disable. |

### [](#Return-value-8)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
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
Pick up an item (a dropped piece of energy). The target has to be at adjacent square to the creep or at the same square.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Resource](#Resource) | The target object to be picked up. |

### [](#Return-value-9)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object to pick up. |
| `ERR_FULL` | -8 | The creep cannot receive any more resource. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

## rename(name)



```js
Game.powerCreeps['PC1'].rename('PC1X');
```
Rename the power creep. It must not be spawned in the world.
| parameter | type | description |
| --- | --- | --- |
| `name` | string | The new name of the power creep. |

### [](#Return-value-10)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep. |
| `ERR_NAME_EXISTS` | -3 | A power creep with the specified name already exists. |
| `ERR_BUSY` | -4 | The power creep is spawned in the world. |

## renew(target)



```js
let powerBank = Game.getObjectById('XXX');
Game.powerCreeps['PowerCreep1'].renew(powerBank);
```
Instantly restore time to live to the maximum using a Power Spawn or a Power Bank nearby. It has to be at adjacent tile.
| parameter | type | description |
| --- | --- | --- |
| `target` | [StructurePowerBank](#StructurePowerBank) | [StructurePowerSpawn](#StructurePowerSpawn) | The target structure. |

### [](#Return-value-11)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid power bank object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |

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

### [](#Return-value-12)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |

## spawn(powerSpawn)



```js
Game.powerCreeps['PowerCreep1'].spawn(Game.getObjectById('XXX'));
```
Spawn this power creep in the specified Power Spawn.
| parameter | type | description |
| --- | --- | --- |
| `powerSpawn` | [StructurePowerSpawn](#StructurePowerSpawn) | Your Power Spawn structure. |

### [](#Return-value-13)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep or the spawn. |
| `ERR_BUSY` | -4 | The power creep is already spawned in the world. |
| `ERR_INVALID_TARGET` | -7 | The specified object is not a Power Spawn. |
| `ERR_TIRED` | -11 | The power creep cannot be spawned because of the cooldown. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use the spawn. |

## suicide()



Kill the power creep immediately. It will not be destroyed permanently, but will become unspawned,
so that you can [`spawn`](#PowerCreep.spawn) it again.

### [](#Return-value-14)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |

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

### [](#Return-value-15)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep does not have the given amount of resources. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object which can contain the specified resource. |
| `ERR_FULL` | -8 | The target cannot receive any more resources. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not one of the `RESOURCE_*` constants, or the amount is incorrect. |

## upgrade(power)



```js
Game.powerCreeps['PowerCreep1'].upgrade(PWR_GENERATE_OPS);
```
Upgrade the creep, adding a new power ability to it or increasing level of the existing power.
You need one free Power Level in your account to perform this action.
| parameter | type | description |
| --- | --- | --- |
| `power` | number | The power ability to upgrade, one of the `PWR_*` constants. |

### [](#Return-value-16)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You account Power Level is not enough. |
| `ERR_FULL` | -8 | The specified power cannot be upgraded on this creep's level, or the creep reached the maximum level. |
| `ERR_INVALID_ARGS` | -10 | The specified power ID is not valid. |

## usePower(power, [target])



```js
Game.powerCreeps['PowerCreep1'].usePower(PWR_GENERATE_OPS);
```

```js
Game.powerCreeps['PowerCreep1'].usePower(PWR_OPERATE_SPAWN, Game.spawns['Spawn1']);
```
Apply one the creep's powers on the specified target.
You can only use powers in rooms either without a controller, or with a [power-enabled](#PowerCreep.enableRoom) controller.
Only one power can be used during the same tick, each `usePower` call will override the previous one.
If the target has the same effect of a lower or equal level, it is overridden. If the existing effect level is higher, an error is returned.
[Full list of available powers](/power.html#Powers)
| parameter | type | description |
| --- | --- | --- |
| `power` | number | The power ability to use, one of the `PWR_*` constants. |
| `target`
*optional* | [RoomObject](#RoomObject) | A target object in the room. |

### [](#Return-value-17)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the creep. |
| `ERR_BUSY` | -4 | The creep is not spawned in the world. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The creep doesn't have enough resources to use the power. |
| `ERR_INVALID_TARGET` | -7 | The specified target is not valid. |
| `ERR_FULL` | -8 | The target has the same active effect of a higher level. |
| `ERR_NOT_IN_RANGE` | -9 | The specified target is too far away. |
| `ERR_INVALID_ARGS` | -10 | Using powers is not enabled on the Room Controller. |
| `ERR_TIRED` | -11 | The power ability is still on cooldown. |
| `ERR_NO_BODYPART` | -12 | The creep doesn't have the specified power ability. |

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

### [](#Return-value-18)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this creep, or there is a hostile rampart on top of the target. |
| `ERR_BUSY` | -4 | The power creep is not spawned in the world. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The target does not have the given amount of resources. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid object which can contain the specified resource. |
| `ERR_FULL` | -8 | The creep's carry is full. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_INVALID_ARGS` | -10 | The resourceType is not one of the `RESOURCE_*` constants, or the amount is incorrect. |
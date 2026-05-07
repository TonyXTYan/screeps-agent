Spawn is your colony center. This structure can create, renew, and recycle creeps.
All your spawns are accessible through [`Game.spawns`](#Game.spawns) hash list.
Spawns auto-regenerate a little amount of energy each tick, so that you can easily
recover even if all your creeps died.
| **Controller level** |
| --- |
| 1-6 | 1 spawn |
| 7 | 2 spawns |
| 8 | 3 spawns |
| **Cost** | 15,000 |
| **Hits** | 5,000 |
| **Capacity** | 300 |
| **Spawn time** | 3 ticks per each body part |
| **Energy auto-regeneration** | 1 energy unit per tick while energy available in the room (in all spawns and extensions) is less than 300 |

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

## Inherited from [Structure](#Structure)hitsnumber

The current amount of hit points of the structure.

## Inherited from [Structure](#Structure)hitsMaxnumber

The total amount of hit points of the structure.

## Inherited from [Structure](#Structure)idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## Inherited from [Structure](#Structure)structureTypestring

One of the `STRUCTURE_*` constants.

## Inherited from [Structure](#Structure)destroy()



Destroy this structure immediately.

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_BUSY` | -4 | Hostile creeps are in the room. |

## Inherited from [Structure](#Structure)isActive()



Check whether this structure can be used. If room controller level is insufficient, then this method will return false, and the structure will be highlighted with red in the game.

### [](#Return-value-1)Return value
A boolean value.

## Inherited from [Structure](#Structure)notifyWhenAttacked(enabled)



Toggle auto notification when the structure is under attack. The notification will be sent to your account email. Turned on by default.
| parameter | type | description |
| --- | --- | --- |
| `enabled` | boolean | Whether to enable notification or disable. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_INVALID_ARGS` | -10 | `enable` argument is not a boolean value. |



## Inherited from [OwnedStructure](#OwnedStructure)myboolean

Whether this is your own structure.

## Inherited from [OwnedStructure](#OwnedStructure)ownerobject

An object with the structure’s owner info containing the following properties:
| parameter | type | description |
| --- | --- | --- |
| `username` | string | The name of the owner user. |

## energynumber
This property is deprecated and will be removed soon.

An alias for [`.store[RESOURCE_ENERGY]`](#StructureExtension.store).

## energyCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`.store.getCapacity(RESOURCE_ENERGY)`](#Store.getCapacity).

## memoryany

```js
spawn.memory.queue = [];
```
A shorthand to `Memory.spawns[spawn.name]`. You can use it for quick access the spawn’s specific memory data object. [Learn more about memory](/global-objects.html#Memory-object)

## namestring

Spawn’s name. You choose the name upon creating a new spawn, and it cannot be changed later. This name is a hash key to access the spawn via the [Game.spawns](#Game.spawns) object.

## spawning[StructureSpawn.Spawning](#StructureSpawn-Spawning)

If the spawn is in process of spawning a new creep, this object will contain a [`StructureSpawn.Spawning`](#StructureSpawn-Spawning) object, or null otherwise.

## store[Store](#Store)

```js
if(structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
creep.transfer(structure, RESOURCE_ENERGY);
}
```
A [`Store`](#Store) object that contains cargo of this structure.

## canCreateCreep(body, [name])



This method is deprecated and will be removed soon. Please use [`StructureSpawn.spawnCreep`](#StructureSpawn.spawnCreep) with `dryRun` flag instead.

```js
if(spawn.canCreateCreep(body, name) == OK) {
spawn.createCreep(body, name);
}
```
Check if a creep can be created.
| parameter | type | description |
| --- | --- | --- |
| `body` | array<string> | An array describing the new creep’s body. Should contain 1 to 50 elements with one of these constants: - `WORK`
- `MOVE`
- `CARRY`
- `ATTACK`
- `RANGED_ATTACK`
- `HEAL`
- `TOUGH`
- `CLAIM`
|
| `name`
*optional* | string | The name of a new creep. The name length limit is 100 characters. It should be unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same name (hash key). If not defined, a random name will be generated. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | A creep with the given body and name can be created. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn. |
| `ERR_NAME_EXISTS` | -3 | There is a creep with the same name already. |
| `ERR_BUSY` | -4 | The spawn is already in process of spawning another creep. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The spawn and its extensions contain not enough energy to create a creep with the given body. |
| `ERR_INVALID_ARGS` | -10 | Body is not properly described. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use this spawn. |

## createCreep(body, [name], [memory])



This method is deprecated and will be removed soon. Please use [`StructureSpawn.spawnCreep`](#StructureSpawn.spawnCreep) instead.

```js
Game.spawns['Spawn1'].createCreep([WORK, CARRY, MOVE], 'Worker1');
```

```js
Game.spawns['Spawn1'].createCreep([WORK, CARRY, MOVE], null,
{role: 'harvester'});
```

```js
const result = Game.spawns['Spawn1'].createCreep([WORK, CARRY, MOVE]);

if(_.isString(result)) {
console.log('The name is: '+result);
}
else {
console.log('Spawn error: '+result);
}
```
Start the creep spawning process. The required energy amount can be withdrawn from all spawns and extensions in the room.
| parameter | type | description |
| --- | --- | --- |
| `body` | array<string> | An array describing the new creep’s body. Should contain 1 to 50 elements with one of these constants: - `WORK`
- `MOVE`
- `CARRY`
- `ATTACK`
- `RANGED_ATTACK`
- `HEAL`
- `TOUGH`
- `CLAIM`
|
| `name`
*optional* | string | The name of a new creep. The name length limit is 100 characters. It should be unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same name (hash key). If not defined, a random name will be generated. |
| `memory`
*optional* | any | The memory of a new creep. If provided, it will be immediately stored into `Memory.creeps[name]`. |

### [](#Return-value-1)Return value
The name of a new creep or one of these error codes:
| constant | value | description |
| --- | --- | --- |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn. |
| `ERR_NAME_EXISTS` | -3 | There is a creep with the same name already. |
| `ERR_BUSY` | -4 | The spawn is already in process of spawning another creep. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The spawn and its extensions contain not enough energy to create a creep with the given body. |
| `ERR_INVALID_ARGS` | -10 | Body is not properly described. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use this spawn. |

## spawnCreep(body, name, [opts])



```js
Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE], 'Worker1');
```

```js
Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE], 'Worker1', {
memory: {role: 'harvester'}
});
```

```js
Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE], 'Worker1', {
energyStructures: [
Game.spawns['Spawn1'],
Game.getObjectById('anExtensionId')
]
});
```

```js
var testIfCanSpawn = Game.spawns['Spawn1'].spawnCreep([WORK, CARRY, MOVE],
'Worker1', { dryRun: true });
```
Start the creep spawning process. The required energy amount can be withdrawn from all spawns and extensions in the room.
| parameter | type | description |
| --- | --- | --- |
| `body` | array<string> | An array describing the new creep’s body. Should contain 1 to 50 elements with one of these constants: - `WORK`
- `MOVE`
- `CARRY`
- `ATTACK`
- `RANGED_ATTACK`
- `HEAL`
- `TOUGH`
- `CLAIM`
|
| `name` | string | The name of a new creep. The name length limit is 100 characters. It must be a unique creep name, i.e. the `Game.creeps` object should not contain another creep with the same name (hash key). |
| `opts`
*optional* | object | An object with additional options for the spawning process. - memory         any         Memory of the new creep. If provided, it will be immediately stored into `Memory.creeps[name]`.
- energyStructures         array         Array of spawns/extensions from which to draw energy for the spawning process. Structures will be used according to the array order.
- dryRun         boolean         If `dryRun` is true, the operation will only check if it is possible to create a creep.
- directions             array             Set desired directions where the creep should move when spawned. An array with the direction constants:                                                                                          `TOP`
- `TOP_RIGHT`
- `RIGHT`
- `BOTTOM_RIGHT`
- `BOTTOM`
- `BOTTOM_LEFT`
- `LEFT`
- `TOP_LEFT`
|

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn. |
| `ERR_NAME_EXISTS` | -3 | There is a creep with the same name already. |
| `ERR_BUSY` | -4 | The spawn is already in process of spawning another creep. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The spawn and its extensions contain not enough energy to create a creep with the given body. |
| `ERR_INVALID_ARGS` | -10 | Body is not properly described or name was not provided. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use this spawn. |

## recycleCreep(target)



Kill the creep and drop up to 100% of resources spent on its spawning and boosting depending on remaining life time. The target should be at adjacent square. Energy return is limited to 125 units per body part.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep) | The target creep object. |

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn or the target creep. |
| `ERR_INVALID_TARGET` | -7 | The specified target object is not a creep. |
| `ERR_NOT_IN_RANGE` | -9 | The target creep is too far away. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use this spawn. |

## renewCreep(target)



Increase the remaining time to live of the target creep. The target should be at adjacent square.
The target should not have CLAIM body parts.
The spawn should not be busy with the spawning process. Each execution increases the creep's timer
by amount of ticks according to this formula:

```js
floor(600/body_size)
```
Energy required for each execution is determined using this formula:

```js
ceil(creep_cost/2.5/body_size)
```
Renewing a creep removes all of its boosts.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep) | The target creep object. |

### [](#Return-value-4)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the spawn, or the creep. |
| `ERR_BUSY` | -4 | The spawn is spawning another creep. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The spawn does not have enough energy. |
| `ERR_INVALID_TARGET` | -7 | The specified target object is not a creep, or the creep has CLAIM body part. |
| `ERR_FULL` | -8 | The target creep's time to live timer is full. |
| `ERR_NOT_IN_RANGE` | -9 | The target creep is too far away. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use this spawn. |
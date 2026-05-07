Launches a nuke to another room dealing huge damage to the landing area. Each launch has a
cooldown and requires energy and ghodium resources. Launching creates a
[Nuke](#Nuke) object at the target room position which is visible to any player until it is landed.
Incoming nuke cannot be moved or cancelled. Nukes cannot be launched from or to novice rooms. Resources placed into a StructureNuker cannot be withdrawn.
| **Controller level** |
| --- |
| 1-7 | — |
| 8 | 1 nuke |
| **Cost** | 100,000 |
| **Hits** | 1,000 |
| **Range** | 10 rooms |
| **Launch cost** | 300,000 energy
5,000 ghodium |
| **Launch cooldown** | 100,000 ticks |
| **Landing time** | 50,000 ticks |
| **Effect** | All creeps, construction sites and dropped resources in the room are removed immediately, even inside ramparts. Damage to structures:             - 10,000,000 hits at the landing position;
- 5,000,000 hits to all structures in 5x5 area.
Note that you can stack multiple nukes from different rooms at the same target position to increase damage.             Nuke landing does not generate tombstones and ruins, and destroys all existing tombstones and ruins in the room             If the room is in safe mode, then the safe mode is cancelled immediately, and the safe mode cooldown is reset to 0.             The room controller is hit by triggering `upgradeBlocked` period, which means it is unavailable to activate safe mode again within the next 200 ticks. |

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

## ghodiumnumber
This property is deprecated and will be removed soon.

An alias for [`.store[RESOURCE_GHODIUM]`](#StructureExtension.store).

## ghodiumCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`.store.getCapacity(RESOURCE_GHODIUM)`](#Store.getCapacity).

## cooldownnumber

The amount of game ticks until the next launch is possible.

## store[Store](#Store)

```js
if(structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
creep.transfer(structure, RESOURCE_ENERGY);
}
```
A [`Store`](#Store) object that contains cargo of this structure.

## launchNuke(pos)



```js
nuker.launchNuke(new RoomPosition(20,30, 'W1N1'));
```
Launch a nuke to the specified position.
| parameter | type | description |
| --- | --- | --- |
| `pos` | [RoomPosition](#RoomPosition) | The target room position. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The structure does not have enough energy and/or ghodium. |
| `ERR_INVALID_TARGET` | -7 | The nuke can't be launched to the specified RoomPosition (see [Start Areas](/start-areas.html)). |
| `ERR_NOT_IN_RANGE` | -9 | The target room is out of range. |
| `ERR_INVALID_ARGS` | -10 | The target is not a valid RoomPosition. |
| `ERR_TIRED` | -11 | This structure is still cooling down. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |
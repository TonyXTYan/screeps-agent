Remotely attacks or heals creeps, or repairs structures. Can be targeted to any object in
the room. However, its effectiveness linearly depends on the distance. Each action consumes energy.
| **Controller level** |
| --- |
| 1-2 | — |
| 3-4 | 1 tower |
| 5-6 | 2 towers |
| 7 | 3 towers |
| 8 | 6 towers |
| **Cost** | 5,000 |
| **Hits** | 3,000 |
| **Capacity** | 1,000 |
| **Energy per action** | 10 |
| **Attack effectiveness** | 600 hits at range ≤5 to 150 hits at range ≥20 |
| **Heal effectiveness** | 400 hits at range ≤5 to 100 hits at range ≥20 |
| **Repair effectiveness** | 800 hits at range ≤5 to 200 hits at range ≥20 |

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

## store[Store](#Store)

```js
if(structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
creep.transfer(structure, RESOURCE_ENERGY);
}
```
A [`Store`](#Store) object that contains cargo of this structure.

## attack(target)



Remotely attack any creep, power creep or structure in the room.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep), [Structure](#Structure) | The target object. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The tower does not have enough energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid attackable object. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |

## heal(target)



Remotely heal any creep or power creep in the room.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Creep](#Creep), [PowerCreep](#PowerCreep) | The target object. |

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The tower does not have enough energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid creep object. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |

## repair(target)



Remotely repair any structure in the room.
| parameter | type | description |
| --- | --- | --- |
| `target` | [Structure](#Structure) | The target structure. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_NOT_ENOUGH_ENERGY` | -6 | The tower does not have enough energy. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid repairable object. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |
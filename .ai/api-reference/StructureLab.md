Produces mineral compounds from base minerals, boosts and unboosts creeps.
Learn more about minerals from [this article](/resources.html).
| **Controller level** |
| --- |
| 1-5 | — |
| 6 | 3 labs |
| 7 | 6 labs |
| 8 | 10 labs |
| **Cost** | 50,000 |
| **Hits** | 500 |
| **Capacity** | 3000 mineral units, 2000 energy units |
| **Produce** | 5 mineral compound units per reaction |
| **Reaction cooldown** | Depends on the reaction (see [this article](/resources.html)) |
| **Distance to input labs** | 2 squares |
| **Boost cost** | 30 mineral units, 20 energy units per body part |

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

## cooldownnumber

The amount of game ticks the lab has to wait until the next reaction or unboost operation is possible.

## energynumber
This property is deprecated and will be removed soon.

An alias for [`.store[RESOURCE_ENERGY]`](#StructureExtension.store).

## energyCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`.store.getCapacity(RESOURCE_ENERGY)`](#Store.getCapacity).

## mineralAmountnumber
This property is deprecated and will be removed soon.

An alias for [`lab.store[lab.mineralType]`](#StructureExtension.store).

## mineralTypestring

The type of minerals containing in the lab. Labs can contain only one mineral type at the same time.

## mineralCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`lab.store.getCapacity(lab.mineralType || yourMineral)`](#Store.getCapacity).

## store[Store](#Store)

```js
if(structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
creep.transfer(structure, RESOURCE_ENERGY);
}
```
A [`Store`](#Store) object that contains cargo of this structure.

## boostCreep(creep, [bodyPartsCount])



Boosts creep body parts using the containing mineral compound. The creep has to be at adjacent square to the lab.
| parameter | type | description |
| --- | --- | --- |
| `creep` | [Creep](#Creep) | The target creep. |
| `bodyPartsCount`
*optional* | number | The number of body parts of the corresponding type to be boosted. Body parts are always counted left-to-right for `TOUGH`, and right-to-left for other types. If undefined, all the eligible body parts are boosted. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this lab. |
| `ERR_NOT_FOUND` | -5 | The mineral containing in the lab cannot boost any of the creep's body parts. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The lab does not have enough energy or minerals. |
| `ERR_INVALID_TARGET` | -7 | The targets is not valid creep object. |
| `ERR_NOT_IN_RANGE` | -9 | The targets are too far away. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |

## reverseReaction(lab1, lab2)



Breaks mineral compounds back into reagents. The same output labs can be used by many source labs.
| parameter | type | description |
| --- | --- | --- |
| `lab1` | [StructureLab](#StructureLab) | The first result lab. |
| `lab2` | [StructureLab](#StructureLab) | The second result lab. |

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this lab. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The source lab do not have enough resources. |
| `ERR_INVALID_TARGET` | -7 | The targets are not valid lab objects. |
| `ERR_FULL` | -8 | One of targets cannot receive any more resource. |
| `ERR_NOT_IN_RANGE` | -9 | The targets are too far away. |
| `ERR_INVALID_ARGS` | -10 | The reaction cannot be reversed into this resources. |
| `ERR_TIRED` | -11 | The lab is still cooling down. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |

## runReaction(lab1, lab2)



Produce mineral compounds using reagents from two other labs. The same input labs can be used by many output labs.
| parameter | type | description |
| --- | --- | --- |
| `lab1` | [StructureLab](#StructureLab) (lab) | The first source lab. |
| `lab2` | [StructureLab](#StructureLab) (lab) | The second source lab. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this lab. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The source lab do not have enough resources. |
| `ERR_INVALID_TARGET` | -7 | The targets are not valid lab objects. |
| `ERR_FULL` | -8 | The target cannot receive any more resource. |
| `ERR_NOT_IN_RANGE` | -9 | The targets are too far away. |
| `ERR_INVALID_ARGS` | -10 | The reaction cannot be run using this resources. |
| `ERR_TIRED` | -11 | The lab is still cooling down. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |

## unboostCreep(creep)



Immediately remove boosts from the creep and drop 50% of the mineral compounds used to boost it onto the ground regardless of the creep's remaining time to live. The creep has to be at adjacent square to the lab. Unboosting requires cooldown time equal to the total sum of the reactions needed to produce all the compounds applied to the creep.
| parameter | type | description |
| --- | --- | --- |
| `creep` | [Creep](#Creep) | The target creep. |

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this lab, or the target creep. |
| `ERR_NOT_FOUND` | -5 | The target has no boosted parts. |
| `ERR_INVALID_TARGET` | -7 | The target is not a valid Creep object. |
| `ERR_NOT_IN_RANGE` | -9 | The target is too far away. |
| `ERR_TIRED` | -11 | The lab is still cooling down. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Room Controller Level insufficient to use this structure. |
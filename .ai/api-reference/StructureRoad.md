Decreases movement cost to 1. Using roads allows creating creeps with less `MOVE` body parts. You can also build roads on top of natural terrain walls which are otherwise impassable.
| **Controller level** | Any (including neutral rooms) |
| --- | --- |
| **Cost** | - 300 on plain land
- 1,500 on swamp
- 45,000 on walls
|
| **Hits** | - 5,000 on plain land
- 25,000 on swamp
- 750,000 on walls
|
| **Decay** | - Loses 100 hits every 1,000 ticks on plain land
- Loses 500 hits every 1,000 ticks on swamp
- Loses 15,000 hits every 1,000 ticks on walls
Note: every creep step decreases the decay timer for 1 tick per each creep body part |


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

## ticksToDecaynumber

The amount of game ticks when this road will lose some hit points.
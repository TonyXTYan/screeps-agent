A site of a structure which is currently under construction. A construction site can be created using the 'Construct' button at the left of the game field or the [`Room.createConstructionSite`](#Room.createConstructionSite) method.
To build a structure on the construction site, give a worker creep some amount of energy and perform [`Creep.build`](#Creep.build) action.
You can remove enemy construction sites by moving a creep on it.

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


## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## myboolean

Whether this is your own construction site.

## ownerobject

An object with the structure’s owner info containing the following properties:
| parameter | type | description |
| --- | --- | --- |
| `username` | string | The name of the owner user. |

## progressnumber

The current construction progress.

## progressTotalnumber

The total construction progress needed for the structure to be built.

## structureTypestring

One of the `STRUCTURE_*` constants.

## remove()



Remove the construction site.

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this construction site, and it's not in your room. |
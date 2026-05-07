An energy source object. Can be harvested by creeps with a `WORK` body part.
| **Energy amount** | 4000 in center rooms
3000 in an owned or reserved room
1500 in an unreserved room |
| --- | --- |
| **Energy regeneration** | Every 300 game ticks |

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

## energynumber

The remaining amount of energy.

## energyCapacitynumber

The total amount of energy in the source.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## ticksToRegenerationnumber

The remaining time after which the source will be refilled.
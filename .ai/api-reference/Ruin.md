A destroyed structure. This is a walkable object.
| **Decay** | 500 ticks except some special cases |
| --- | --- |

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

## destroyTimenumber

The time when the structure has been destroyed.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## store[Store](#Store)

A [`Store`](#Store) object that contains resources of this structure.

## structure[Structure](#Structure) | [OwnedStructure](#OwnedStructure)

An object containing basic data of the destroyed structure.

## ticksToDecaynumber

The amount of game ticks before this ruin decays.
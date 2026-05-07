A mineral deposit. Can be harvested by creeps with a `WORK` body part using the extractor structure.
Learn more about minerals from [this article](/resources.html).
| **Regeneration amount** | `DENSITY_LOW`: 15,000
`DENSITY_MODERATE`: 35,000
`DENSITY_HIGH`: 70,000
`DENSITY_ULTRA`: 100,000 |
| --- | --- |
| **Regeneration time** | 50,000 ticks |
| **Density change probability** | `DENSITY_LOW`: 100% chance
`DENSITY_MODERATE`: 5% chance
`DENSITY_HIGH`: 5% chance
`DENSITY_ULTRA`: 100% chance |

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


## densitynumber

The density that this mineral deposit will be refilled to once `ticksToRegeneration` reaches 0. This is one of the `DENSITY_*` constants.

## mineralAmountnumber

The remaining amount of resources.

## mineralTypestring

The resource type, one of the `RESOURCE_*` constants.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## ticksToRegenerationnumber

The remaining time after which the deposit will be refilled.
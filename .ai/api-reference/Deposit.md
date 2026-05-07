A rare resource deposit needed for producing commodities. Can be harvested by creeps with a `WORK` body part.
Each harvest operation triggers a cooldown period, which becomes longer and longer over time.
Learn more about deposits from [this article](/resources.html).
| **Cooldown** | `0.001 * totalHarvested ^ 1.2` |  |
| --- | --- | --- |
| **Decay** | 50,000 ticks after appearing or last harvest operation |

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

## cooldownnumber

The amount of game ticks until the next harvest action is possible.

## depositTypestring

The deposit type, one of the following constants:

```js
RESOURCE_MIST
RESOURCE_BIOMASS
RESOURCE_METAL
RESOURCE_SILICON
```

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## lastCooldownnumber

The cooldown of the last harvest operation on this deposit.

## ticksToDecaynumber

The amount of game ticks when this deposit will disappear.
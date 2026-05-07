A nuke landing position. This object cannot be removed or modified. You can find incoming nukes in the room using the `FIND_NUKES` constant.
| **Landing time** | 50,000 ticks |
| --- | --- |
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

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## launchRoomNamestring

The name of the room where this nuke has been launched from.

## timeToLandnumber

The remaining landing time.
This NPC structure is a control center of NPC Strongholds, and also rules all invaders in the sector. It spawns NPC defenders of the stronghold, refill towers, repairs structures.
While it's alive, it will spawn invaders in all rooms in the same sector. It also contains some valuable resources inside, which you can loot from its ruin if you destroy the structure.
An Invader Core has two lifetime stages: deploy stage and active stage. When it appears in a random room in the sector, it has `ticksToDeploy` property,
public ramparts around it, and doesn't perform any actions. While in this stage it's invulnerable to attacks (has `EFFECT_INVULNERABILITY` enabled). When the `ticksToDeploy` timer is over, it spawns structures around it and starts
spawning creeps, becomes vulnerable, and receives `EFFECT_COLLAPSE_TIMER` which will remove the stronghold when this timer is over.
An active Invader Core spawns level-0 Invader Cores in neutral neighbor rooms inside the sector. These lesser Invader Cores are spawned
near the room controller and don't perform any activity except reserving/attacking the controller. One Invader Core can spawn up to 42 lesser Cores
during its lifetime.
| **Hits** | 100,000 |
| --- | --- |
| **Deploy time** | 5,000 ticks |
| **Active time** | 75,000 ticks with 10% random variation |
| **Lesser cores spawn interval** | **Stronghold level 1**: 4000 ticks**             Stronghold level 2**: 3500 ticks**             Stronghold level 3**: 3000 ticks**             Stronghold level 4**: 2500 ticks**             Stronghold level 5**: 2000 ticks
|

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

## levelnumber

The level of the stronghold. The amount and quality of the loot depends on the level.

## ticksToDeploynumber

Shows the timer for a not yet deployed stronghold, undefined otherwise.

## spawning[StructureSpawn.Spawning](#StructureSpawn-Spawning)

If the core is in process of spawning a new creep, this object will contain a [`StructureSpawn.Spawning`](#StructureSpawn-Spawning) object, or null otherwise.
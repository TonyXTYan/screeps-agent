Produces trade commodities from base minerals and other commodities. Learn more about commodities from [this article](/resources.html#Commodities).
| **Controller level** |
| --- |
| 1-6 | — |
| 7-8 | 1 factory |
| **Cost** | 100,000 |
| **Hits** | 1000 |
| **Capacity** | 50,000 |
| **Production cooldown** | Depends on the resource |

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

The amount of game ticks the factory has to wait until the next production is possible.

## levelnumber

```js
if(!factory.level) {
Game.powerCreeps['MyOperator1'].usePower(PWR_OPERATE_FACTORY, factory);
}
```
The factory's level. Can be set by applying the `PWR_OPERATE_FACTORY` power to a newly built factory.
Once set, the level cannot be changed.

## store[Store](#Store)

A [`Store`](#Store) object that contains cargo of this structure.

## storeCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`.store.getCapacity()`](#Store.getCapacity).

## produce(resourceType)



```js
factory.produce(RESOURCE_UTRIUM_BAR);
```
Produces the specified commodity. All ingredients should be available in the factory store.
| parameter | type | description |
| --- | --- | --- |
| `resourceType` | string | One of the `RESOURCE_*` constants. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_BUSY` | -4 | The factory is not operated by the `PWR_OPERATE_FACTORY` power. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The structure does not have the required amount of resources. |
| `ERR_INVALID_TARGET` | -7 | The factory cannot produce the commodity of this level. |
| `ERR_FULL` | -8 | The factory cannot contain the produce. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are incorrect. |
| `ERR_TIRED` | -11 | The factory is still cooling down. |
| `ERR_RCL_NOT_ENOUGH` | -14 | Your Room Controller level is insufficient to use the factory. |
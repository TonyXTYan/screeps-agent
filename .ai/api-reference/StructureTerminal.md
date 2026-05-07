Sends any resources to a Terminal in another room. The destination Terminal can belong to any player.
Each transaction requires additional energy (regardless of the transfer resource type) that can be
calculated using [`Game.market.calcTransactionCost`](#Game.market.calcTransactionCost) method.
For example, sending 1000 mineral units from W0N0 to W10N5 will consume 742 energy units.
You can track your incoming and outgoing transactions using the [`Game.market`](#Game.market) object.
Only one Terminal per room is allowed that can be addressed by [`Room.terminal`](#Room.terminal) property.
Terminals are used in the [Market system](/market.html).
| **Controller level** |
| --- |
| 1-5 | — |
| 6-8 | 1 terminal |
| **Cost** | 100,000 |
| **Hits** | 3,000 |
| **Capacity** | 300,000 |
| **Cooldown on send** | 10 ticks |


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

The remaining amount of ticks while this terminal cannot be used to make [`StructureTerminal.send`](#StructureTerminal.send) or [`Game.market.deal`](#Game.market.deal) calls.

## store[Store](#Store)

A [`Store`](#Store) object that contains cargo of this structure.

## storeCapacitynumber
This property is deprecated and will be removed soon.

An alias for [`.store.getCapacity()`](#Store.getCapacity).

## send(resourceType, amount, destination, [description])



```js
Game.rooms['W1N1'].terminal.send(RESOURCE_UTRIUM, 100, 'W2N3',
'trade contract #1');
```
Sends resource to a Terminal in another room with the specified name.
| parameter | type | description |
| --- | --- | --- |
| `resourceType` | string | One of the `RESOURCE_*` constants. |
| `amount` | number | The amount of resources to be sent. |
| `destination` | string | The name of the target room. You don't have to gain visibility in this room. |
| `description`
*optional* | string | The description of the transaction. It is visible to the recipient. The maximum length is 100 characters. |

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this structure. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | The structure does not have the required amount of resources. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are incorrect. |
| `ERR_TIRED` | -11 | The terminal is still cooling down. |
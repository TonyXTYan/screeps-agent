A flag. Flags can be used to mark particular spots in a room. Flags are visible to their owners only. You cannot have more than 10,000 flags.

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

## colornumber

Flag primary color. One of the `COLOR_*` constants.

## memoryany

A shorthand to `Memory.flags[flag.name]`. You can use it for quick access the flag's specific memory data object.

## namestring

Flag’s name. You can choose the name while creating a new flag, and it cannot be changed later. This name is a hash key to access the flag via the [Game.flags](#Game.flags) object. The maximum name length is 100 charactes.

## secondaryColornumber

Flag secondary color. One of the `COLOR_*` constants.

## remove()



Remove the flag.

### [](#Return-value)Return value
Always returns
OK
.

## setColor(color, [secondaryColor])



```js
Game.flags.Flag1.setColor(COLOR_GREEN, COLOR_WHITE);
```
Set new color of the flag.
| parameter | type | description |
| --- | --- | --- |
| `color` | number | Primary color of the flag. One of the `COLOR_*` constants. |
| `secondaryColor`
*optional* | number | Secondary color of the flag. One of the `COLOR_*` constants. |

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_INVALID_ARGS` | -10 | `color` or `secondaryColor` is not a valid color constant. |

## setPosition(x,y)
(pos)



```js
Game.flags.Flag1.setPosition(10,20);
```

```js
Game.flags.Flag1.setPosition( new RoomPosition(10, 20, 'W3S5') );
```
Set new position of the flag.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X position in the room. |
| `y` | number | The Y position in the room. |
| `pos` | object | Can be a [RoomPosition](#RoomPosition) object or any object containing [RoomPosition](#RoomPosition). |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_INVALID_TARGET` | -7 | The target provided is invalid. |
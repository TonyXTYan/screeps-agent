Details of the creep being spawned currently that can be addressed by the [`StructureSpawn.spawning`](#StructureSpawn.spawning) property.

## directionsarray

An array with the spawn directions, see [`StructureSpawn.Spawning.setDirections`](#StructureSpawn.Spawning.setDirections).

## namestring

The name of a new creep.

## needTimenumber

Time needed in total to complete the spawning.

## remainingTimenumber

Remaining time to go.

## spawn[StructureSpawn](#StructureSpawn)

A link to the spawn.

## cancel()



```js
Game.spawns['Spawn1'].spawning.cancel();
```
Cancel spawning immediately. Energy spent on spawning is not returned.

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn. |

## setDirections(directions)



```js
Game.spawns['Spawn1'].spawning.setDirections([RIGHT, TOP_RIGHT]);
```
Set desired directions where the creep should move when spawned.
| parameter | type | description |
| --- | --- | --- |
| `directions` | array<number> | An array with the direction constants:     - `TOP`
- `TOP_RIGHT`
- `RIGHT`
- `BOTTOM_RIGHT`
- `BOTTOM`
- `BOTTOM_LEFT`
- `LEFT`
- `TOP_LEFT`
|

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of this spawn. |
| `ERR_INVALID_ARGS` | -10 | The directions is array is invalid. |
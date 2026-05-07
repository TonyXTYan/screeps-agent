Container for custom navigation cost data. By default `PathFinder` will only consider
terrain data (plain, swamp, wall) — if you need to route around obstacles such as buildings
or creeps you must put them into a `CostMatrix`. Generally you will create your `CostMatrix`
from within `roomCallback`. If a non-0 value is found in a room's CostMatrix then that value
will be used instead of the default terrain cost. You should avoid using large values in your
CostMatrix and terrain cost flags. For example, running `PathFinder.search` with
`{ plainCost: 1, swampCost: 5 }` is faster than running it with `{plainCost: 2, swampCost: 10 }`
even though your paths will be the same.

## constructor()



```js
let costs = new PathFinder.CostMatrix;
```
Creates a new CostMatrix containing 0's for all positions.

## set(x, y, cost)



```js
let costs = new PathFinder.CostMatrix;
let pos = Game.spawns['Spawn1'].pos;
costs.set(pos.x, pos.y, 255); // Can't walk over a building
```
Set the cost of a position in this CostMatrix.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |
| `cost` | number | Cost of this position. Must be a whole number. A cost of 0 will use the terrain cost for that tile. A cost greater than or equal to 255 will be treated as unwalkable. |

## get(x, y)



Get the cost of a position in this CostMatrix.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | X position in the room. |
| `y` | number | Y position in the room. |

## clone()



Copy this CostMatrix into a new CostMatrix with the same data.

### [](#Return-value)Return value
A new CostMatrix instance.

## serialize()



```js
let costs = new PathFinder.CostMatrix;
Memory.savedMatrix = costs.serialize();
```
Returns a compact representation of this CostMatrix which can be stored via `JSON.stringify`.

### [](#Return-value-1)Return value
An array of numbers. There's not much you can do with the numbers besides store them for later.

## PathFinder.CostMatrix.deserialize(val)



```js
let costs = PathFinder.CostMatrix.deserialize(Memory.savedMatrix)
```
Static method which deserializes a new CostMatrix using the return value of `serialize`.
| parameter | type | description |
| --- | --- | --- |
| `val` | object | Whatever `serialize` returned |

### [](#Return-value-2)Return value
Returns new
`CostMatrix`
instance.
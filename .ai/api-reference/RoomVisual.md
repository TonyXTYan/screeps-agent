Room visuals provide a way to show various visual debug info in game rooms.
You can use the `RoomVisual` object to draw simple shapes that are visible only to you.
Every existing `Room` object already contains the
[`visual`](#Room.visual) property,
but you also can create new `RoomVisual` objects for any room (even without visibility)
using the [constructor](#RoomVisual.constructor).
Room visuals are not stored in the database, their only purpose is to display something in
your browser. All drawings will persist for one tick and will disappear if not updated. All
`RoomVisual` API calls have no added CPU cost (their cost is natural and mostly related to simple
`JSON.serialize` calls). However, there is a usage limit: you cannot post more than 500 KB
of serialized data per one room (see [`getSize`](#RoomVisual.getSize) method).
All draw coordinates are measured in game coordinates and centered to tile centers, i.e. (10,10)
will point to the center of the creep at `x:10; y:10` position. Fractional coordinates are allowed.

## constructor([roomName])



```js
Game.rooms['W10N10'].visual.circle(10,20).line(0,0,10,20);
// the same as:
new RoomVisual('W10N10').circle(10,20).line(0,0,10,20);
```

```js
// this text will be displayed in all rooms
new RoomVisual().text('Some text', 1, 1, {align: 'left'});
```
You can directly create new `RoomVisual` object in any room, even if it's invisible to your script.
| parameter | type | description |
| --- | --- | --- |
| `roomName`
*optional* | string | The room name. If undefined, visuals will be posted to all rooms simultaneously. |

## roomNamestring

The name of the room.

## line(x1, y1, x2, y2, [style])
(pos1, pos2, [style])



```js
new RoomVisual('W1N1').line(10,15, 20,20);
```

```js
creep.room.visual.line(creep.pos, target.pos,
{color: 'red', lineStyle: 'dashed'});
```
Draw a line.
| parameter | type | description |
| --- | --- | --- |
| `x1` | number | The start X coordinate. |
| `y1` | number | The start Y coordinate. |
| `x2` | number | The finish X coordinate. |
| `y2` | number | The finish Y coordinate. |
| `pos1` | [RoomPosition](#RoomPosition) | The start position object. |
| `pos2` | [RoomPosition](#RoomPosition) | The finish position object. |
| `style`
*optional* | object | An object with the following properties: - width         number         Line width, default is 0.1.
- color         string         Line color in any web format, default is `#ffffff` (white).
- opacity         number         Opacity value, default is 0.5.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## circle(x, y, [style])
(pos, [style])



```js
new RoomVisual('W1N1').circle(10,15);
```

```js
creep.room.visual.circle(creep.pos,
{fill: 'transparent', radius: 0.55, stroke: 'red'});
```
Draw a circle.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X coordinate of the center. |
| `y` | number | The Y coordinate of the center. |
| `pos` | [RoomPosition](#RoomPosition) | The position object of the center. |
| `style`
*optional* | object | An object with the following properties: - radius         number         Circle radius, default is 0.15.
- fill         string         Fill color in any web format, default is `#ffffff` (white).
- opacity         number         Opacity value, default is 0.5.
- stroke         string         Stroke color in any web format, default is undefined (no stroke).
- strokeWidth         number         Stroke line width, default is 0.1.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-1)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## rect(x, y, width, height, [style])
(topLeftPos, width, height, [style])



```js
// 9x9 area from (2,2) to (10,10)
new RoomVisual('W1N1').rect(1.5, 1.5, 9, 9);
```

```js
// a rectangle border on creep
creep.room.visual.rect(creep.pos.x - 0.6, creep.pos.y - 0.6,
1.2, 1.2,
{fill: 'transparent', stroke: '#f00'});
```
Draw a rectangle.
| parameter | type | description |
| --- | --- | --- |
| `x` | number | The X coordinate of the top-left corner. |
| `y` | number | The Y coordinate of the top-left corner. |
| `topLeftPos` | [RoomPosition](#RoomPosition) | The position object of the top-left corner. |
| `width` | number | The width of the rectangle. |
| `height` | number | The height of the rectangle. |
| `style`
*optional* | object | An object with the following properties: - fill         string         Fill color in any web format, default is `#ffffff` (white).
- opacity         number         Opacity value, default is 0.5.
- stroke         string         Stroke color in any web format, default is undefined (no stroke).
- strokeWidth         number         Stroke line width, default is 0.1.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-2)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## poly(points, [style])



```js
const points = [];
points.push(creep1.pos);
points.push([10,15]);
points.push(new RoomPosition(20,21,'W1N1'));
new RoomVisual('W1N1').poly(points, {fill: 'aqua'});
```

```js
// visualize the path
const path = Game.rooms['W1N1'].findPath(from, to);
new RoomVisual('W1N1').poly(path, {stroke: '#fff', strokeWidth: .15,
opacity: .2, lineStyle: 'dashed'});
```
Draw a polyline.
| parameter | type | description |
| --- | --- | --- |
| `points` | array | An array of points. Every item should be either an array with 2 numbers (i.e. `[10,15]`), or a [`RoomPosition`](#RoomPosition) object. |
| `style`
*optional* | object | An object with the following properties:                     - fill                             string                             Fill color in any web format, default is `undefined` (no fill).
- opacity                             number                             Opacity value, default is 0.5.
- stroke                             string                             Stroke color in any web format, default is `#ffffff` (white).
- strokeWidth                             number                             Stroke line width, default is 0.1.
- lineStyle                             string                             Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-3)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## text(text, x, y, [style])
(text, pos, [style])



```js
new RoomVisual('W1N1').text("Target💥", 10, 15, {color: 'green', font: 0.8});
```
Draw a text label. You can use any valid Unicode characters, including [emoji](http://unicode.org/emoji/charts/emoji-style.txt).
| parameter | type | description |
| --- | --- | --- |
| `text` | string | The text message. |
| `x` | number | The X coordinate of the label baseline point. |
| `y` | number | The Y coordinate of the label baseline point. |
| `pos` | [RoomPosition](#RoomPosition) | The position object of the label baseline. |
| `style`
*optional* | object | An object with the following properties:                     - color                             string                             Font color in any web format, default is `#ffffff` (white).
- font                             number, string                             Either a number or a string in one of the following forms:                                                                      `0.7` - relative size in game coordinates
- `20px` - absolute size in pixels
- `0.7 serif`
- `bold italic 1.5 Times New Roman`
stroke                             string                             Stroke color in any web format, default is undefined (no stroke).                                                                               strokeWidth                             number                             Stroke width, default is 0.15.                                                                               backgroundColor                             string                             Background color in any web format, default is undefined (no background). When background is enabled, text vertical align is set to middle (default is baseline).                                                                               backgroundPadding                             number                             Background rectangle padding, default is 0.3.                                                                               align                             string                             Text align, either `center`, `left`, or `right`. Default is `center`.                                                                               opacity                             number                             Opacity value, default is 1.0.                                               |

### [](#Return-value-4)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## clear()



```js
new RoomVisual('W1N1').clear();
```
Remove all visuals from the room.

### [](#Return-value-5)Return value
The
`RoomVisual`
object itself, so that you can chain calls.

## getSize()



```js
if(creep.room.visual.getSize() >= 512000) {
// cannot add more visuals in this tick
}
```
Get the stored size of all visuals added in the room in the current tick. It must not exceed 512,000 (500 KB).

### [](#Return-value-6)Return value
The size of the visuals in bytes.

## export()



```js
Memory.RoomVisualData['E2S7'] = Game.rooms.E2S7.visual.export();
```
Returns a compact representation of all visuals added in the room in the current tick.

### [](#Return-value-7)Return value
A string with visuals data. There's not much you can do with the string besides store them for later.

## import(val)



```js
if(Memory.RoomVisualData['E2S7']) {
Game.rooms.E2S7.visual.import(Memory.RoomVisualData['E2S7']);
}
```
Add previously exported (with [RoomVisual.export](#RoomVisual.export)) room visuals to the room visual data of the current tick.
| parameter | type | description |
| --- | --- | --- |
| `val` | string | The string returned from RoomVisual.export. |

### [](#Return-value-8)Return value
The `RoomVisual` object itself, so that you can chain calls.
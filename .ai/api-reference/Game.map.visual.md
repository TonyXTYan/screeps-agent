Map visuals provide a way to show various visual debug info on the game map. You can use the `Game.map.visual` object to draw simple shapes that are visible only to you.
Map visuals are not stored in the database, their only purpose is to display something in your browser. All drawings will persist for one tick and will disappear if not updated. All `Game.map.visual` calls have no added CPU cost (their cost is natural and mostly related to simple `JSON.serialize` calls). However, there is a usage limit: you cannot post more than 1000 KB of serialized data.
All draw coordinates are measured in global game coordinates ([`RoomPosition`](#RoomPosition)).

## line(pos1, pos2, [style])



```js
Game.map.visual.line(creep.pos, target.pos,
{color: '#ff0000', lineStyle: 'dashed'});
```
Draw a line.
| parameter | type | description |
| --- | --- | --- |
| `pos1` | [RoomPosition](#RoomPosition) | The start position object. |
| `pos2` | [RoomPosition](#RoomPosition) | The finish position object. |
| `style`
*optional* | object | An object with the following properties: - width         number         Line width, default is 0.1.
- color         string         Line color in the following format: `#ffffff` (hex triplet). Default is #ffffff.
- opacity         number         Opacity value, default is 0.5.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value)Return value
The `MapVisual` object itself, so that you can chain calls.

## circle(pos, [style])



```js
Game.map.visual.circle(new RoomPosition(25,25,'E2S7'));
```

```js
Game.map.visual.circle(nuker.pos, {fill: 'transparent', radius: NUKE_RANGE*50, stroke: '#ff0000'});
```
Draw a circle.
| parameter | type | description |
| --- | --- | --- |
| `pos` | [RoomPosition](#RoomPosition) | The position object of the center. |
| `style`
*optional* | object | An object with the following properties: - radius         number         Circle radius, default is 10.
- fill         string         Fill color in the following format: `#ffffff` (hex triplet). Default is #ffffff.
- opacity         number         Opacity value, default is 0.5.
- stroke         string         Stroke color in the following format: `#ffffff` (hex triplet). Default is undefined (no stroke).
- strokeWidth         number         Stroke line width, default is 0.5.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-1)Return value
The `MapVisual` object itself, so that you can chain calls.

## rect(topLeftPos, width, height, [style])



```js
// the max efficiency area of the tower
Game.map.visual.rect(new RoomPosition(tower.pos.x - 5, tower.pos.y - 5, tower.pos.roomName),
11, 11,
{fill: 'transparent', stroke: '#ff0000'});
```
Draw a rectangle.
| parameter | type | description |
| --- | --- | --- |
| `topLeftPos` | [RoomPosition](#RoomPosition) | The position object of the top-left corner. |
| `width` | number | The width of the rectangle. |
| `height` | number | The height of the rectangle. |
| `style`
*optional* | object | An object with the following properties: - fill         string         Fill color in the following format: `#ffffff` (hex triplet). Default is #ffffff.
- opacity         number         Opacity value, default is 0.5.
- stroke         string         Stroke color in the following format: `#ffffff` (hex triplet). Default is undefined (no stroke).
- strokeWidth         number         Stroke line width, default is 0.5.
- lineStyle         string         Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-2)Return value
The `MapVisual` object itself, so that you can chain calls.

## poly(points, [style])



```js
const points = [];
points.push(creep1.pos);
points.push(Game.rooms.E2S7.storage.pos);
points.push(new RoomPosition(20,21,'W1N1'));
Game.map.visual.poly(points, {fill: 'aqua'});
```

```js
// visualize the path
const path = PathFinder.search(creep.pos, creep.room.storage.pos).path;
Game.map.visual.poly(path, {stroke: '#ffffff', strokeWidth: .8, opacity: .2, lineStyle: 'dashed'});
```
Draw a polyline.
| parameter | type | description |
| --- | --- | --- |
| `points` | array | An array of points. Every item should be a [`RoomPosition`](#RoomPosition) object. |
| `style`
*optional* | object | An object with the following properties:                     - fill                             string                             Fill color in the following format: `#ffffff` (hex triplet). Default is `undefined` (no fill).
- opacity                             number                             Opacity value, default is 0.5.
- stroke                             string                             Stroke color in the following format: `#ffffff` (hex triplet). Default is #ffffff.
- strokeWidth                             number                             Stroke line width, default is 0.5.
- lineStyle                             string                             Either `undefined` (solid line), `dashed`, or `dotted`. Default is undefined.
|

### [](#Return-value-3)Return value
The `MapVisual` object itself, so that you can chain calls.

## text(text, pos, [style])



```js
Game.map.visual.text("Target💥", new RoomPosition(11,14,'E2S7'), {color: '#FF0000', fontSize: 10});
```
Draw a text label. You can use any valid Unicode characters, including [emoji](http://unicode.org/emoji/charts/emoji-style.txt).
| parameter | type | description |
| --- | --- | --- |
| `text` | string | The text message. |
| `pos` | [RoomPosition](#RoomPosition) | The position object of the label baseline. |
| `style`
*optional* | object | An object with the following properties:                     - color                             string                             Font color in the following format: `#ffffff` (hex triplet). Default is #ffffff.
- fontFamily                             string                             The font family, default is `sans-serif`
- fontSize                             number                             The font size in game coordinates, default is 10
- fontStyle                             string                             The font style ('normal', 'italic' or 'oblique')
- fontVariant                             string                             The font variant ('normal' or 'small-caps')
- stroke                             string                             Stroke color in the following format: `#ffffff` (hex triplet). Default is undefined (no stroke).
- strokeWidth                             number                             Stroke width, default is 0.15.
- backgroundColor                             string                             Background color in the following format: `#ffffff` (hex triplet). Default is undefined (no background). When background is enabled, text vertical align is set to middle (default is baseline).
- backgroundPadding                             number                             Background rectangle padding, default is 2.
- align                             string                             Text align, either `center`, `left`, or `right`. Default is `center`.
- opacity                             number                             Opacity value, default is 0.5.
|

### [](#Return-value-4)Return value
The `MapVisual` object itself, so that you can chain calls.

## clear()



```js
Game.map.visual.clear();
```
Remove all visuals from the map.

### [](#Return-value-5)Return value
The `MapVisual` object itself, so that you can chain calls.

## getSize()



```js
if(Game.map.visual.getSize() >= 1024000) {
// cannot add more visuals in this tick
}
```
Get the stored size of all visuals added on the map in the current tick. It must not exceed 1024,000 (1000 KB).

### [](#Return-value-6)Return value
The size of the visuals in bytes.

## export()



```js
Memory.MapVisualData = Game.map.visual.export();
```
Returns a compact representation of all visuals added on the map in the current tick.

### [](#Return-value-7)Return value
A string with visuals data. There's not much you can do with the string besides store them for later.

## import(val)



```js
Game.map.visual.import(Memory.MapVisualData);
```
Add previously exported (with [Game.map.visual.export](#Game.map-visual.export)) map visuals to the map visual data of the current tick.
| parameter | type | description |
| --- | --- | --- |
| `val` | string | The string returned from Game.map.visual.export. |

### [](#Return-value-8)Return value
The `MapVisual` object itself, so that you can chain calls.
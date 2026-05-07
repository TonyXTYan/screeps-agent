RawMemory object allows to implement your own memory stringifier instead of built-in serializer
based on `JSON.stringify`. It also allows to request up to 10 MB of additional memory
using asynchronous memory segments feature.
You can also access memory segments of other players using methods below.

## RawMemory.segmentsobject

```js
RawMemory.setActiveSegments([0,3]);
// on the next tick
console.log(RawMemory.segments[0]);
console.log(RawMemory.segments[3]);
RawMemory.segments[3] = '{"foo": "bar", "counter": 15}';
```
An object with asynchronous memory segments available on this tick. Each object key is the segment ID with data in string values. Use [`setActiveSegments`](#RawMemory.setActiveSegments) to fetch segments on the next tick. Segments data is saved automatically in the end of the tick. The maximum size per segment is 100 KB.

## RawMemory.foreignSegmentobject

```js
RawMemory.setActiveForeignSegment('player');
// on the next tick
console.log(RawMemory.foreignSegment);
// --> {"username": "player", "id": 40, "data": "Hello!"}
```
An object with a memory segment of another player available on this tick. Use [`setActiveForeignSegment`](#RawMemory.setActiveForeignSegment) to fetch segments on the next tick.
The object consists of the following properties:
| parameter | type | description |
| --- | --- | --- |
| `username` | string | Another player's name. |
| `id` | number | The ID of the requested memory segment. |
| `data` | string | The segment contents. |

## RawMemory.interShardSegmentstring
This property is deprecated and will be removed soon. Please use [`InterShardMemory`](#InterShardMemory) instead.

```js
RawMemory.interShardSegment = JSON.stringify({
creeps: {
Bob: {role: 'claimer'}
}
});

// on another shard
var interShardData = JSON.parse(RawMemory.interShardSegment);
if(interShardData.creeps[creep.name]) {
creep.memory = interShardData[creep.name];
delete interShardData.creeps[creep.name];
}
RawMemory.interShardSegment = JSON.stringify(interShardData);
```
A string with a shared memory segment available on every world shard. Maximum string length is 100 KB.
**Warning:** this segment is not safe for concurrent usage! All shards have shared access to the same instance of data.
When the segment contents is changed by two shards simultaneously, you may lose some data, since the segment string
value is written all at once atomically. You must implement your own system to determine when each shard is allowed to
rewrite the inter-shard memory, e.g. based on [mutual exclusions](https://en.wikipedia.org/wiki/Mutual_exclusion).

## RawMemory.get()



```js
const myMemory = JSON.parse(RawMemory.get());
```
Get a raw string representation of the `Memory` object.

### [](#Return-value)Return value
Returns a string value.

## RawMemory.set(value)



```js
RawMemory.set(JSON.stringify(myMemory));
```
Set new `Memory` value.
| parameter | type | description |
| --- | --- | --- |
| `value` | string | New memory value as a string. |

## RawMemory.setActiveSegments(ids)



```js
RawMemory.setActiveSegments([0,3]);
```
Request memory segments using the list of their IDs. Memory segments will become available on the next tick in [`segments`](#RawMemory.segments) object.
| parameter | type | description |
| --- | --- | --- |
| `ids` | array | An array of segment IDs. Each ID should be a number from 0 to 99. Maximum 10 segments can be active at the same time. Subsequent calls of `setActiveSegments` override previous ones. |

## RawMemory.setActiveForeignSegment(username, [id])



```js
RawMemory.setActiveForeignSegment('player');
```

```js
RawMemory.setActiveForeignSegment('player', 10);
```

```js
RawMemory.setActiveForeignSegment(null);
```
Request a memory segment of another user. The segment should be marked by its owner as public using [`setPublicSegments`](#RawMemory.setPublicSegments).
The segment data will become available on the next tick in [`foreignSegment`](#RawMemory.foreignSegment) object.
You can only have access to one foreign segment at the same time.
| parameter | type | description |
| --- | --- | --- |
| `username` | string | null | The name of another user. Pass `null` to clear the foreign segment. |
| `id`
*optional* | number | The ID of the requested segment from 0 to 99. If undefined, the user's default public segment is requested as set by [`setDefaultPublicSegment`](#RawMemory.setDefaultPublicSegment). |

## RawMemory.setDefaultPublicSegment(id)



```js
RawMemory.setPublicSegments([5,20,21]);
RawMemory.setDefaultPublicSegment(5);
```

```js
RawMemory.setDefaultPublicSegment(null);
```
Set the specified segment as your default public segment. It will be returned if no `id` parameter is passed to [`setActiveForeignSegment`](#RawMemory.setActiveForeignSegment) by another user.
| parameter | type | description |
| --- | --- | --- |
| `id` | number | null | The ID of the memory segment from 0 to 99. Pass `null` to remove your default public segment. |

## RawMemory.setPublicSegments(ids)



```js
RawMemory.setPublicSegments([5,3]);
```

```js
RawMemory.setPublicSegments([]);
```
Set specified segments as public. Other users will be able to request access to them using [`setActiveForeignSegment`](#RawMemory.setActiveForeignSegment).
| parameter | type | description |
| --- | --- | --- |
| `ids` | array | An array of segment IDs. Each ID should be a number from 0 to 99. Subsequent calls of `setPublicSegments` override previous ones. |
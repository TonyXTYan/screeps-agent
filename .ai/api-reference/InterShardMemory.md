`InterShardMemory` object provides an interface for communicating between shards. Your script is executed separatedly
on each shard, and their [`Memory`](#Memory) objects are isolated from each other. In order to pass messages and
data between shards, you need to use `InterShardMemory` instead.
Every shard can have its own 100 KB of data in string format that can be accessed by all other shards.
A shard can write only to its own data, other shards' data is read-only.
This data has nothing to do with `Memory` contents, it's a separate data container.

## InterShardMemory.getLocal()



Returns the string contents of the current shard's data.

## InterShardMemory.setLocal(value)



```js
var data = JSON.parse(InterShardMemory.getLocal() || "{}");
data.message = "hello from another shard!";
InterShardMemory.setLocal(JSON.stringify(data));
```
Replace the current shard's data with the new value.
| parameter | type | description |
| --- | --- | --- |
| `value` | string | New data value in string format. |

## InterShardMemory.getRemote(shard)



```js
var data = JSON.parse(InterShardMemory.getRemote('shard0') || "{}");
console.log(data.message);
```
Returns the string contents of another shard's data.
| parameter | type | description |
| --- | --- | --- |
| `shard` | string | Shard name. |
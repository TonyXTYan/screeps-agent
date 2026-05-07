A global object containing information about your CPU usage.

## Game.cpu.limitnumber

Your assigned CPU limit for the current shard.

## Game.cpu.tickLimitnumber

An amount of available CPU time at the current game tick. Usually it is higher than `Game.cpu.limit`. [Learn more](/cpu-limit.html)

## Game.cpu.bucketnumber

An amount of unused CPU accumulated in your [bucket](/cpu-limit.html#Bucket).

## Game.cpu.shardLimitsobject<string,number>

An object with limits for each shard with shard names as keys. You can use [`setShardLimits`](#Game.cpu.setShardLimits) method to re-assign them.

## Game.cpu.unlockedboolean

Whether full CPU is currently unlocked for your account.

## Game.cpu.unlockedTimenumber

The time [in milliseconds since UNIX epoch time](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime#Syntax) until full CPU is unlocked for your account. This property is not defined when full CPU is not unlocked for your account or it's unlocked with a subscription.

## Game.cpu.getHeapStatistics()



```js
let heap = Game.cpu.getHeapStatistics();
console.log(`Used ${heap.total_heap_size} / ${heap.heap_size_limit}`);
```
Use this method to get heap statistics for your virtual machine. The return value is almost identical to the Node.js function [`v8.getHeapStatistics()`](https://nodejs.org/dist/latest-v8.x/docs/api/v8.html#v8_v8_getheapstatistics). This function returns one additional property: `externally_allocated_size` which is the total amount of currently allocated memory which is not included in the v8 heap but counts against this isolate's memory limit. `ArrayBuffer` instances over a certain size are externally allocated and will be counted here.

### [](#Return-value)Return value
Returns an objects with heap statistics in the following format:

```js
{
"total_heap_size": 29085696,
"total_heap_size_executable": 3670016,
"total_physical_size": 26447928,
"total_available_size": 319649520,
"used_heap_size": 17493824,
"heap_size_limit": 343932928,
"malloced_memory": 8192,
"peak_malloced_memory": 1060096,
"does_zap_garbage": 0,
"externally_allocated_size": 38430000
}
```

## Game.cpu.getUsed()



```js
if(Game.cpu.getUsed() > Game.cpu.tickLimit / 2) {
console.log("Used half of CPU already!");
}
```

```js
for(const name in Game.creeps) {
const startCpu = Game.cpu.getUsed();

// creep logic goes here

const elapsed = Game.cpu.getUsed() - startCpu;
console.log('Creep '+name+' has used '+elapsed+' CPU time');
}
```
Get amount of CPU time used from the beginning of the current game tick. Always returns 0 in the Simulation mode.

### [](#Return-value-1)Return value
Returns currently used CPU time as a float number.

## Game.cpu.halt()



```js
Game.cpu.halt();
```
Reset your runtime environment and wipe all data in heap memory.

## Game.cpu.setShardLimits(limits)



```js
Game.cpu.setShardLimits({shard0: 20, shard1: 10});
```
Allocate CPU limits to different shards. Total amount of CPU should remain equal to
[`Game.cpu.shardLimits`](#Game.cpu.shardLimits). This method can be used only once per 12 hours.
| parameter | type | description |
| --- | --- | --- |
| `limits` | object<string, number> | An object with CPU values for each shard in the same format as `Game.cpu.shardLimits`. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_BUSY` | -4 | 12-hours cooldown period is not over yet. |
| `ERR_INVALID_ARGS` | -10 | The argument is not a valid shard limits object. |

## Game.cpu.unlock()



```js
if(Game.cpu.unlockedTime && ((Game.cpu.unlockedTime - Date.now())  1000*60*60*24)) {
Game.cpu.unlock();
}
```
Unlock full CPU for your account for additional 24 hours. This method will consume 1 CPU unlock bound to your account (See [`Game.resources`](#Game.resources)).
If full CPU is not currently unlocked for your account, it may take some time (up to 5 minutes) before unlock is applied to your account.

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | Your account does not have enough `cpuUnlock` resource. |
| `ERR_FULL` | -8 | Your CPU is unlocked with a subscription. |

## Game.cpu.generatePixel()



```js
if(Game.cpu.bucket == 10000) {
Game.cpu.generatePixel();
}
```
Generate 1 pixel resource unit for 10000 CPU from your bucket.

### [](#Return-value-4)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | Your bucket does not have enough CPU. |
An object describing the world shard where your script is currently being executed in.

## Game.shard.namestring

The name of the shard.

## Game.shard.typestring

Currently always equals to `normal`.

## Game.shard.ptrboolean

Whether this shard belongs to the [PTR](/ptr.html).

## Game.shard.accessboolean

Whether you currently have access to this shard. Always `true` on non-restricted shards. On restricted shards, requires either an active [`ACCESS_KEY`](#Constants) resource or an unlimited access subscription. Use [`Game.shard.activateAccess`](#Game.shard.activateAccess) to activate access.

## Game.shard.accessTimenumber

The time [in milliseconds since UNIX epoch time](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime#Syntax) until access to this restricted shard is active. This property is not defined when access is unlimited or when access is not currently active.

## Game.shard.activateAccess()



```js
if(Game.shard.access && Game.shard.accessTime && ((Game.shard.accessTime - Date.now())  1000*60*60*24*7)) {
Game.shard.activateAccess();
}
```
Activate access to the current restricted shard for additional 30 days. This method will consume 1 [`ACCESS_KEY`](#Constants) resource bound to your account (See [`Game.resources`](#Game.resources)). This method is only available on restricted shards (when `Game.shard.access` is defined).

### [](#Return-value)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | Your account does not have enough `accessKey` resource. |
| `ERR_INVALID_TARGET` | -7 | This shard is not restricted. |
| `ERR_FULL` | -8 | Your access is unlimited. |
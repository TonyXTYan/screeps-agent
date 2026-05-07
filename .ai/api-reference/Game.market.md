A global object representing the in-game market. You can use this object to track resource transactions to/from your terminals, and your buy/sell orders.
Learn more about the market system from [this article](/market.html).

## Game.market.creditsnumber

Your current credits balance.

## Game.market.incomingTransactionsarray

```js
[{
transactionId : "56dec546a180ce641dd65960",
time : 10390687,
sender : {username: "Sender"},
recipient : {username: "Me"},
resourceType : "U",
amount : 100,
from : "W0N0",
to : "W10N10",
description : "trade contract #1",
order: {        // optional
id : "55c34a6b5be41a0a6e80c68b",
type : "sell",
price : 2.95
}
}]
```
An array of the last 100 incoming transactions to your terminals with the following format:

## Game.market.outgoingTransactionsarray

```js
[{
transactionId : "56dec546a180ce641dd65960",
time : 10390687,
sender : {username: "Me"},
recipient : {username: "Recipient"},
resourceType : "U",
amount : 100,
from : "W0N0",
to : "W10N10",
description : "trade contract #1",
order: {        // optional
id : "55c34a6b5be41a0a6e80c68b",
type : "sell",
price : 2.95
}
}]
```
An array of the last 100 outgoing transactions from your terminals with the following format:

## Game.market.ordersobject

```js
{
"55c34a6b5be41a0a6e80c68b": {
id : "55c34a6b5be41a0a6e80c68b",
created : 13131117,
active: true,
type : "sell"
resourceType : "OH",
roomName : "W1N1",
amount : 15821,
remainingAmount : 30000,
totalAmount : 50000,
price : 2.95
},
"55c34a6b52411a0a6e80693a": {
id : "55c34a6b52411a0a6e80693a",
created : 13134122,
active: true,
type : "buy"
resourceType : "energy",
roomName : "W1N1",
amount : 94000,
remainingAmount : 94000,
totalAmount : 94000
price : 0.45
},
"55c34a6b5be41a0a6e80c123": {
id : "55c34a6b5be41a0a6e80c123",
created : 13105123,
active: false,
type : "sell"
resourceType : "token",
amount : 0,
remainingAmount : 10,
totalAmount : 10,
price : 50000
}
}
```
An object with your active and inactive buy/sell orders on the market.
See
[`getAllOrders`](#getAllOrders)
for properties explanation.

## Game.market.calcTransactionCost(amount, roomName1, roomName2)



```js
const cost = Game.market.calcTransactionCost(1000, 'W0N0', 'W10N5');
// -> 284 energy units
```
Estimate the energy transaction cost of [`StructureTerminal.send`](#StructureTerminal.send) and [`Game.market.deal`](#Game.market.deal) methods.
The formula:

```js
Math.ceil( amount * ( 1 - Math.exp(-distanceBetweenRooms/30) ) )
```
| parameter | type | description |
| --- | --- | --- |
| `amount` | number | Amount of resources to be sent. |
| `roomName1` | string | The name of the first room. |
| `roomName2` | string | The name of the second room. |

### [](#Return-value)Return value
The amount of energy required to perform the transaction.

## Game.market.cancelOrder(orderId)



```js
for(const id in Game.market.orders) {
Game.market.cancelOrder(id);
}
```
Cancel a previously created order. The 5% fee is not returned.
| parameter | type | description |
| --- | --- | --- |
| `orderId` | string | The order ID as provided in `Game.market.orders`. |

### [](#Return-value-1)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_INVALID_ARGS` | -10 | The order ID is not valid. |

## Game.market.changeOrderPrice(orderId, newPrice)



```js
Game.market.changeOrderPrice('57bec1bf77f4d17c4c011960', 9.95);
```
Change the price of an existing order. If `newPrice` is greater than old price, you will be charged `(newPrice-oldPrice)*remainingAmount*0.05` credits.
| parameter | type | description |
| --- | --- | --- |
| `orderId` | string | The order ID as provided in `Game.market.orders`. |
| `newPrice` | number | The new order price. |

### [](#Return-value-2)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the room's terminal or there is no terminal. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You don't have enough credits to pay a fee. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are invalid. |

## Game.market.createOrder(params)



```js
Game.market.createOrder({
type: ORDER_SELL,
resourceType: RESOURCE_GHODIUM,
price: 9.95,
totalAmount: 10000,
roomName: "W1N1"
});
```
Create a market order in your terminal. You will be charged `price*amount*0.05` credits when the order is placed. The maximum orders count is 300 per player. You can create an order at any time with any amount, it will be automatically activated and deactivated depending on the resource/credits availability.
| parameter | type | description |
| --- | --- | --- |
| `params` | object | An object with the following params: - type         string         The order type, either `ORDER_SELL` or `ORDER_BUY`.
- resourceType         string         Either one of the `RESOURCE_*` constants or one of account-bound resources (See `INTERSHARD_RESOURCES` constant). If your Terminal doesn't have the specified resource, the order will be temporary inactive.
- price         number         The price for one resource unit in credits. Can be a decimal number.
- totalAmount         number         The amount of resources to be traded in total.
- roomName (optional)         string         The room where your order will be created. You must have your own Terminal structure in this room, otherwise the created order will be temporary inactive. This argument is not used when `resourceType` is one of account-bound resources (See `INTERSHARD_RESOURCES` constant).
|

### [](#Return-value-3)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You are not the owner of the room's terminal or there is no terminal. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You don't have enough credits to pay a fee. |
| `ERR_FULL` | -8 | You cannot create more than 50 orders. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are invalid. |

## Game.market.deal(orderId, amount, [yourRoomName])



```js
Game.market.deal('57cd2b12cda69a004ae223a3', 1000, "W1N1");
```

```js
const amountToBuy = 2000, maxTransferEnergyCost = 500;
const orders = Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_GHODIUM});

for(let i=0; iorders.length; i++) {
const transferEnergyCost = Game.market.calcTransactionCost(
amountToBuy, 'W1N1', orders[i].roomName);

if(transferEnergyCost  maxTransferEnergyCost) {
Game.market.deal(orders[i].id, amountToBuy, "W1N1");
break;
}
}
```
Execute a trade deal from your Terminal in `yourRoomName` to another player's Terminal using the specified buy/sell order. Your Terminal will be charged energy units of transfer cost regardless of the order resource type. You can use [`Game.market.calcTransactionCost`](#calcTransactionCost) method to estimate it. When multiple players try to execute the same deal, the one with the shortest distance takes precedence. You cannot execute more than 10 deals during one tick.
| parameter | type | description |
| --- | --- | --- |
| `orderId` | string | The order ID as provided in `Game.market.getAllOrders`. |
| `amount` | number | The amount of resources to transfer. |
| `yourRoomName`
*optional* | string | The name of your room which has to contain an active Terminal with enough amount of energy. This argument is not used when the order resource type is one of account-bound resources (See `INTERSHARD_RESOURCES` constant). |

### [](#Return-value-4)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_OWNER` | -1 | You don't have a terminal in the target room. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You don't have enough credits or resource units. |
| `ERR_FULL` | -8 | You cannot execute more than 10 deals during one tick. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are invalid. |
| `ERR_TIRED` | -11 | The target terminal is still cooling down. |

## Game.market.extendOrder(orderId, addAmount)



```js
Game.market.extendOrder('57bec1bf77f4d17c4c011960', 10000);
```
Add more capacity to an existing order. It will affect `remainingAmount` and `totalAmount` properties. You will be charged `price*addAmount*0.05` credits.
| parameter | type | description |
| --- | --- | --- |
| `orderId` | string | The order ID as provided in `Game.market.orders`. |
| `addAmount` | number | How much capacity to add. Cannot be a negative value. |

### [](#Return-value-5)Return value
One of the following codes:
| constant | value | description |
| --- | --- | --- |
| `OK` | 0 | The operation has been scheduled successfully. |
| `ERR_NOT_ENOUGH_RESOURCES` | -6 | You don't have enough credits to pay a fee. |
| `ERR_INVALID_ARGS` | -10 | The arguments provided are invalid. |

## Game.market.getAllOrders([filter])



```js
Game.market.getAllOrders(); // slow
```

```js
Game.market.getAllOrders({type: ORDER_SELL, resourceType: RESOURCE_GHODIUM}); // fast
```

```js
const targetRoom = "W1N1";
Game.market.getAllOrders(order => order.resourceType == RESOURCE_GHODIUM &&
order.type == ORDER_SELL &&
Game.market.calcTransactionCost(1000, targetRoom, order.roomName)  500); // slow
```

```js
// Output:

[{
id : "55c34a6b5be41a0a6e80c68b",
created : 13131117,
type : "sell",
resourceType : "OH",
roomName : "W1N1",
amount : 15821,
remainingAmount : 30000,
price : 2.95
}, {
createdTimestamp: 1543253147522,
type: "sell",
amount: 1000,
remainingAmount: 1000,
resourceType: "O",
price: 1,
roomName: "E2S7",
created: 12010056,
id: "5bfc2c9bd719fb605037c06d"
}, {
id : "55c34a6b5be41a0a6e80c123",
createdTimestamp: 1543253155580,
type : "sell",
resourceType : "token",
amount : 3,
remainingAmount : 10,
price : 50000
}]
```
Get other players' orders currently active on the market. This method supports internal indexing by `resourceType`.
| parameter | type | description |
| --- | --- | --- |
| `filter`
*optional* | object, function | An object or function that will filter the resulting list using the [`lodash.filter`](https://lodash.com/docs#filter) method. |

### [](#Return-value-6)Return value
An orders array in the following form:
| property | description |
| --- | --- |
| `id` | The unique order ID. |
| `created` | The order creation time in game ticks. This property is absent for orders of the inter-shard market. |
| `createdTimestamp` | The order creation time [in milliseconds since UNIX epoch time](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime#Syntax). This property is absent for old orders. |
| `type` | Either `ORDER_SELL` or `ORDER_BUY`. |
| `resourceType` | Either one of the `RESOURCE_*` constants or one of account-bound resources (See `INTERSHARD_RESOURCES` constant). |
| `roomName` | The room where this order is placed. |
| `amount` | Currently available amount to trade. |
| `remainingAmount` | How many resources are left to trade via this order. |
| `price` | The current price per unit. |

## Game.market.getHistory([resourceType])



Get daily price history of the specified resource on the market for the last 14 days.
| parameter | type | description |
| --- | --- | --- |
| `resourceType`
*optional* | string | One of the `RESOURCE_*` constants. If undefined, returns history data for all resources. |

### [](#Return-value-7)Return value
Returns an array of objects with the following format:

```js
[{
"resourceType": "L",
"date": "2019-06-24",
"transactions": 4,
"volume": 400,
"avgPrice": 3.63,
"stddevPrice": 0.27
}]
```

## Game.market.getOrderById(id)



```js
const order = Game.market.getOrderById('55c34a6b5be41a0a6e80c123');
```
Retrieve info for specific market order.
| parameter | type | description |
| --- | --- | --- |
| `id` | string | The order ID. |

### [](#Return-value-8)Return value
An object with the order info. See
[`getAllOrders`](#getAllOrders)
for properties explanation.
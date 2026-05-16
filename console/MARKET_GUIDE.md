# Screeps Market Console Guide

Complete reference for using the Game.market API through the Screeps console terminal.

## Quick Start

Invoke the console:
```bash
screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py
```

Then execute JavaScript commands directly to interact with the market.

## Core Concepts

- **Orders**: Buy/sell offers created by players that sit on the market
- **Deals**: Accepting someone else's order to complete a transaction
- **Credits**: Currency used for all market transactions
- **Price**: Credits per unit of the resource

## API Reference

### Properties

```javascript
Game.market.credits           // Your current credit balance
Game.market.orders            // Your active/inactive orders (object)
Game.market.incomingTransactions  // Last 100 incoming transfers
Game.market.outgoingTransactions  // Last 100 outgoing transfers
```

### Methods

#### Finding Orders
```javascript
// Get all market orders with optional filter
Game.market.getAllOrders(filter)

// Common filters:
Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})
Game.market.getAllOrders({resourceType: 'pixel', type: 'buy'})
Game.market.getAllOrders({resourceType: 'energy'})  // both buy and sell

// Get specific order by ID
Game.market.getOrderById(orderId)
```

#### Trading
```javascript
// Accept another player's order (buy from sell order or sell to buy order)
Game.market.deal(orderId, amount, yourRoomName)

// Create your own order
Game.market.createOrder({
  type: 'buy' | 'sell',
  resourceType: 'energy' | 'pixel' | 'H' | 'O' | etc,
  price: 0.5,
  totalAmount: 100000,
  roomName: 'W7N9'  // optional, defaults to nearest room
})
```

#### Order Management
```javascript
// Cancel your order (loses 5% fee)
Game.market.cancelOrder(orderId)

// Change price of your order
Game.market.changeOrderPrice(orderId, newPrice)

// Add more resources to your order
Game.market.extendOrder(orderId, addAmount)
```

#### Market Info
```javascript
// Get 14-day price history
Game.market.getHistory('energy')
// Returns: [{avgPrice, stddevPrice, min, max, stddev, volume, transactions}, ...]

// Calculate energy cost for transfers between rooms
Game.market.calcTransactionCost(amount, roomName1, roomName2)
```

## Common Workflows

### 1. Sell Pixels → Buy Energy (Direct Deal Method)

```javascript
// Find pixel buyers
const pixelBuyers = Game.market.getAllOrders({resourceType: 'pixel', type: 'buy'})

// Show best offers
pixelBuyers.slice(0, 5).forEach(o => console.log(`${o.id}: ${o.price} cr/px, ${o.amount} available`))

// Sell pixels to best buyer
Game.market.deal('BEST_ORDER_ID', 100, 'W7N9')

// Find energy sellers
const energySellers = Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})

// Show cheapest offers
energySellers.sort((a,b) => a.price - b.price).slice(0, 5).forEach(o => console.log(`${o.id}: ${o.price} cr/energy, ${o.amount} available`))

// Buy energy from cheapest seller
Game.market.deal('CHEAPEST_SELLER_ID', 100000, 'W7N9')
```

### 2. Sell Pixels → Create Energy Buy Order

```javascript
// Check credits
console.log('Credits:', Game.market.credits)

// Sell pixels to existing buyer
const pixelBuyers = Game.market.getAllOrders({resourceType: 'pixel', type: 'buy'})
Game.market.deal(pixelBuyers[0].id, 50, 'W7N9')

// Wait for credits to update, then create buy order
Game.market.createOrder({
  type: 'buy',
  resourceType: 'energy',
  price: 0.5,
  totalAmount: 100000,
  roomName: 'W7N9'
})

// Monitor your order
Game.market.orders
```

### 3. Check Market Prices

```javascript
// Get price history for energy
const energyHistory = Game.market.getHistory('energy')
const latest = energyHistory[energyHistory.length - 1]
console.log(`Energy: ${latest.avgPrice} ± ${latest.stddevPrice} cr/unit`)

// Get price history for pixels
const pixelHistory = Game.market.getHistory('pixel')
const latest2 = pixelHistory[pixelHistory.length - 1]
console.log(`Pixels: ${latest2.avgPrice} ± ${latest2.stddevPrice} cr/pixel`)

// Show all available energy sellers with prices
Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})
  .sort((a,b) => a.price - b.price)
  .forEach(o => console.log(`${o.price} cr/e: ${o.amount} available (${o.id})`))
```

### 4. Manage Your Orders

```javascript
// List your orders
console.log(Game.market.orders)

// Find a specific order
const myOrders = Object.values(Game.market.orders)
const energyOrder = myOrders.find(o => o.resourceType === 'energy' && o.type === 'buy')

// Increase order price to attract sellers
Game.market.changeOrderPrice(energyOrder.id, 0.7)

// Add more to an order
Game.market.extendOrder(energyOrder.id, 50000)

// Cancel an order (you lose 5% fee)
Game.market.cancelOrder(energyOrder.id)
```

## Pricing Tips

### Energy
- Typical range: 0.1 - 1.0 credits per unit
- Checked frequently by traders
- Higher price = faster fulfillment

### Pixels
- Typical range: 10,000 - 100,000+ credits per pixel
- Less liquid than energy
- Seasonal availability

**Always check `getHistory()` for current market conditions before setting prices.**

## Transaction Costs

- **Creating order**: Free
- **Canceling order**: 5% of order value
- **Changing price**: Additional credits if raising price
- **Extending order**: 5% of extension value
- **Terminal transfer energy**: Calculated by `calcTransactionCost()`

## Examples: W7N9 Room

### Scenario: You have 100 pixels, need 100k energy

```javascript
// Step 1: Sell pixels
Game.market.getAllOrders({resourceType: 'pixel', type: 'buy'})
  .sort((a,b) => b.price - a.price)
  .slice(0, 3)
  .forEach(o => console.log(`${o.price} cr/px: ${o.amount}px (${o.id})`))

// Pick best price and sell
Game.market.deal('ORDER_ID_HERE', 100, 'W7N9')

// Step 2: Wait and check updated credits
Game.market.credits

// Step 3: Create buy order for energy
Game.market.createOrder({
  type: 'buy',
  resourceType: 'energy',
  price: 0.5,
  totalAmount: 100000,
  roomName: 'W7N9'
})

// Step 4: Monitor order
console.log(Object.values(Game.market.orders).find(o => o.resourceType === 'energy'))
```

### Scenario: Buy energy immediately at market rate

```javascript
// Find cheapest energy sellers
const sellers = Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})
  .sort((a,b) => a.price - b.price)

console.log(`Cheapest: ${sellers[0].price} cr/e, ${sellers[0].amount} available`)

// Buy from cheapest
Game.market.deal(sellers[0].id, 100000, 'W7N9')
```

## Useful Patterns

### Console Output Formatting

When printing objects, the console may show `[Object]...` instead of the full content. Use these methods to see readable output:

```javascript
// Pretty-print as JSON
console.log(JSON.stringify(Game.market.orders, null, 2))

// Display as a table
console.table(Object.values(Game.market.orders))

// Custom formatted output
Object.values(Game.market.orders).forEach(order => {
  console.log(`${order.id}: ${order.type} ${order.resourceType} @ ${order.price} cr, ${order.amount}/${order.totalAmount}`)
})
```

### Filter by price
```javascript
const affordable = Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})
  .filter(o => o.price < 0.6)
console.log(affordable)
```

### Show top N offers
```javascript
Game.market.getAllOrders({resourceType: 'energy', type: 'sell'})
  .sort((a,b) => a.price - b.price)
  .slice(0, 10)
  .forEach(o => console.log(`${o.price}: ${o.amount} (${o.id})`))
```

### Calculate total cost
```javascript
const amount = 100000
const price = 0.5
const cost = amount * price
console.log(`Buying ${amount} energy at ${price} = ${cost} credits`)
```

## Troubleshooting

**Q: "TypeError: Game.market.getOrderStats is not a function"**
- A: Use `getHistory()` instead of `getOrderStats()`

**Q: Order didn't execute**
- A: Orders execute asynchronously. Check `Game.market.orders` after a moment.

**Q: My buy order isn't filling**
- A: Your price may be too low. Use `changeOrderPrice()` to raise it and attract sellers.

**Q: How much will this cost?**
- A: Use `price × totalAmount`. Make sure you have enough credits with `Game.market.credits`.

## Resources

- [Official Screeps Market Docs](https://docs.screeps.com/market.html)
- [Game.market API Reference](https://docs.screeps.com/api/)

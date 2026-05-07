---
name: Maestri Portal Usage Guide
description: Commands and workflow for reading game state via Maestri portals
type: reference
---

## Connected Portals

- **Screeps** — Game UI at https://screeps.com
- **Screeps Console** — Console output chained from game window

## Core Commands

### Navigation & Inspection
```bash
maestri list                                  # List connected portals
maestri portal screenshot "Screeps"           # Capture visual screenshot
maestri portal snapshot "Screeps"             # Get accessibility tree + refs
maestri portal navigate "Screeps" "url"       # Go to URL
maestri portal info "Screeps"                 # Current URL, title, viewport size
maestri portal evaluate "Screeps" "JS code"   # Execute & return JS result
```

### Interaction
```bash
maestri portal click "Screeps" @e1            # Click element by ref
maestri portal click "Screeps" 350,200        # Click by coordinates
maestri portal fill "Screeps" @e2 "text"      # Set input value
maestri portal key "Screeps" "Enter"          # Press key
maestri portal scroll "Screeps" down 300      # Scroll
```

### Reading Data
```bash
maestri portal text "Screeps" @e1             # Get text content of element
maestri portal html "Screeps"                 # Get full page HTML
maestri portal logs "Screeps Console"         # Get captured console logs
```

## Workflow for Game State Monitoring

1. **Navigate to Overview:**
   ```bash
   maestri portal navigate "Screeps" "https://screeps.com/a/#!/overview"
   ```

2. **Get current metrics:**
   ```bash
   maestri portal screenshot "Screeps"        # Visual overview with stats
   maestri portal snapshot "Screeps"          # Find interactive elements
   ```

3. **Drill into a room:**
   ```bash
   maestri portal navigate "Screeps" "https://screeps.com/a/#!/room/shard1/W7N9"
   ```

4. **Check console output:**
   ```bash
   maestri portal evaluate "Screeps" "document.body.innerText" | tail -50
   ```

## Key URLs

- **Overview:** `/a/#!/overview` — account summary, all rooms, metrics
- **Room View:** `/a/#!/room/shard1/{ROOM}` — map, creeps, structures
- **Room Overview:** `/a/#!/overview/shard1/{ROOM}` — detailed stats & graphs
- **Inventory:** `/a/#!/inventory` — power creeps, resources
- **World Map:** `/a/#!/map` — all rooms

## Tips

- **Use refs over coordinates** — refs are more stable across page changes
- **Take snapshot before clicking** — refs from snapshot remain valid during interaction
- **Evaluate JS for bulk data** — faster than clicking through UI for large datasets
- **Console logs show tick-by-tick execution** — check for errors, role status, CPU usage

## Integration with Workflow

- Use `maestri portal navigate` + `screenshot` for periodic game state reviews
- Use `evaluate` to extract JSON game state (via Memory inspection)
- Can feed game state into code review/strategy decisions
- Console logs help debug creep behavior and detect issues

# Quick Guide: Reading Screeps Console Logs

**Location:** `screeps_console/logs/screeps_console_YYYY-MM-DD.json`  
**Format:** NDJSON (newline-delimited JSON)  
**Size:** ~10MB, ~51k lines per day  
**Permission requirement:** None (all read-only)

## Fastest Way: jq One-liners

```bash
# Show all log lines
jq -r '.line' screeps_console/logs/screeps_console_2026-05-15.json | head -20

# Filter by room/pattern
jq -r '.line' screeps_console/logs/screeps_console_2026-05-15.json | grep W8N9

# Show last 50 entries
tail -50 screeps_console/logs/screeps_console_2026-05-15.json | jq -r '.line'

# Filter with jq (case-insensitive)
jq -r 'select(.line | test("remoteMiner"; "i")) | .line' screeps_console/logs/screeps_console_2026-05-15.json
```

## Using Scripts (in `.ai/scripts/`)

### Shell Script: `read-logs.sh`
```bash
# Filter by pattern, show first 50 lines
.ai/scripts/read-logs.sh 'W8N9' 50

# Custom log file and pattern
.ai/scripts/read-logs.sh screeps_console/logs/screeps_console_2026-05-15.json 'remoteMiner' 100
```

### Python Script: `analyze-logs.py`
```bash
# Show statistics
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json --stats

# Filter + stats
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json 'W8N9' --stats

# Show first 50 matches
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json 'remoteMiner'
```

## Common Tasks

### Find all activity for a specific room
```bash
jq -r 'select(.line | test("W8N9"; "i")) | .line' screeps_console/logs/screeps_console_2026-05-15.json
```

### Timeline of events (with timestamp)
```bash
jq -r '.ts as $ts | select(.line | test("remoteMiner")) | "[\($ts)] \(.line)"' screeps_console/logs/screeps_console_2026-05-15.json | head -20
```

### Count messages by type
```bash
jq -r '.type' screeps_console/logs/screeps_console_2026-05-15.json | sort | uniq -c
```

### Find recent errors
```bash
jq 'select(.type == "error")' screeps_console/logs/screeps_console_2026-05-15.json
```

### Get tick data
```bash
jq -r 'select(.line | test("^--- Tick")) | .line' screeps_console/logs/screeps_console_2026-05-15.json
```

### Search multiple rooms
```bash
jq -r '.line' screeps_console/logs/screeps_console_2026-05-15.json | grep -E 'W8N9|W6N9|W7N9'
```

## Today's Log File
```bash
# Automatically uses today's date
.ai/scripts/read-logs.sh 'pattern' 50
```

## Previous Days
```bash
# Specific date (use format YYYY-MM-DD)
ls screeps_console/logs/screeps_console_*.json

# Read an older log
jq -r '.line' screeps_console/logs/screeps_console_2026-05-14.json | head -20
```

---

**For detailed documentation:** See `.ai/memory/log-reading-methods.md`  
**For interactive exploration:** Use `screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py`

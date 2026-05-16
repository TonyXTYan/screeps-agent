---
name: screeps-log-reading-approaches
description: Permission-free methods to read and analyze Screeps console NDJSON logs
metadata:
  type: reference
---

# Screeps Console Log Reading Methods

The Screeps console at `screeps_console/logs/screeps_console_YYYY-MM-DD.json` contains 51k+ NDJSON lines (~10MB daily). These methods don't require approval.

## Method 1: Direct jq (Fastest)

**Tool:** Bash (read-only) + `jq`
**Permission:** None required
**Use when:** Need quick field extraction or filtering

```bash
# Extract all log lines
jq -r '.line' screeps_console/logs/screeps_console_2026-05-15.json

# Filter for pattern (case-insensitive)
jq -r 'select(.line | test("W8N9"; "i")) | .line' screeps_console/logs/screeps_console_2026-05-15.json

# Extract by direction (in/out)
jq -r 'select(.direction == "in") | .line' screeps_console/logs/screeps_console_2026-05-15.json

# Combine timestamp + line
jq -r '.ts as $ts | .direction as $dir | "[\($dir)] \($ts): \(.line)"' screeps_console/logs/screeps_console_2026-05-15.json
```

## Method 2: Bash piping (Flexible)

**Tool:** Bash (read-only) + grep/awk/tail/head
**Permission:** None required
**Use when:** Building ad-hoc queries

```bash
# Count lines by direction
grep '"direction"' screeps_console/logs/screeps_console_2026-05-15.json | grep -c '"in"'

# Get last 100 lines
tail -100 screeps_console/logs/screeps_console_2026-05-15.json

# Search for specific room
grep 'W8N9' screeps_console/logs/screeps_console_2026-05-15.json | head -20

# Extract just timestamps and lines
jq -r '"\(.ts) \(.line)"' screeps_console/logs/screeps_console_2026-05-15.json | grep W8N9
```

## Method 3: Shell Script (Reusable)

**Tool:** `.ai/scripts/read-logs.sh`
**Permission:** None required
**Use when:** Frequent log analysis with consistent patterns

```bash
# View today's logs matching pattern
.ai/scripts/read-logs.sh 'W8N9' 50

# View specific log file
.ai/scripts/read-logs.sh /Users/tonyyan/GitHub/screeps-agent/screeps_console/logs/screeps_console_2026-05-15.json 'error' 100

# Show all lines (no filter)
.ai/scripts/read-logs.sh screeps_console/logs/screeps_console_2026-05-15.json '.' 200
```

## Method 4: Python Script (Analysis)

**Tool:** `.ai/scripts/analyze-logs.py`
**Permission:** None required
**Use when:** Aggregating statistics or complex filtering

```bash
# Show statistics (counts, types, time range)
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json --stats

# Filter for pattern + show stats
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json 'error' --stats

# Filter by direction
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json 'W8N9' --direction=in

# Filter by log type
.ai/scripts/analyze-logs.py screeps_console/logs/screeps_console_2026-05-15.json --type=log
```

## Method 5: Read Tool (When jq unavailable)

**Tool:** Read tool (file limit: 2000 lines at a time)
**Permission:** None required
**Use when:** jq unavailable or need to inspect specific line ranges

```javascript
// In tool calls:
Read with offset and limit to read specific sections
// Example: read lines 1000-2000
```

## Log File Format

Each line is a JSON object with:
- `ts` — Unix timestamp (float)
- `direction` — "in" (incoming from server) or "out" (outgoing command)
- `shard` — game shard (usually "shard1")
- `line` — the actual log message (text)
- `type` — "log", "error", etc. (mostly "log")

## Quick Examples

```bash
# Find recent errors
tail -10000 screeps_console/logs/screeps_console_2026-05-15.json | jq 'select(.type == "error")'

# Count messages per shard
jq -r '.shard' screeps_console/logs/screeps_console_2026-05-15.json | sort | uniq -c

# Find tick data
jq -r 'select(.line | test("Tick")) | .line' screeps_console/logs/screeps_console_2026-05-15.json | head -20

# Timeline of specific room operations
jq -r 'select(.line | test("W8N9")) | "\(.ts) \(.line)"' screeps_console/logs/screeps_console_2026-05-15.json | head -50
```

## Notes

- Log files are rotated daily; use date in filename: `screeps_console_YYYY-MM-DD.json`
- Files are ~10MB per day with ~51k lines
- jq and bash tools don't require permission prompts (read-only operations)
- Python/shell scripts in `.ai/scripts/` are also permission-free
- For interactive exploration, consider using `screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py`

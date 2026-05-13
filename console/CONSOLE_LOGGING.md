# Console Logging Guide

The screeps_console interactive terminal automatically logs all I/O to daily NDJSON files. This allows you to inspect game state and creep activity from the terminal without keeping the UI running.

## Quick Start

**Start the console:**
```bash
screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py
```

**View today's logs:**
```bash
tail -n 50 screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json
```

**Pretty-print with colors:**
```bash
tail -n 50 screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq '.'
```

## Log Format

Each line is a JSON object (NDJSON). Two types of entries exist:

### Incoming (Server → Console)

```json
{"ts": 1715645123.456, "direction": "in", "shard": "shard3", "line": "tick 12345: harvested 50 energy", "type": "log"}
```

**Fields:**
- `ts` — Unix timestamp (float) when the message arrived
- `direction` — `"in"` for server messages
- `shard` — Shard where the message originated
- `line` — Message text (HTML tags already stripped)
- `type` — Message type: `"log"` (normal), `"result"` (command result), `"highlight"` (emphasized), `"error"` (error message)

### Outgoing (Console → Server)

```json
{"ts": 1715645125.789, "direction": "out", "shard": "shard3", "line": "Game.creeps.Harvester1.say('hi')"}
```

**Fields:**
- `ts` — Unix timestamp when you typed the command
- `direction` — `"out"` for commands you submit
- `shard` — Shard the command was sent to
- `line` — The command you typed

## Reading Logs

### Last N lines
```bash
tail -n 20 screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json
```

### Filter by direction

Only show commands you typed:
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.direction == "out")'
```

Only show server messages (not commands):
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.direction == "in")'
```

### Filter by message type

Only show errors:
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.type == "error")'
```

Only show command results:
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.type == "result")'
```

### Search for keywords

Find all messages containing "error":
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.line | contains("error"))'
```

### Filter by shard

Only show messages from shard3:
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.shard == "shard3")'
```

### Extract just the messages

Print only the text lines (useful for scanning):
```bash
cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq -r '.line'
```

## Inspection Workflow

### Example: Debug a remote mining operation

1. **Run the console and set up logging:**
   ```bash
   screeps_console/.venv/bin/python screeps_console/screeps_console/interactive.py
   ```

2. **Enable debug output in the console:**
   ```js
   debug.trackRemote('W7N9', 'W8N9', true)
   ```

3. **Let it run for a while, then stop the console (Ctrl+C).**

4. **Inspect the logs:**
   ```bash
   cat screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json | jq 'select(.line | contains("W8N9"))'
   ```

5. **Claude Code can read and analyze logs directly:**
   - Open Claude Code in this project
   - Ask: *"Read screeps_console/logs/screeps_console_$(date +%Y-%m-%d).json and find all remote mining messages"*
   - Claude uses the Read tool to scan and extract insights

## Analyzing with Claude Code (Recommended)

Open Claude Code and ask questions about the logs:
- *"What happened in today's logs?"*
- *"Find all remote mining messages and errors"*
- *"Show CPU bucket trend and stuck creeps"*

Claude's Read tool handles NDJSON efficiently and provides intelligent analysis: CPU trends, problem detection, event timelines, and actionable recommendations.

## Log Storage

- **Location:** `screeps_console/logs/screeps_console_YYYY-MM-DD.json`
- **One file per day** — old files remain on disk
- **Auto-created** — the `screeps_console/logs/` directory is created automatically on first log entry
- **No rotation** — logs accumulate until you manually delete them

To clean up old logs:
```bash
# Delete logs older than 7 days
find screeps_console/logs/ -name "*.json" -mtime +7 -delete
```

## Tips

- **Pair with `debug.ts` functions** — Use console logging helpers like `debug.trackRemote()` to emit structured output you can filter and inspect later
- **Timestamp-based analysis** — Since every entry has `ts`, you can correlate console messages with game ticks
- **Shard-specific debugging** — Use `shard focus SHARDNAME` in the console to focus on a single shard, then filter logs by that shard
- **Agents can parse logs** — The NDJSON format makes it trivial for AI agents or scripts to process logs and detect patterns, anomalies, or extract metrics

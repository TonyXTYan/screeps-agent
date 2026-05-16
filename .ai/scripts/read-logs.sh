#!/bin/bash
# Read Screeps console logs without permission prompts
# Usage: ./read-logs.sh [filter_pattern] [max_lines]

LOG_DIR="screeps_console/logs"
LOG_FILE="${LOG_DIR}/screeps_console_$(date +%Y-%m-%d).json"

# Allow override of log file via argument
if [[ "$1" == /* ]]; then
  LOG_FILE="$1"
  shift
fi

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Error: Log file not found: $LOG_FILE" >&2
  echo "Available logs:" >&2
  ls -lh "$LOG_DIR"/*.json 2>/dev/null || echo "  (none)" >&2
  exit 1
fi

PATTERN="${1:-.}"  # Default to match all lines
MAX_LINES="${2:-50}"

# Extract and filter log lines with jq
echo "=== Screeps Console Logs ==="
echo "File: $LOG_FILE"
echo "Pattern: $PATTERN"
echo "---"

jq -r "select(.line | test(\"$PATTERN\"; \"i\")) | .ts as \$ts | .direction as \$dir | .line" "$LOG_FILE" | head -n "$MAX_LINES"

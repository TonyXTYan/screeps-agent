#!/usr/bin/env python3
"""Analyze Screeps console logs (NDJSON format) without permission prompts."""

import json
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

def load_logs(filepath):
    """Load NDJSON log file."""
    logs = []
    with open(filepath, 'r') as f:
        for line in f:
            try:
                logs.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return logs

def filter_logs(logs, pattern=None, log_type=None, direction=None):
    """Filter logs by pattern, type, or direction."""
    filtered = logs

    if pattern:
        pattern_lower = pattern.lower()
        filtered = [log for log in filtered if pattern_lower in log.get('line', '').lower()]

    if log_type:
        filtered = [log for log in filtered if log.get('type') == log_type]

    if direction:
        filtered = [log for log in filtered if log.get('direction') == direction]

    return filtered

def stats(logs):
    """Print log statistics."""
    if not logs:
        print("No logs to analyze")
        return

    types = defaultdict(int)
    directions = defaultdict(int)
    shards = defaultdict(int)

    for log in logs:
        types[log.get('type', 'unknown')] += 1
        directions[log.get('direction', 'unknown')] += 1
        shards[log.get('shard', 'unknown')] += 1

    print(f"Total logs: {len(logs)}")
    print(f"\nTypes: {dict(types)}")
    print(f"Directions: {dict(directions)}")
    print(f"Shards: {dict(shards)}")

    if logs:
        ts_min = min(log['ts'] for log in logs)
        ts_max = max(log['ts'] for log in logs)
        print(f"\nTime span: {datetime.fromtimestamp(ts_min)} to {datetime.fromtimestamp(ts_max)}")

def main():
    if len(sys.argv) < 2:
        print("Usage: analyze-logs.py <logfile> [pattern] [--stats|--type=TYPE|--direction=DIR]")
        print("\nExamples:")
        print("  analyze-logs.py logs/screeps_console_2026-05-15.json")
        print("  analyze-logs.py logs/screeps_console_2026-05-15.json 'error' --stats")
        print("  analyze-logs.py logs/screeps_console_2026-05-15.json 'W8N9' --type=log")
        sys.exit(1)

    logfile = Path(sys.argv[1])
    if not logfile.exists():
        print(f"Error: File not found: {logfile}")
        sys.exit(1)

    print(f"Loading {logfile}...", file=sys.stderr)
    logs = load_logs(logfile)

    pattern = None
    show_stats = False
    log_type = None
    direction = None

    for arg in sys.argv[2:]:
        if arg.startswith('--'):
            if arg == '--stats':
                show_stats = True
            elif arg.startswith('--type='):
                log_type = arg.split('=', 1)[1]
            elif arg.startswith('--direction='):
                direction = arg.split('=', 1)[1]
        else:
            pattern = arg

    filtered = filter_logs(logs, pattern, log_type, direction)

    if show_stats:
        stats(filtered)
    else:
        for log in filtered[:50]:  # Show first 50 by default
            print(f"[{log.get('direction')}] {log.get('line')}")

if __name__ == '__main__':
    main()

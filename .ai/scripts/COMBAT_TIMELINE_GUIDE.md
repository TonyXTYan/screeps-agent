# Combat Timeline Guide

Generate a concise combat/danger timeline from Screeps console NDJSON logs.

## Script

`python .ai/scripts/combat-timeline.py`

## Default behavior

- Scans `screeps_console/logs/screeps_console_*.json`
- Detects incident starts from `[REMOTE-DANGER]` with:
  - `hostiles=N detected`
  - `transit-blocked via <room>`
- Detects incident ends from `[REMOTE-DANGER]` with:
  - `cleared`
  - `transit-block expired`
- Pairs each start with the first later end in the same room
- Outputs a Markdown table

## Common usage

All retained logs:

`python .ai/scripts/combat-timeline.py`

Single date:

`python .ai/scripts/combat-timeline.py --date-glob 2026-05-27`

Date range by glob:

`python .ai/scripts/combat-timeline.py --date-glob "2026-05-*"`

Only direct hostile contacts (exclude transit blocks):

`python .ai/scripts/combat-timeline.py --hostiles-only`

Machine-readable text output:

`python .ai/scripts/combat-timeline.py --format text`

## Output columns

- `Start Date`, `Start Tick`, `Room`, `Trigger`, `Danger Until`
- `End Date`, `End Tick`, `Resolution`, `Duration (ticks)`, `Result`

`Result` is `Recovered` when a matching end event exists, otherwise `Open/Unknown`.

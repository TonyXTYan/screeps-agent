#!/usr/bin/env python3
"""Build a remote danger/combat timeline from Screeps NDJSON logs."""

from __future__ import annotations

import argparse
import glob
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

START_RE = re.compile(
    r"\[REMOTE-DANGER\] t=(\d+) ([WE]\d+[NS]\d+): "
    r"(hostiles=\d+ detected|transit-blocked via [WE]\d+[NS]\d+) .*dangerUntil=(\d+)"
)
END_RE = re.compile(
    r"\[REMOTE-DANGER\] t=(\d+) ([WE]\d+[NS]\d+): (cleared|transit-block expired) .*resuming harvest"
)


@dataclass
class DangerStart:
    day: str
    tick: int
    room: str
    event: str
    danger_until: int


@dataclass
class DangerEnd:
    day: str
    tick: int
    room: str
    event: str


@dataclass
class TimelineRow:
    start_day: str
    start_tick: int
    room: str
    trigger: str
    danger_until: int
    end_day: str
    end_tick: int | None
    resolution: str
    duration_ticks: int | None
    result: str


def iter_log_files(log_dir: Path, date_glob: str) -> Iterable[Path]:
    pattern = str(log_dir / f"screeps_console_{date_glob}.json")
    for file_path in sorted(glob.glob(pattern)):
        yield Path(file_path)


def parse_events(files: Iterable[Path]) -> tuple[list[DangerStart], list[DangerEnd]]:
    starts: list[DangerStart] = []
    ends: list[DangerEnd] = []

    for file_path in files:
        day = file_path.stem.removeprefix("screeps_console_")
        with file_path.open("r", encoding="utf-8") as handle:
            for raw in handle:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    rec = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                message = rec.get("line", "")
                start_match = START_RE.search(message)
                if start_match:
                    tick, room, event, danger_until = start_match.groups()
                    starts.append(
                        DangerStart(
                            day=day,
                            tick=int(tick),
                            room=room,
                            event=event,
                            danger_until=int(danger_until),
                        )
                    )
                    continue

                end_match = END_RE.search(message)
                if end_match:
                    tick, room, event = end_match.groups()
                    ends.append(
                        DangerEnd(
                            day=day,
                            tick=int(tick),
                            room=room,
                            event=event,
                        )
                    )

    starts.sort(key=lambda s: s.tick)
    ends.sort(key=lambda e: e.tick)
    return starts, ends


def build_timeline(starts: list[DangerStart], ends: list[DangerEnd]) -> tuple[list[TimelineRow], list[DangerEnd]]:
    rows: list[TimelineRow] = []
    used_end_indexes: set[int] = set()

    for start in starts:
        match_index = None
        for index, end in enumerate(ends):
            if index in used_end_indexes:
                continue
            if end.room == start.room and end.tick >= start.tick:
                match_index = index
                break

        if match_index is None:
            rows.append(
                TimelineRow(
                    start_day=start.day,
                    start_tick=start.tick,
                    room=start.room,
                    trigger=start.event,
                    danger_until=start.danger_until,
                    end_day="",
                    end_tick=None,
                    resolution="",
                    duration_ticks=None,
                    result="Open/Unknown",
                )
            )
            continue

        end = ends[match_index]
        used_end_indexes.add(match_index)
        rows.append(
            TimelineRow(
                start_day=start.day,
                start_tick=start.tick,
                room=start.room,
                trigger=start.event,
                danger_until=start.danger_until,
                end_day=end.day,
                end_tick=end.tick,
                resolution=end.event,
                duration_ticks=end.tick - start.tick,
                result="Recovered",
            )
        )

    unmatched_ends = [end for i, end in enumerate(ends) if i not in used_end_indexes]
    return rows, unmatched_ends


def print_markdown(rows: list[TimelineRow]) -> None:
    print("| Start Date | Start Tick | Room | Trigger | Danger Until | End Date | End Tick | Resolution | Duration (ticks) | Result |")
    print("|---|---:|---|---|---:|---|---:|---|---:|---|")
    for row in rows:
        end_tick = "" if row.end_tick is None else str(row.end_tick)
        duration = "" if row.duration_ticks is None else str(row.duration_ticks)
        print(
            f"| {row.start_day} | {row.start_tick} | `{row.room}` | {row.trigger} | {row.danger_until} | "
            f"{row.end_day} | {end_tick} | {row.resolution} | {duration} | {row.result} |"
        )


def print_text(rows: list[TimelineRow], unmatched_ends: list[DangerEnd]) -> None:
    print(f"INCIDENTS: {len(rows)}")
    for row in rows:
        end_tick = "-" if row.end_tick is None else row.end_tick
        duration = "-" if row.duration_ticks is None else row.duration_ticks
        end_day = "-" if not row.end_day else row.end_day
        resolution = "-" if not row.resolution else row.resolution
        print(
            f"{row.start_day}\t{row.start_tick}\t{row.room}\t{row.trigger}\t"
            f"{row.danger_until}\t{end_day}\t{end_tick}\t{resolution}\t{duration}\t{row.result}"
        )

    print(f"UNMATCHED_ENDS: {len(unmatched_ends)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--log-dir",
        default="screeps_console/logs",
        help="Directory containing screeps_console_YYYY-MM-DD.json files",
    )
    parser.add_argument(
        "--date-glob",
        default="*",
        help="Date matcher for log files, e.g. 2026-05-* or 2026-05-27",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "text"),
        default="markdown",
        help="Output format",
    )
    parser.add_argument(
        "--hostiles-only",
        action="store_true",
        help="Only include direct hostile detections (exclude transit blocks)",
    )
    args = parser.parse_args()

    files = list(iter_log_files(Path(args.log_dir), args.date_glob))
    if not files:
        raise SystemExit(f"No log files found in {args.log_dir} for date_glob={args.date_glob!r}")

    starts, ends = parse_events(files)
    if args.hostiles_only:
        starts = [s for s in starts if s.event.startswith("hostiles=")]

    rows, unmatched_ends = build_timeline(starts, ends)

    if args.format == "markdown":
        print_markdown(rows)
    else:
        print_text(rows, unmatched_ends)


if __name__ == "__main__":
    main()

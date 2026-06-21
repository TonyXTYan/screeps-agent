#!/usr/bin/env python3
"""Check Screeps console logs for known recovery regressions."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


BUILD_RE = re.compile(r"New:([0-9a-f]{8})")
HOME_RE = re.compile(
    r"\[HOME\] t=(?P<tick>\d+) .* en=(?P<energy>\d+)/(?P<capacity>\d+).* "
    r"demand=(?P<demand>YES|no)\s+recoveryPull=(?P<pull>YES|no)"
)
REMOTE_RE = re.compile(r"\[REMOTE\] t=(?P<tick>\d+)")


@dataclass
class HomeSample:
    tick: int
    build: str
    energy: int
    capacity: int
    demand: str
    recovery_pull: str


@dataclass
class RemoteTick:
    build: str
    total: int = 0
    renewing: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("logfile", type=Path)
    parser.add_argument("--after-build", help="Only evaluate samples after this build marker appears.")
    return parser.parse_args()


def load_lines(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"missing logfile: {path}")

    lines: list[str] = []
    with path.open() as handle:
        for raw in handle:
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            line = obj.get("line")
            if isinstance(line, str):
                lines.append(line)
    return lines


def parse_log(lines: list[str]) -> tuple[list[HomeSample], dict[int, RemoteTick], dict[str, dict[str, int]]]:
    build = "unknown"
    current_tick: int | None = None
    homes: list[HomeSample] = []
    remotes: dict[int, RemoteTick] = {}
    stats: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for line in lines:
        build_match = BUILD_RE.search(line)
        if build_match:
            build = build_match.group(1)
            stats[build]["build_marker"] += 1
            continue

        home_match = HOME_RE.search(line)
        if home_match:
            current_tick = int(home_match.group("tick"))
            sample = HomeSample(
                tick=current_tick,
                build=build,
                energy=int(home_match.group("energy")),
                capacity=int(home_match.group("capacity")),
                demand=home_match.group("demand"),
                recovery_pull=home_match.group("pull"),
            )
            homes.append(sample)
            s = stats[build]
            s["home_samples"] += 1
            s["home_min"] = sample.energy if "home_min" not in s else min(s["home_min"], sample.energy)
            s["home_max"] = max(s["home_max"], sample.energy)
            s["home_final"] = sample.energy
            s["home_final_capacity"] = sample.capacity
            if sample.demand == "YES" and sample.recovery_pull == "no":
                s["demand_yes_pull_no"] += 1
            if sample.demand == "no" and sample.recovery_pull == "YES":
                s["demand_no_pull_yes"] += 1
            continue

        remote_match = REMOTE_RE.search(line)
        if remote_match:
            current_tick = int(remote_match.group("tick"))
            continue

        if line.startswith("  hauler"):
            s = stats[build]
            s["local_hauler_total"] += 1
            if " refill " in line:
                s["local_hauler_refill"] += 1
            if " renewing " in line:
                s["local_hauler_renew"] += 1
            if " deposit " in line:
                s["local_hauler_deposit"] += 1
            if " withdraw " in line:
                s["local_hauler_withdraw"] += 1
            if re.search(r"\s-\s+en=", line):
                s["local_hauler_idle"] += 1
            continue

        if "remoteHauler" in line and current_tick is not None:
            tick_stats = remotes.setdefault(current_tick, RemoteTick(build=build))
            tick_stats.total += 1
            stats[build]["remote_hauler_total"] += 1
            if " renewing " in line:
                tick_stats.renewing += 1
                stats[build]["remote_hauler_renew"] += 1

    return homes, remotes, stats


def trim_after_build(
    homes: list[HomeSample],
    remotes: dict[int, RemoteTick],
    lines: list[str],
    build: str | None,
) -> tuple[list[HomeSample], dict[int, RemoteTick]]:
    if not build:
        return homes, remotes

    seen = False
    first_tick: int | None = None
    for line in lines:
        marker = BUILD_RE.search(line)
        if marker and marker.group(1) == build:
            seen = True
        if seen:
            match = HOME_RE.search(line) or REMOTE_RE.search(line)
            if match:
                first_tick = int(match.group("tick"))
                break

    if first_tick is None:
        raise SystemExit(f"build marker not found or has no samples: {build}")

    return (
        [sample for sample in homes if sample.tick >= first_tick],
        {tick: value for tick, value in remotes.items() if tick >= first_tick},
    )


def span(samples: list[HomeSample]) -> int:
    if len(samples) < 2:
        return 0
    return samples[-1].tick - samples[0].tick


def check_home_mismatch(homes: list[HomeSample]) -> list[str]:
    failures: list[str] = []
    run: list[HomeSample] = []
    for sample in homes:
        bad = sample.demand == "YES" and sample.recovery_pull == "no"
        if bad:
            run.append(sample)
            if span(run) > 20:
                failures.append(
                    f"demand=YES recoveryPull=no for {span(run)} ticks "
                    f"({run[0].tick}->{run[-1].tick}, build {run[0].build})"
                )
                run = []
        else:
            run = []
    return failures


def check_post_recovery_pull(homes: list[HomeSample]) -> list[str]:
    failures: list[str] = []
    run: list[HomeSample] = []
    for sample in homes:
        bad = (
            sample.demand == "no"
            and sample.recovery_pull == "YES"
            and sample.energy >= sample.capacity
        )
        if bad:
            run.append(sample)
            if span(run) > 60:
                failures.append(
                    f"demand=no recoveryPull=YES after full energy for {span(run)} ticks "
                    f"({run[0].tick}->{run[-1].tick}, build {run[0].build})"
                )
                run = []
        else:
            run = []
    return failures


def check_home_flatline(homes: list[HomeSample]) -> list[str]:
    failures: list[str] = []
    run: list[HomeSample] = []
    for sample in homes:
        if sample.demand == "YES":
            run.append(sample)
            energies = [s.energy for s in run]
            while run and max(energies) - min(energies) > 100:
                run.pop(0)
                energies = [s.energy for s in run]
            if span(run) > 150:
                failures.append(
                    f"home energy flatline under demand for {span(run)} ticks "
                    f"near {run[0].energy}-{run[-1].energy} ({run[0].tick}->{run[-1].tick}, build {run[0].build})"
                )
                run = []
        else:
            run = []
    return failures


def check_remote_renew_ratio(homes: list[HomeSample], remotes: dict[int, RemoteTick]) -> list[str]:
    failures: list[str] = []
    home_by_tick = {sample.tick: sample for sample in homes}
    home_ticks = sorted(home_by_tick)
    run_start: int | None = None
    run_build = "unknown"

    def nearest_home(tick: int) -> HomeSample | None:
        prior = [t for t in home_ticks if t <= tick]
        return home_by_tick[prior[-1]] if prior else None

    for tick in sorted(remotes):
        remote = remotes[tick]
        home = nearest_home(tick)
        low_home = bool(home and home.capacity > 0 and home.energy / home.capacity < 0.3)
        bad = remote.total > 0 and remote.renewing / remote.total > 0.8 and low_home
        if bad:
            if run_start is None:
                run_start = tick
                run_build = remote.build
            if tick - run_start > 100:
                failures.append(
                    f"remote hauler renew ratio >80% for {tick - run_start} ticks "
                    f"while home energy <30% ({run_start}->{tick}, build {run_build})"
                )
                run_start = None
        else:
            run_start = None

    return failures


def print_summary(stats: dict[str, dict[str, int]]) -> None:
    for build, s in stats.items():
        if "build_marker" not in s:
            continue
        print(
            f"{build}: home={s.get('home_samples', 0)} "
            f"energy={s.get('home_min', '-')}-{s.get('home_max', '-')} final={s.get('home_final', '-')}/{s.get('home_final_capacity', '-')} "
            f"demandYES_pullNo={s.get('demand_yes_pull_no', 0)} "
            f"demandNo_pullYES={s.get('demand_no_pull_yes', 0)} "
            f"local refill/idle/deposit/withdraw/renew="
            f"{s.get('local_hauler_refill', 0)}/{s.get('local_hauler_idle', 0)}/"
            f"{s.get('local_hauler_deposit', 0)}/{s.get('local_hauler_withdraw', 0)}/"
            f"{s.get('local_hauler_renew', 0)} "
            f"remoteRenew={s.get('remote_hauler_renew', 0)}/{s.get('remote_hauler_total', 0)}"
        )


def main() -> int:
    args = parse_args()
    lines = load_lines(args.logfile)
    homes, remotes, stats = parse_log(lines)
    eval_homes, eval_remotes = trim_after_build(homes, remotes, lines, args.after_build)

    print_summary(stats)

    failures: list[str] = []
    failures.extend(check_home_mismatch(eval_homes))
    failures.extend(check_remote_renew_ratio(eval_homes, eval_remotes))
    failures.extend(check_home_flatline(eval_homes))
    failures.extend(check_post_recovery_pull(eval_homes))

    if failures:
        print("\nREGRESSIONS:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nNo recovery regressions detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

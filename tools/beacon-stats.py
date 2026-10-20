#!/usr/bin/env python3
"""Tally structured beacons from results/beacon-logs/beacons.jsonl.

Usage:
    python3 tools/beacon-stats.py              # everything
    python3 tools/beacon-stats.py V457         # one probe prefix
    python3 tools/beacon-stats.py V457 --dist  # flip-position histogram
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

JSONL = Path(__file__).resolve().parent.parent / "results" / "beacon-logs" / "beacons.jsonl"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    prefix = args[0] if args else ""
    want_dist = "--dist" in sys.argv

    tags = Counter()
    first_ts = last_ts = None
    if not JSONL.exists():
        print(f"no beacons yet ({JSONL})")
        return
    for line in JSONL.read_text().splitlines():
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        b = rec.get("beacon", "")
        if prefix and not b.startswith(prefix):
            continue
        tags[b] += 1
        ts = rec.get("ts")
        if ts:
            if first_ts is None:
                first_ts = ts
            last_ts = ts

    total = sum(tags.values())
    print(f"beacons: {total}   window: {first_ts} .. {last_ts}")
    for tag, n in sorted(tags.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:6d}  {tag}")

    if want_dist:
        dist = Counter()
        for tag, n in tags.items():
            m = re.match(r"^(?:[A-Za-z0-9._-]+-)?FLIPPOS-(\d+)$", tag)
            if m:
                dist[int(m.group(1))] += n
        if dist:
            runs = sum(n for tag, n in tags.items() if tag.endswith("-BOOT"))
            flips = sum(dist.values())
            print(f"\ndistribution: runs={runs} flips={flips} "
                  f"({100 * flips // max(runs, 1)}%)")
            for pos in sorted(dist):
                bar = "#" * min(dist[pos], 60)
                print(f"  pos {pos:3d}: {dist[pos]:5d} {bar}")


if __name__ == "__main__":
    main()

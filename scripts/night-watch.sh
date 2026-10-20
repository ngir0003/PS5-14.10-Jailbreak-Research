#!/bin/bash
# night-watch.sh — unattended 24/7 watcher for the p457 auto-reload loop.
# Tallies new V457 beacons since the last watermark, appends a summary
# to results/beacon-logs/night-tally.txt, commits + pushes if anything
# new arrived, and flags when the loop looks stalled (no beacons).
set -u
cd "$(dirname "$0")/.."
LOG=tools/remote-loader/host-stdout.log
WM=results/beacon-logs/.night-watermark
TALLY=results/beacon-logs/night-tally.txt

TOTAL=$(wc -l < "$LOG" | tr -d ' ')
LAST=$(cat "$WM" 2>/dev/null || echo 0)

NEW=$(awk -v s=$((LAST+1)) -v e="$TOTAL" 'NR>=s && NR<=e' "$LOG" | grep "V458-")
if [ -z "$NEW" ]; then
  # nothing new since last check — is the loop alive at all?
  RECENT=$(tail -n 500 "$LOG" | grep -c "V458-")
  if [ "$RECENT" -eq 0 ]; then
    echo "[$(date -u +%FT%TZ)] STALLED: no V457 beacons in the last 500 log lines - PS5 may have left the guide, slept, or the page died" >> "$TALLY"
  fi
  echo "$TOTAL" > "$WM"
  exit 0
fi

BOOTS=$(grep -c "V458-BOOT" <<<"$NEW" || true)
FLIPS=$(grep -o "V458-FLIPPOS-[0-9]*" <<<"$NEW" | sort | uniq -c | sort -rn)
NFLIP=$(grep -c "V458-NOFLIP" <<<"$NEW" || true)
ODD=$(grep -c "V458-ODDSTAT\|V458-ONERROR" <<<"$NEW" || true)
DIST=$(grep -o "V458-FLIPPOS-[0-9]*" <<<"$NEW" | sed 's/V458-FLIPPOS-//' | sort -n | uniq -c | awk '{printf "%s:%s ", $2, $1}')

{
  echo "[$(date -u +%FT%TZ)] runs=$BOOTS flips=$((BOOTS-NFLIP)) noflip=$NFLIP odd=$ODD dist[$DIST]"
} >> "$TALLY"

echo "$TOTAL" > "$WM"

git add results/beacon-logs/night-tally.txt >/dev/null 2>&1
git commit -q -m "night watch: $BOOTS runs, flip dist [$DIST]" >/dev/null 2>&1
git push -q fork master >/dev/null 2>&1 || true

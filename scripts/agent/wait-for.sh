#!/usr/bin/env bash
# Usage: scripts/agent/wait-for.sh T2.3 [T2.4 ...]
# Polls origin/main every 5 minutes until all listed tasks are done. Gives up after 6 hours (exit 1).
# Run it in the background if your agent harness limits how long a foreground command may run.
set -uo pipefail
dir=$(dirname "$0")
for _ in $(seq 1 72); do
  if "$dir/task-status.sh" "$@" >/dev/null; then
    echo "ready: $*"
    exit 0
  fi
  sleep 300
done
echo "still blocked after 6h on: $*"
exit 1

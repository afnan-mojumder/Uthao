#!/usr/bin/env bash
# Usage: scripts/agent/task-status.sh T1.2 [T1.3 ...]
# Exit 0 if every task is ticked ("- [x] **T1.2**") in DEV_AFNAN.md or DEV_TAFSIRUL.md on origin/main.
# Prints each pending task. A task counts as done only once it is merged to main.
set -euo pipefail
git fetch -q origin main
done_list=$(git show origin/main:DEV_AFNAN.md origin/main:DEV_TAFSIRUL.md 2>/dev/null | grep -oE '^- \[x\] \*\*T[0-9]+\.[0-9]+\*\*' | grep -oE 'T[0-9]+\.[0-9]+' || true)
missing=0
for t in "$@"; do
  if ! grep -qx "$t" <<<"$done_list"; then
    echo "$t pending"
    missing=1
  fi
done
exit $missing

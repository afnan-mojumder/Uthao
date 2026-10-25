#!/usr/bin/env bash
# Usage: scripts/agent/finish-task.sh <member> <task>
# Run on the task branch with all work committed (including the "- [x] **<task>**" tick in your DEV file).
# Rebases onto origin/main, runs `npm run check`, pushes the branch, fast-forwards main and pushes it.
# Retries if the other member pushed to main in between.
# Exit 1 = precondition or check failed. Exit 2 = rebase conflict: resolve, `git rebase --continue`, rerun.
set -euo pipefail
member=$1 task=$2
branch=$(git branch --show-current)
[[ $branch == "$member/$task-"* ]] || { echo "not on a $member/$task-* branch (on '$branch')"; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo "uncommitted changes; commit them first"; exit 1; }
if [[ $task != T9.* ]]; then   # T9.n = maintenance fixes, no tick required
  grep -qE "^- \[x\] \*\*${task//./\\.}\*\*" DEV_*.md || { echo "$task is not ticked in your DEV file"; exit 1; }
fi

for attempt in 1 2 3 4 5; do
  git fetch -q origin
  git rebase -q origin/main || { echo "CONFLICT while rebasing onto origin/main"; exit 2; }
  if [[ -f package.json ]]; then
    npm run -s check || { echo "npm run check failed after rebase; fix, commit, rerun"; exit 1; }
  fi
  git push -q --force-with-lease origin "$branch"
  git checkout -q main
  git merge -q --ff-only origin/main
  git merge -q --ff-only "$branch"
  if git push -q origin main; then
    git checkout -q "$branch"
    echo "merged $branch into main"
    exit 0
  fi
  echo "main moved (attempt $attempt); retrying"
  git reset -q --hard origin/main   # local main only ever mirrors origin/main
  git checkout -q "$branch"
done
echo "could not merge after 5 attempts"
exit 1

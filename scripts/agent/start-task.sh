#!/usr/bin/env bash
# Usage: scripts/agent/start-task.sh <member> <task> <slug>
#   e.g. scripts/agent/start-task.sh afnan T1.2 physics-world
# Creates (or resumes) branch <member>/<task>-<slug> from the latest origin/main and pushes it.
# Exit 2 = rebase conflict while resuming: resolve, `git rebase --continue`, rerun.
set -euo pipefail
member=$1 task=$2 slug=$3
branch="$member/$task-$slug"
[[ -z $(git status --porcelain) ]] || { echo "working tree not clean; commit or stash first"; exit 1; }

git fetch -q origin
git checkout -q main
git merge -q --ff-only origin/main

if git show-ref -q --verify "refs/heads/$branch"; then
  git checkout -q "$branch"                                   # resume local branch
elif git show-ref -q --verify "refs/remotes/origin/$branch"; then
  git checkout -q -b "$branch" --track "origin/$branch"       # resume from another machine
else
  git checkout -q -b "$branch"
  git push -q -u origin "$branch"
  echo "$branch"
  exit 0
fi

git rebase -q origin/main || { echo "CONFLICT while rebasing $branch onto origin/main"; exit 2; }
echo "$branch"

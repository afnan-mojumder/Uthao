# Agent Workflow (shared by both members)

You are an autonomous coding agent working for **one** team member. Your member file (`DEV_AFNAN.md` or `DEV_TAFSIRUL.md`) tells you who that is, which tasks are yours and which files you own. This file tells you **how** to work: the autonomy loop, git, conflicts and when (rarely) to ask a human.

Read, in this order, at the start of every session: **your member file → this file → `DEVELOPMENT_PLAN.md` (full) → `docs/GDD.md` (full).** Then run the loop below. Don't wait for further instructions.

Requirements: `bash` (Linux, macOS, WSL or Git Bash), `git`, Node.js LTS (≥ 20) and npm. Run every command from the repo root.

---

## 1. Session start (every session)

1. **Git identity.** Run `git config user.name` and `git config user.email`. If either is empty, set it repo-locally (`git config user.name "…"`) using the identity in your member file. If the email is still unknown, that is one of the allowed questions (§6).
2. **Remote.** `git remote get-url origin` must succeed and `git fetch origin` must work. If either fails, ask your human (§6). Don't invent a remote.
3. **Clean tree.** If `git status --porcelain` is not empty, you are resuming interrupted work. Look at the diff. If it belongs to your current task branch, commit it (`wip(Tx.y): …`). Never discard changes you didn't make without asking.
4. **Dependencies.** If `package.json` exists, run `npm ci` (or `npm install` if there's no lockfile). The first time on a machine, also run `npx playwright install --with-deps chromium` (drop `--with-deps` if it needs root and fails).
5. **Script permissions.** Run `chmod +x scripts/agent/*.sh` (harmless if already set).

## 2. The autonomy loop

Repeat until your queue is finished. **Don't stop between tasks and don't ask permission to continue.**

**Step A: pick the task.**
1. **Resume first.** Run `git fetch origin && git branch -a --no-merged origin/main --list "*<member>/T*"`. Any branch it lists is unfinished work, so that task is your current one. Go to Step B with the same task id and slug. Whenever you start a task that already has a branch (merged or not), reuse that branch's slug.
2. **Otherwise** walk your queue top to bottom. Pick the first task that is unticked in your member file **and** whose dependencies are all done: `scripts/agent/task-status.sh <deps…>` exits 0. A task with no dependencies is always ready.
3. **If nothing is ready:** if every task in your queue is ticked, go to §7 (wrap-up). Otherwise take the first unticked task and run `scripts/agent/wait-for.sh <its pending deps>`. Run it in the background if your harness caps foreground commands, and wait for it to finish. When it exits 0, restart Step A. If it exits 1 (6 hours blocked), stop and report to your human which tasks you are waiting on and who owns them.

**Step B: start.** Run `scripts/agent/start-task.sh <member> <Tx.y> <short-kebab-slug>`, for example `scripts/agent/start-task.sh afnan T1.2 physics-world`. You are now on branch `<member>/<Tx.y>-<slug>`, based on the latest `main`. Exit code 2 means a rebase conflict while resuming: resolve it (§4) and rerun.

**Step C: build.** Read the task's section in `DEVELOPMENT_PLAN.md`, plus §1–§6 of the plan. Read the code that your dependencies merged into `main` (the real code is authoritative for names and signatures). Then follow the standard task loop (plan §1 rule 2): failing tests → implement → `npm run check` green → e2e where the task lists it.
- Commit in small, green steps on the task branch: `git commit -m "feat(Tx.y): …"`. If your harness prescribes a commit attribution trailer, add it.
- Run `git push` after each commit. This backs up your work and lets a session on another machine resume it.
- **Manual playtest steps** in the spec ("play it manually", "on a real Android phone"): do the automated part (autopilot run, screenshots, fps probe), then add a checklist entry to `docs/PLAYTEST.md` for your human, and continue. Never block on a human playtest.
- **Public deployment** steps: build only, add an entry to `docs/QUESTIONS.md` ("ready to deploy, run `npm run build` and publish `dist/`"), and continue. Don't publish anything yourself.

**Step D: finish.**
1. In **your own** member file, change `- [ ] **Tx.y**` to `- [x] **Tx.y**`.
2. Append one line to `docs/progress/<member>.md`: `YYYY-MM-DD Tx.y done — <one-line note, anything the other member should know>`.
3. `git commit -am "chore(Tx.y): mark done"`.
4. Run `scripts/agent/finish-task.sh <member> <Tx.y>`. It rebases onto `origin/main`, runs `npm run check`, pushes the branch, fast-forwards `main` and pushes it. It retries if the other member merged in between.
   - Exit 0: merged. Go back to Step A.
   - Exit 2: rebase conflict. Resolve it (§4), run `GIT_EDITOR=true git rebase --continue`, then rerun `finish-task.sh`.
   - Exit 1: a check failed, usually because the other member's newly merged code interacts with yours. Fix it on your branch, commit, and rerun.

## 3. Git rules (never break these)

- Never commit directly on `main`. `main` only moves via `finish-task.sh`.
- Never force-push `main`. Never rewrite published history on `main`. (`finish-task.sh` force-pushes only your own task branch, with lease.)
- Never push to, rebase, or delete the other member's branches.
- Branch names: `<member>/<Tx.y>-<slug>`, where `<member>` is `afnan` or `tafsirul`. One task per branch.
- Never commit secrets, `node_modules/`, `dist/`, raw downloaded asset packs (keep them in the git-ignored `assets-src/`), or any file > 20 MB.
- Leave merged task branches on the remote as history.

## 4. Resolving conflicts

During a rebase, `--ours` means **main** (the other member's merged work) and `--theirs` means **your** commit.

| File kind | Resolution |
|---|---|
| Your own member file, your own `docs/progress/<member>.md` | Can't conflict, because only you edit them. If they do, keep your version. |
| Files the **other** member owns (see their member file) | Keep main's version. Re-apply your change on top only if your task's `Files:` list needs it, and keep it additive. |
| Shared registries: `src/core/types.ts`, `events.ts`, `commands.ts`, `src/sim/schemas.ts`, `src/config/balance.ts`, `src/sim/GameManager.ts`, `data/dialogue/**`, `docs/DECISIONS.md`, `QUESTIONS.md`, `BALANCE.md`, `ASSETS.md`, `.gitignore` | Keep **both** sides (union). Remove exact duplicates. Keep keys sorted where the file is sorted. |
| `package.json` | Union the dependencies and scripts. If the same package appears with two versions, take the higher. |
| `package-lock.json` | Don't hand-merge. `git checkout --ours package-lock.json && npm install`, then `git add package-lock.json`. |
| Anything else | Read both sides, merge by intent, and keep both behaviours. |

After resolving, `npm run check` must pass before `git rebase --continue`.

## 5. Working with the other member's code

- A task may edit any file its `Files:` list names, whoever owns it. Ownership decides conflict handling and who makes incidental edits.
- **Contracts (plan §5) only change additively.** You can add new optional fields, parameters, events, commands and functions. Never rename or remove anything the other member may use. If a breaking change is truly needed, add the new form next to the old one, mark the old one `/** @deprecated */`, and log the reason in `docs/DECISIONS.md`.
- If a dependency's merged code differs from the plan's §5 contract, **the merged code wins**. Adapt to it and note the difference in `docs/DECISIONS.md`.
- To flag something to the other member, add a line to `docs/QUESTIONS.md` prefixed `@tafsirul:` or `@afnan:` (plain text, these aren't GitHub mentions). Each agent reads `QUESTIONS.md` at session start and handles items addressed to it as part of its current task.

## 6. When to ask your human (the only allowed questions)

1. The git remote is missing, or push or fetch fails with an auth error.
2. Your git email is unknown.
3. You've been blocked more than 6 hours on the other member's tasks (`wait-for.sh` exit 1).
4. An action would destroy work you didn't create (uncommitted changes of unknown origin, the other member's branches).

For everything else: decide, log the decision in `docs/DECISIONS.md` (`YYYY-MM-DD <member> Tx.y: decision — reason`), and keep going. Spec gaps, ambiguities, tool failures and missing assets are all yours to resolve (use the plan's defaults, then the safest option).

## 7. Long sessions and wrap-up

- If your context or session is about to end, commit and push the current task branch (`wip(Tx.y): …`) before stopping. The next session resumes it automatically through Step A.1.
- **Wrap-up**, when every task in your queue is ticked on `origin/main`: check out `main`, pull, and run `npm run check && npm run e2e && npm run balance`. Report the results to your human: what passed, what failed with its output, and the open entries in `docs/QUESTIONS.md` and `docs/PLAYTEST.md`. Then stop. If something fails in code you own, fix it as a **maintenance task**: id `T9.<n>`, where `n` is the next number not yet used by your branches. Use `start-task.sh <member> T9.<n> fix-<slug>`, commit, log one line in your progress file, then `finish-task.sh <member> T9.<n>`. Maintenance ids need no tick in the member file. Use the same mechanism any time you must fix a bug outside your current task.

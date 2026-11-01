# Uthao: agent instructions

## When Afnan says "start working on the update" (or "continue", "resume")

This means the Master Document update. Afnan has authorized the full `AGENT_WORKFLOW.md` loop for it: commit on task branches, push them, and merge through `scripts/agent/finish-task.sh`. Begin without asking for confirmation.

Read `docs/superpowers/plans/2026-11-02-master-doc-update.md`, `docs/MASTER.md`, and `AGENT_WORKFLOW.md`, then the code each task touches. For this update, these replace reading `DEVELOPMENT_PLAN.md` and `docs/GDD.md` in full; open those only when needed. `docs/MASTER.md` wins any conflict with the GDD.

### Work out where things stand

Git is the only progress tracker. Do not rely on any earlier chat.

1. **First run only.** If `docs/MASTER.md` is not on `origin/main` and no `afnan/T7.1-*` branch exists, the handoff files are still uncommitted, and `start-task.sh` refuses a dirty tree. Run:
   `git stash push -u -m handoff && scripts/agent/start-task.sh afnan T7.1 real-game-gate && git stash pop`
   Then commit `CLAUDE.md`, `DEV_AFNAN.md`, `docs/MASTER.md` and `docs/superpowers/` as the first commit of T7.1.
2. Unfinished `afnan/T*` branch (`git branch -a --no-merged origin/main --list "*afnan/T*"`): resume that task.
3. Otherwise take the first unticked task in the "Master Document update queue" in `DEV_AFNAN.md` whose deps pass `scripts/agent/task-status.sh`.
4. Before anything after T8.7, check `docs/QUESTIONS.md`. If `GATE-M1` is unticked, **stop** and ask Afnan to play the build and tick it.

Tell Afnan in one line which task you are starting, then keep going until the queue is done, the gate stops you, or `AGENT_WORKFLOW.md` §6 applies.

### Rules for this update

- Execute with `superpowers:subagent-driven-development`: a fresh implementer and reviewer per task. Afnan's starting this update is the request for those subagents. If Afnan asks for "native", use `superpowers:executing-plans` instead.
- Afnan does all of it. Use `afnan` for every script and branch. Do not assign Tafsirul work, edit `DEV_TAFSIRUL.md`, add `@tafsirul:` items, or push to his branches.
- `T9.n` IDs are maintenance fixes, not plan tasks. M2 is T13.x.
- Unit tests alone are not proof. v2.0.0 passed all of them while freezing on boot. Run `tests/e2e/smoke.spec.ts` for every task and report real results.
- Playwright runs can rewrite `tests/e2e/__screenshots__`. Restore those files unless the visual change is intended.
- Never deploy publicly.

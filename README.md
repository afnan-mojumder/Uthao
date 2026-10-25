# Dhaka Bike Rider: Meter Chole Na

A browser-based 3D motorcycle ride-hailing life-sim set in a fictional Dhaka-inspired city. It runs on PC browsers and Android Chrome. Built with Three.js, Rapier and TypeScript.

## How this project is built

Two members build it, each with their own AI coding agent. Agents work autonomously from these files:

| File | Purpose |
|---|---|
| `DEV_AFNAN.md` | Member 1 (Afnan Mojumder): task queue (≈60%) and owned files |
| `DEV_TAFSIRUL.md` | Member 2 (Tafsirul Shuvo): task queue (≈40%) and owned files |
| `AGENT_WORKFLOW.md` | Shared autonomy loop, git branching/merging rules, conflict handling |
| `DEVELOPMENT_PLAN.md` | Shared technical spec: every task's files, interfaces, tests, done criteria |
| `docs/GDD.md` | Game design document |
| `scripts/agent/*.sh` | Git automation used by the agents (start/finish task, dependency checks) |

### Starting your agent

1. `git clone <repo-url>` (or `git pull` if you already have it), then `cd` into the repo.
2. Start your coding agent in the repo root and tell it:
   - Afnan: **"Read DEV_AFNAN.md and follow it."**
   - Tafsirul: **"Read DEV_TAFSIRUL.md and follow it."**
3. The agent works through its queue on its own. It creates a branch per task (`afnan/T1.2-…`, `tafsirul/T1.4-…`), commits, pushes, and merges into `main` when tests pass. It waits automatically when it needs the other member's work.
4. If a session ends, start a new one with the same sentence. The agent resumes where it left off.

Things for humans to look at are collected in `docs/QUESTIONS.md` (decisions, Bangla review, deploy readiness) and `docs/PLAYTEST.md` (manual playtests). Progress logs are in `docs/progress/`.

Requirements: git, bash (Linux/macOS/WSL/Git Bash), Node.js LTS ≥ 20, and push access to the repo.

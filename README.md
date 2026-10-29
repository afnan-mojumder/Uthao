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

## Development commands

- `npm run dev`: Start local development server.
- `npm run build`: Build production assets into `dist/`.
- `npm run preview`: Preview production build locally.
- `npm run check`: Run full verification (`tsc --noEmit && eslint . && vitest run && node scripts/validate-data.mjs`).
- `npm run test`: Run unit tests with Vitest.
- `npm run e2e`: Run Playwright end-to-end test suite.
- `npm run balance`: Run headless simulation balance tests.
- `npm run assets`: Fetch and optimize CC0 game assets.

## Deployment & Release (v2.0.0 Static Single-Page App / PWA)

The game compiles to a zero-backend static single-page application and progressive web app (PWA) under `dist/`.

### Production Build
```bash
npm run build
```
Generates optimized, bundled, and tree-shaken static assets with full ServiceWorker offline caching in `dist/`.

Supported static hosting platforms:
- **Cloudflare Pages (Recommended):** Connect repository or deploy static directory `dist/` directly with build command `npm run build`. Free global edge distribution and fast asset delivery.
- **GitHub Pages:** Deploy `dist/` using standard GitHub Pages static deployment workflow or an automated GitHub Actions step.
- **Netlify:** Set publish directory to `dist/` and build command to `npm run build`.

> **Note on Public Deployment:** Always consult and ask the human user / project lead for confirmation before executing the first public production release.


The game compiles to a zero-backend static single-page application and progressive web app (PWA) under `dist/`.

Supported static hosting platforms:
- **Cloudflare Pages (Recommended):** Connect repository or deploy static directory `dist/` directly with build command `npm run build`. Free global edge distribution and fast asset delivery.
- **GitHub Pages:** Deploy `dist/` using the standard GitHub Pages static deployment workflow or an automated GitHub Actions step.
- **Netlify:** Set publish directory to `dist/` and build command to `npm run build`.

> **Note on Public Deployment:** Always consult and ask the human user / project lead for confirmation before executing the first public production release.

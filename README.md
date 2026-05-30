# Pump - AI-Powered Fitness Coach

A minimalist PWA for tracking strength training and weight loss with AI coaching via Claude.

## Live Environments

GitHub Pages serves both environments from **`master:/docs/`** — they share one
Pages source, just different subdirectories. The `gh-pages` and `gh-pages-test`
branches in the repo are legacy / orphaned.

| Environment | URL | Source on `master` |
|-------------|-----|--------------------|
| **Production** | [spitefulgrain40.github.io/Pump](https://spitefulgrain40.github.io/Pump/) | `docs/` |
| **Test/Sandbox** | [spitefulgrain40.github.io/Pump/test](https://spitefulgrain40.github.io/Pump/test/) | `docs/test/` |

## Features

- **AI Coach** - Chat with Claude to log meals, plan workouts, and get advice
- **Photo Meal Logging** - Take a photo and AI estimates calories/protein
- **Workout Scheduling** - Week A/B patterns for co-parenting schedules
- **Progress Tracking** - Weight charts, calorie charts, workout consistency
- **Offline-First** - All data stored locally in browser, works without internet
- **Weekly Backup Reminder** - Prompts to export data after 7 days

## Tech Stack

- React 18 + Vite
- Tailwind CSS 4 (OLED dark theme)
- Chart.js for visualizations
- OpenRouter or Anthropic API for AI

## Quick Start

```bash
npm install
npm run dev
```

## Deployment

Both environments deploy by committing build artefacts to `master`. The deploy
scripts use a git worktree so you don't have to switch off your feature branch.

### Test Environment
```bash
npm run deploy:test
# Builds dist/, copies into master:docs/test/, pushes master.
# Touches docs/test/ only — production at /Pump/ is not affected.
```

### Production
```bash
npm run deploy
# Builds dist/, stamps sw.js, copies into master:docs/
```

> **Why test deploys touch `master`**: GitHub Pages reads from `master:/docs/`,
> so anything under `docs/test/` only becomes visible at `/Pump/test/` once it
> lives on `master`. The orphan `gh-pages-test` branch is not served and is
> safe to ignore (or delete).

## Data Storage

All data persists in browser localStorage:
- Profile, goals, and targets
- Meal and workout logs
- Chat history with Coach
- Schedule and completed workouts

**Important**: Export backups regularly via Settings > Data > Export Backup

## Documentation

See [CLAUDE.md](CLAUDE.md) for detailed technical documentation including:
- Data schemas
- AI command formats
- Project structure
- Troubleshooting guide

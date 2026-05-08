# Pump - AI-Powered Fitness Coach

A minimalist PWA for tracking strength training and weight loss with AI coaching via Claude.

## Live Environments

| Environment | URL | Branch |
|-------------|-----|--------|
| **Production** | [spitefulgrain40.github.io/Pump](https://spitefulgrain40.github.io/Pump/) | `gh-pages` |
| **Test/Sandbox** | [spitefulgrain40.github.io/Pump/test](https://spitefulgrain40.github.io/Pump/test/) | `gh-pages-test` |

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

### Production (gh-pages)
```bash
npm run build
# Deploy dist/ to gh-pages branch
```

### Test Environment (gh-pages-test)
```bash
npm run build
# Deploy dist/ to gh-pages-test branch under /test subdirectory
```

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

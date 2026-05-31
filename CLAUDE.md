# Pump — AI-Powered Mind & Body Coach

## Project Overview & Purpose

Pump is a personal, privacy-first PWA for holistic health tracking and AI coaching. It covers three pillars:

1. **Physical training** — workout scheduling, logging, PR tracking, and progressive overload guidance
2. **Nutrition** — "best guess" food logging (not calorie-counting perfectionism), daily macro tracking, AI meal analysis via photo
3. **Mental health** — a separate AI therapy companion ("Doc") for reflection and emotional support

The philosophy is that mind and body health are equally important and need to be tracked together to get real results. The AI coach knows your full context — schedule, workouts, nutrition, weight trend, injuries — and gives joined-up advice rather than siloed responses.

**This is a personal-use app**, not a SaaS product. All data lives in the user's own browser (localStorage). No backend, no accounts, no server. Users bring their own Anthropic or OpenRouter API key.

**Live app**: https://spitefulgrain40.github.io/Pump/

---

## Tech Stack & Architecture

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18 + Vite | Component model suits the modal/overlay-heavy UI; fast HMR for development |
| Styling | Tailwind CSS 4 | Utility-first, OLED dark theme via CSS variables |
| Icons | Lucide React | Consistent, lightweight icon set |
| Charts | Chart.js + react-chartjs-2 | Weight trend and nutrition charts |
| Dates | date-fns | Lightweight, tree-shakeable date handling |
| Storage | localStorage | Zero-backend, privacy-first; all data stays on device |
| AI | Anthropic / OpenRouter / CLI proxy | User-configurable; CLI proxy for token-free local dev |
| Deployment | GitHub Pages (`docs/` folder) | Zero infrastructure cost; auto-deploys on push |
| PWA | Vite PWA plugin + custom sw.js | Installable on Android; offline capable |

### Key Architectural Decisions

**No backend, ever.** Every feature is designed to work entirely client-side. This means no auth, no user accounts, no server costs, no data privacy concerns. The tradeoff is no cross-device sync (backup/restore is manual).

**localStorage as the database.** All data is persisted via a custom `useLocalStorage` hook that emits custom events on writes, enabling cross-component sync without a state management library like Redux.

**AI as a command executor, not just a chatbot.** Coach responses can embed structured commands (`[LOG_MEAL: {...}]`, `[SET_SCHEDULE: {...}]` etc.) that the frontend parses and executes. The AI effectively writes directly to the user's data.

**System prompt as context injection.** Every Coach message includes a freshly-built system prompt with the user's full profile, today's nutrition, recent workouts, schedule, memories, and performance metrics. No persistent AI memory — the context is rebuilt from localStorage on every request.

**Jina AI for URL fetching.** When users paste URLs into Coach, content is fetched via `https://r.jina.ai/{url}` (free, no API key). This converts any webpage to clean text for inclusion in the prompt. Chosen over Anthropic's web search tool ($0.01/search) because it fetches specific URLs rather than searching.

**Separate AI personas for Coach vs Doc.** Coach and Doc have completely independent chat histories, system prompts, and memory systems. Doc uses Anthropic directly (no OpenRouter) and has a two-tier memory system: per-session summaries + long-term synthesis.

---

## Project Structure

```
src/
├── App.jsx                    # Main app shell, navigation, Coach modal overlay
├── index.css                  # Tailwind config + OLED theme CSS variables
├── main.jsx                   # Entry point
├── components/
│   ├── Dashboard.jsx          # Home: daily overview, today's meals, workout
│   ├── Coach.jsx              # AI chat, command execution, image/URL attachments
│   ├── Doc.jsx                # AI therapy companion, session memory, prompt editor
│   ├── Schedule.jsx           # Fortnightly calendar, shift pattern colouring
│   ├── Progress.jsx           # Charts, PRs, 30-day consistency grid
│   ├── Settings.jsx           # Profile, AI config, backup/restore, onboarding reset
│   ├── Nutrition.jsx          # Full nutrition history, date navigation, 7-day averages
│   ├── MealLogger.jsx         # Quick meal log modal, photo analysis
│   ├── WorkoutLogger.jsx      # Exercise logger, PR detection, mid-workout Coach
│   ├── WeightModal.jsx        # Quick weigh-in
│   └── OnboardingWizard.jsx   # First-run setup wizard (skippable)
├── hooks/
│   ├── useLocalStorage.js     # Generic hook with cross-component sync via custom events
│   ├── useUserProfile.js      # Profile, goals, phase/week-type calculation
│   ├── useWeightHistory.js    # Weight log
│   ├── useNutritionLogs.js    # Meal log, daily totals, weekly averages
│   ├── useWorkoutLogs.js      # Workout logs, PRs, schedule, templates
│   └── useSettings.js         # AI settings, backup/restore utilities
├── services/
│   └── ai/
│       ├── index.js           # Unified exports
│       ├── providers.js       # OpenRouter + Anthropic + CLI proxy adapters, multimodal support
│       └── context.js         # System prompt builder, context aggregator, command parser
└── utils/
    ├── dataSchemas.js         # Data structures, default exercise library, workout templates
    └── calculations.js        # Navy body fat, resolveBodyFat helper

scripts/
├── pump-cli-proxy.cjs         # Local dev proxy: routes Coach through claude CLI
├── deploy.cjs                 # Stamps sw.js with build date, copies dist → docs/
└── deploy-test.cjs            # Worktree-based deploy to docs/test/ for staging

public/
└── sw.js                      # Service worker: network-first for HTML, cache-first for assets
```

---

## Navigation & UI Structure

**5 bottom-nav tabs:**
- **Home** — Dashboard: today's workout, nutrition summary, today's meals, goals progress
- **Food** — Full nutrition history, daily targets, meal logging
- **Schedule** — Fortnightly calendar with shift-pattern colouring, completion checkboxes
- **Doc** — AI therapy companion (entirely separate from Coach)
- **More** (drawer) → Coach / Progress / Settings

**Coach** is also accessible as a floating bubble (bottom-right) on Home, Food, and Schedule tabs, and inside WorkoutLogger mid-session.

### z-index Hierarchy

| Layer | z-index | Component |
|-------|---------|-----------|
| Bottom nav | z-50 | App.jsx |
| Coach bubble | z-40 | App.jsx |
| Coach modal | z-[60] | App.jsx |
| Doc prompt editor | z-[60] | Doc.jsx |
| WorkoutLogger | z-[70] | WorkoutLogger.jsx |
| Coach bubble (in workout) | z-[75] | WorkoutLogger.jsx |
| Coach modal (over workout) | z-[80] | WorkoutLogger.jsx |

---

## Data Schemas

### User Profile (`pump-user-profile`)
```javascript
{
  name, gender, age, height,
  currentWeight, startingWeight, targetWeight, targetDate,
  tdee,                                    // Can be set manually or from Garmin
  calorieTarget: { min, max },
  proteinTarget: { min, max },
  bodyFatPercentage, neckCircumference, waistCircumference,
  hipCircumference,                        // Required for females (Navy body fat formula)
  physicalNotes,                           // Injuries, limitations
  activityLevel,
  schedulePattern: {
    type: 'alternating' | 'rotating' | 'fixed' | 'custom',
    cycleLength: 14,                       // 8 for 4-on/4-off, 14 for A/B fortnightly
    cycleStart: 'YYYY-MM-DD',
    labels: ['A', 'B'],                    // Or ['On Shift', 'Off Shift'] etc.
    description: 'Week A/B rotation',
    weekAStart: 'YYYY-MM-DD'              // Legacy — auto-migrated on load
  },
  weekTemplates: {                         // Per-phase daily schedule templates
    A: { mon: { lunch: { type, notes }, calories, protein }, ... },
    B: { ... }
  },
  onboardingComplete: true
}
```

**Phase calculation** (`getWeekTypeForDate` in `useUserProfile.js`):
- `positionInCycle = daysDiff % cycleLength`
- Weekly phases: `weekIndex = floor(position / 7)` → `labels[weekIndex]`
- Day-level cycles (cycleLength < 14): `phaseIndex = floor(position / (cycleLength / labels.length))`
- Legacy `weekAStart` profiles: auto-migrate via fallback logic, no manual action needed

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `pump-user-profile` | Profile, goals, schedule pattern, week templates |
| `pump-ai-settings` | Provider, API keys, model selection |
| `pump-workout-schedule` | Daily schedule (type, notes, calories, protein) |
| `pump-completed-workouts` | Completion state per date/session |
| `pump-nutrition-logs` | Meal log array |
| `pump-workout-logs` | Completed workout log array |
| `pump-prs` | Personal records per exercise |
| `pump-weight-history` | Weight entries |
| `pump-chat-history` | Coach chat history (images stripped before saving) |
| `pump-coach-memories` | Coach long-term memories |
| `pump-coach-system-prompt` | Custom Coach system prompt override |
| `pump-workout-draft` | In-progress workout auto-save |
| `pump-doc-chat` | Doc chat history |
| `pump-doc-longterm` | Doc long-term memory (synthesised across all sessions) |
| `pump-doc-sessions` | Doc per-session summaries (last 10 kept) |
| `pump-doc-system-prompt` | Custom Doc system prompt override |
| `pump-planning-snoozed` | Schedule planning banner snooze timestamp |
| `pump-pending-coach-prompt` | Pre-filled prompt passed to Coach on open |
| `pump-workout-templates` | Custom workout template overrides |

---

## AI Commands

Coach embeds structured commands in responses which the frontend parses and executes:

### Log Meal
```
[LOG_MEAL: {"items": [...], "totals": {"calories": 480, "protein": 56}}]
[LOG_MEAL: {"date": "2026-05-19", "items": [...], "totals": {...}}]
```
- Multiple blocks per response all execute (`extractAllJSON`)
- Optional `date` field for backdating up to 2 days
- **Only log items explicitly mentioned in the current message** — do not re-log existing meal items

### Log Weight
```
[LOG_WEIGHT: {"weight": 104.2}]
```

### Log Workout
```
[LOG_WORKOUT: {"date": "2026-05-08", "exercises": [...], "notes": "..."}]
```

### Set Schedule (Bulk — max 14 days)
```
[SET_SCHEDULE: {"2026-05-08": {"lunch": {"type": "push", "notes": "..."}, "calories": 2300}}]
```
Notes fields must be short (under 10 words) — verbose notes truncate the JSON.

### Update Profile
```
[UPDATE_PROFILE: {"tdee": 2723, "calorieTarget": {"min": 2000, "max": 2200}}]
```

### Modify Workout Template (incremental)
```
[UPDATE_TEMPLATE: {"template": "push", "action": "add", "exercise": {...}}]
[UPDATE_TEMPLATE: {"template": "push", "action": "remove", "exerciseName": "Bench Press"}]
[UPDATE_TEMPLATE: {"template": "push", "action": "update", "exerciseName": "Bench Press", "updates": {"weight": 85}}]
```
Multiple blocks per response all execute.

### Replace Full Workout Template
```
[SET_TEMPLATE: {"template": "push", "exercises": [...]}]
```

### Memory
```
[SAVE_MEMORY: {"type": "preference|injury|insight|milestone|other", "content": "..."}]
[FORGET_MEMORY: {"content": "..."}]
```

---

## Key Features & Implementation Notes

### Coach Context
Every Coach message rebuilds the system prompt from scratch using current localStorage state: full profile, today's nutrition, recent workouts, schedule, performance metrics, memories. A day-boundary marker is injected into chat history when messages span multiple days, so Coach knows when a new day has started.

### Workout Logger
- Weight/reps inputs use local string state during editing — blank mid-edit, defaults to 0 on blur (not on every keypress)
- Auto-saves draft to `pump-workout-draft` on every set tick
- Restores draft on reopen for the same date; cleared on Finish
- Coach accessible mid-workout via floating bubble (z-[75])

### Schedule Phase Colouring
For day-level cycles (cycleLength < 14, e.g. 4-on/4-off):
- On-shift days: green tinted tile + green dot
- Off-shift days: standard surface + grey dot
For A/B weekly patterns: standard activity colour coding

### Image Attachments in Coach
- Images sent to AI as base64 (multimodal message format)
- Base64 data stripped before saving to localStorage (prevents 5MB quota errors)
- Saved messages get `hadImage: true` as placeholder
- Images visible in current session (React state) but not persisted

### Doc Memory System
Two-tier memory built on session end:
1. Per-session summary (~150-200 words) stored in `pump-doc-sessions` (last 10 kept)
2. Long-term synthesis in `pump-doc-longterm` (updated/merged each session, ~300-400 words)
Both injected into next session's system prompt for continuity.

### Doc Prompt Editor
Bottom-sheet modal anchored `absolute bottom-0` (not flex-based) so `maxHeight: 85dvh` correctly constrains it. Textarea fixed at `40dvh` so Save/Reset buttons are always visible above the keyboard. Supports XML tags in the prompt.

### URL Fetching in Coach
Jina AI (`https://r.jina.ai/{url}`) converts any URL to clean text, injected into the message before sending. Free, no API key required. Up to 3 URLs per message.

### CLI Proxy
Routes Coach through the local `claude` CLI — zero API token cost for development. Uses `--bare --no-session-persistence --tools ""` flags to prevent CLAUDE.md discovery and session bleed.

---

## Development Workflow

### Plan → Test → Production → Document

All changes follow this workflow **without exception**:

1. **Plan** — discuss and agree the approach before writing code
2. **Build** — implement the change locally (`npm run dev`)
3. **Test (sandbox)** — deploy to `dist/` and run preview server (`npm run build && node scripts/deploy.cjs` then `npm run preview`)
4. **User approval** — user tests on the preview build and confirms it works
5. **Production** — only after approval: `node scripts/deploy.cjs` deploys to `docs/`, then `git push` to GitHub Pages
6. **Document** — update CLAUDE.md after every production deploy, then push

> **Never deploy to production without user approval of the test build.**

### Commands

```bash
npm install                          # Install dependencies
npm run dev                          # Dev server (http://localhost:5173)
npm run build                        # Build to dist/
node scripts/deploy.cjs              # Stamp sw.js + copy dist → docs/ (production)
npm run preview                      # Preview dist/ on localhost:4173

# Token-free local testing via CLI proxy
node scripts/pump-cli-proxy.cjs &    # Start proxy on localhost:3141
# Then set provider to "CLI (local)" in Settings
```

### Preview Server Note
`npm run preview` serves from `dist/` which contains `index.src.html` not `index.html`. After `npm run build`, manually copy: `cp dist/index.src.html dist/index.html`. The deploy script handles this for production automatically.

### CLI Proxy Custom Commands
- `/pump-dev` — starts proxy + dev server
- `/pump-test` — builds + starts proxy + preview server on port 4173

---

## Deployment

Hosted on GitHub Pages from the `docs/` folder of the `master` branch.

```bash
node scripts/deploy.cjs   # Stamps sw.js with build date, copies dist → docs/
git add docs/ && git commit -m "..." && git push
```

The service worker uses a stamped cache name (`pump-YYYYMMDD`) so Android users automatically get updates. Network-first strategy for `index.html`, cache-first for JS/CSS assets.

### Android Installation
1. Open https://spitefulgrain40.github.io/Pump/ in Chrome
2. Chrome menu → "Add to Home Screen"
3. All data persists in localStorage

---

## Current State (as of 2026-05-31)

### Completed & Working
- Full onboarding wizard with skip/restore option
- Dashboard with daily goals, workout, nutrition summary, Navy body fat method
- Workout scheduling with flexible shift patterns (A/B fortnightly, 4-on/4-off, custom)
- Workout logger with set/rep/weight tracking, PR detection, draft auto-save, skip exercise
- Nutrition logging (manual + photo analysis via Haiku), daily targets, 7-day averages
- Coach AI with full context, command execution, image attachments (camera + gallery), URL fetching, web search, chat search
- Doc AI therapy companion with two-tier session memory (Sonnet 4.6, not Opus)
- Progress charts, categorised PR records (push/pull/legs/core/cardio), 30-day consistency grid
- Backup/restore via JSON export
- Service worker with cache-busting for automatic Android updates
- Schedule phase colouring for shift workers
- Mid-workout Coach access
- Prompt caching on Anthropic API calls (system prompt cached)
- Test deploy workflow (`npm run deploy:test` → `docs/test/` on master)

### Known Quirks & Limitations
- **Cross-device sync**: Not supported — backup/restore is the only migration path
- **5MB localStorage limit**: Image data is stripped from chat history to mitigate; large chat histories or many workouts could approach the limit over time
- **Day boundary in Coach**: The fix (injecting a date marker between messages from different days) relies on message timestamps being set correctly. Messages saved without timestamps default to today.
- **SET_SCHEDULE JSON truncation**: If Coach writes verbose notes (full exercise lists) into notes fields, the JSON gets truncated and the command fails silently. Notes must be under 10 words.
- **Preview server**: Requires manual `cp dist/index.src.html dist/index.html` step after each build — the deploy script handles this for production but not for local preview.
- **CLI proxy on Windows**: Uses bash shebang in `.bin/vite` — must invoke via `node node_modules/vite/bin/vite.js` not `npx vite` on Windows.

### Next Steps / Potential Improvements
- App rename (current name "Pump" is a placeholder — "Hale" is the leading candidate, trademark-clear)
- Chat history pruning strategy (MAX_STORED_MESSAGES ~500) as localStorage grows over time
- URL allowlist for Jina fetching (scheme validation: http/https only)
- Backup import field whitelist (prevent unexpected localStorage keys)
- CLI proxy model parameter whitelist

---

## Troubleshooting

### Coach doesn't see week templates
Templates in `profile.weekTemplates`. If missing after migration: `location.reload()` — auto-migration runs on load.

### Coach blending yesterday's and today's data
The day boundary marker is injected based on message timestamps. If old messages lack timestamps, they all appear as today. Use the Clear button in Coach header to reset chat history — memories are preserved separately.

### SET_SCHEDULE not saving
Coach wrote verbose notes. Check browser console for JSON parse errors. Notes must be under 10 words.

### CLI proxy acting as Claude Code assistant
Proxy must run with `--bare --no-session-persistence` flags. Restart the proxy — old version without `--bare` may still be running.

### Android not getting updates
Hard-refresh Chrome (Settings → Privacy → Clear browsing data → Cached images). The service worker cache name changes on each deploy, which should auto-update on next load.

### Preview server 404
After `npm run build`, run: `cp dist/index.src.html dist/index.html` then retry.

### Doc Save button not visible
If the bottom sheet appears but buttons are cut off, the modal z-index may be wrong. Doc prompt editor is `z-[60]` — must be above bottom nav (`z-50`).

### Missing Coach confirmations
Check console for `"Parsed commands:"` — empty array means command format is wrong. Requires exact `[COMMAND: {...}]` syntax with valid JSON inside.

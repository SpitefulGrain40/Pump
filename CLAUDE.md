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

**System prompt as context injection.** Every Coach message includes a freshly-built system prompt with the user's profile, today's context, training cycle, and memories. Historical data (nutrition, workouts, PRs, weight, templates, performance) is NOT dumped into the prompt — Coach fetches it via client-side tools on demand. No persistent AI memory — context is rebuilt from localStorage on every request.

**Client-side tool use.** Coach has 8 tools it can call mid-conversation (Anthropic provider only): `get_nutrition_history`, `get_meal_items`, `get_workout_history`, `get_pr_records`, `get_weight_history`, `get_workout_templates`, `get_performance_summary`, `lookup_nutrition`. Most are localStorage reads executed by the frontend; `lookup_nutrition` also queries CoFID (bundled) and Open Food Facts. Results are sent back as `tool_result` blocks. The tool executor is async (awaited in the Anthropic loop) to support the network-backed lookup. The Anthropic provider runs a loop until `stop_reason: end_turn`. CLI and OpenRouter providers receive no tools (one-shot only).

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
│   ├── Dashboard.jsx          # Home: GoalCard hero + secondary strip, daily overview, meals, workout
│   ├── GoalCard.jsx           # Hero card for the primary goal metric (descriptor-driven)
│   ├── SecondaryMetricStrip.jsx # Chips for non-primary metrics, tap to expand inline chart
│   ├── Coach.jsx              # AI chat, command execution, image/URL attachments
│   ├── Doc.jsx                # AI therapy companion, session memory, prompt editor
│   ├── Schedule.jsx           # Fortnightly calendar, shift pattern colouring
│   ├── Progress.jsx           # Three-section goal-adaptive layout: Outcomes / Drivers / Records
│   ├── progress/              # Progress-tab pieces: CompositionBar, ForecastChart, ScoreRing, InfoToggle, ExpandableRow, SparklineSVG
│   ├── Settings.jsx           # Profile, Goal (intent + metric + targets), AI config, backup/restore
│   ├── Nutrition.jsx          # Full nutrition history, date navigation, 7-day averages
│   ├── MealLogger.jsx         # Meal Builder modal: describe items → AI estimates → log as one meal; photo + portion note
│   ├── WorkoutLogger.jsx      # Exercise logger, PR detection, mid-workout Coach
│   ├── WeightModal.jsx        # Quick weigh-in
│   ├── MeasurementModal.jsx   # Quick measurement snapshot (waist/neck/hip/manual bf)
│   └── OnboardingWizard.jsx   # First-run setup wizard (goal step, seeds weight + measurement)
├── hooks/
│   ├── useLocalStorage.js     # Generic hook with cross-component sync (per-instance sender id)
│   ├── useUserProfile.js      # Profile, goal migration, phase/week-type calculation
│   ├── useWeightHistory.js    # Weight log
│   ├── useMeasurementHistory.js # Measurement snapshots (powers body-fat/waist/lean-mass trends)
│   ├── useNutritionLogs.js    # Meal log, daily totals, weekly averages
│   ├── useWorkoutLogs.js      # Workout logs, PRs, schedule, templates
│   └── useSettings.js         # AI settings, backup/restore utilities
├── services/
│   └── ai/
│       ├── index.js           # Unified exports
│       ├── providers.js       # OpenRouter + Anthropic + CLI proxy adapters, multimodal support
│       └── context.js         # System prompt builder (incl. GOAL block), command parser
└── utils/
    ├── dataSchemas.js         # Data structures, default exercise library, workout templates
    ├── calculations.js        # Navy body fat, resolveBodyFat helper
    ├── goal.js                # Two-axis goal model: intents, migration, progress math (tested)
    ├── metrics.js             # Metric descriptor registry: weight/leanmass/bodyfat/waist/strength (tested)
    ├── schedule.js            # Cycle position/phase resolution, resolveDaySchedule (tested)
    └── progressCalcs.js       # Progress-tab pure functions: regression/forecast, series builders, rolling consistency, volume, PRs (tested)

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
  currentWeight, startingWeight, targetWeight, targetDate,  // targetWeight/Date legacy — superseded by goal
  goal: {                                  // Two-axis goal model (see utils/goal.js + utils/metrics.js)
    intent: 'cut' | 'recomp' | 'bulk' | 'maintain',   // drives Coach nutrition behaviour
    primaryMetric: 'weight' | 'leanmass' | 'bodyfat' | 'waist' | 'strength',  // drives dashboard hero
    targets: {                             // optional numeric target + date, kept per-metric
      weight:  { value, date },
      leanmass:{ value, date },
      bodyfat: { value, date },
      waist:   { value, date },            // strength = trend-only, no numeric target
    }
  },
  tdee,                                    // Can be set manually or from Garmin
  calorieTarget: { min, max },
  proteinTarget: { min, max },
  bodyFatManual, bodyFatPercentage,        // bodyFatManual = user-entered; legacy bodyFatPercentage kept for back-compat
  neckCircumference, waistCircumference,
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

**Goal migration** (`migrateGoal` in `utils/goal.js`, run once by `useUserProfile`): profiles without a `goal` object get one built from legacy `targetWeight`/`targetDate` — intent inferred (below current weight = cut, above = bulk, else maintain), `primaryMetric: 'weight'`, target carried into `goal.targets.weight`. `targetWeight`/`targetDate` remain for back-compat but `goal` is the source of truth.

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
| `pump-measurement-history` | Measurement snapshots (waist/neck/hip/manual bf) — powers bodyfat/waist/lean-mass trends |
| `pump-food-library` | Saved foods (per-base-unit macros) + saved meals — powers fuzzy suggestions and auto-populate |
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

### Log Measurements
```
[LOG_MEASUREMENT: {"waist": 88, "neck": 40, "hip": 100, "bodyFatManual": 18}]
```
- All fields optional; body fat auto-computed (Navy) from waist/neck/hip if `bodyFatManual` omitted
- Multiple blocks per response all execute; also updates the profile's current measurement values

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

### Set Cycle Start
```
[SET_CYCLE_START: {"date": "YYYY-MM-DD"}]
```
- Moves the `cycleStart` anchor in `schedulePattern.cycleStart` without touching `cycleTemplate`
- Use this — never `SET_CYCLE_TEMPLATE` — when the user says "start Week A from [date]", "reset my cycle to Monday", or asks to realign the A/B schedule
- Safe: only merges `cycleStart` into `schedulePattern`; all workout types and day definitions are preserved

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
- Chat history is held in plain `useState` (not `useLocalStorage`) and persisted only via `persistMessages`, which strips base64 images first — a single write path, so images can never be re-persisted back to storage
- Saved messages get `hadImage: true` as placeholder
- Images visible in current session (React state) but not persisted (drop to placeholders on reload)

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
Routes Coach (and Meal Builder text estimates) through the local `claude` CLI — zero API token cost for development. Uses `--print --no-session-persistence --tools "" --output-format text` flags. Photo analysis is not supported via CLI proxy (no multimodal support); switch to Anthropic or OpenRouter for photo logging. The proxy runs with `cwd: os.tmpdir()` to prevent CLAUDE.md auto-discovery (can't use `--bare` as it disables OAuth/keychain auth).

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

The service worker uses a stamped cache name (`pump-YYYYMMDD-HHMMSS`, date **and** time so multiple same-day deploys each bust the cache) so Android users automatically get updates. Network-first strategy for `index.html`, cache-first for JS/CSS assets.

### Android Installation
1. Open https://spitefulgrain40.github.io/Pump/ in Chrome
2. Chrome menu → "Add to Home Screen"
3. All data persists in localStorage

---

## Current State (as of 2026-07-02)

### Completed & Working
- **Goal-driven dashboard** — two-axis model: training **intent** (cut/recomp/bulk/maintain) + **primary metric** (weight/lean-mass/body-fat/waist/strength). GoalCard hero on Home + Progress, secondary-metric strip, per-metric optional target+date.
- **Measurement history** — `pump-measurement-history` log + "Measurements" modal + Coach `[LOG_MEASUREMENT]`; powers body-fat %, waist, and lean-mass trends (lean mass = weight × (1 − bf%)).
- Coach adapts nutrition behaviour to intent (deficit/surplus/protein emphasis) + GOAL block in system prompt
- Full onboarding wizard (goal step; seeds starting weight + first measurement snapshot)
- **Flexible cycle scheduling** — position-based `cycleTemplate` replaces weekday-anchored `weekTemplates`. Supports any repeating pattern: 8-day shift rotors, A/B fortnights, 4-on/4-off, custom. `schedule.js` utility handles all cycle maths (rotor-safe phase labels, explicit overrides win). `SET_CYCLE_TEMPLATE` command writes atomically (no A/B overwrite bug). Auto-migrates legacy profiles on load.
- **SET_CYCLE_START command** — Coach can shift the A/B cycle anchor (`schedulePattern.cycleStart`) without touching `cycleTemplate`. Prevents Coach from mangling workout day definitions when the user asks to realign the schedule to a different date.
- **Custom workout template types** — create `push_b`, `pull_a`, `legs_b` etc. via Coach; Schedule tiles inherit emoji/colour from base type automatically.
- Workout logger with set/rep/weight tracking, PR detection, draft auto-save, skip exercise
- **Meal Builder** (`MealLogger.jsx`) — description-first log flow: type a food item, hit ✓, Haiku estimates cal/protein, add next item, repeat, then "Log Meal" pushes everything as one entry. Replaces the old single-item Coach conversation approach. Supports Anthropic, OpenRouter, and CLI proxy providers.
- **Photo + portion note logging** — camera icon or gallery picker queues a pending card with a free-text "How much did you have?" field. On confirm, one multimodal Haiku call with image + portion note returns name, calories, protein. Works for both nutrition labels and meal photos. CLI proxy not supported for photo calls (no multimodal).
- **Coach AI with client-side tool use** (Anthropic provider) — 8 on-demand tools replace static data dumps in the system prompt (~40% prompt reduction): `get_nutrition_history`, `get_meal_items`, `get_workout_history`, `get_pr_records`, `get_weight_history`, `get_workout_templates`, `get_performance_summary`, `lookup_nutrition`. Coach fetches only what the conversation needs.
- Coach AI: command execution, image attachments (camera + gallery), URL fetching, web search, chat search
- **Quick prompt pills always visible** (horizontal scroll strip) — not just on empty chat
- Doc AI therapy companion with two-tier session memory (Sonnet 4.6, not Opus)
- **Progress tab (redesigned)** — three goal-adaptive sections, all logic in `utils/progressCalcs.js` with SVG components in `components/progress/`:
  - **Outcomes** — `CompositionBar` (lean/fat mass stacked bar + body-fat-vs-goal meter, tap a segment for exact figures), `ForecastChart` (single-metric linear-regression projection with axis numbers, labelled goal line, and a plain-language reason when it can't project: no target / <3 measurements in 28 days / trend moving away), and expandable sub-metric sparklines (bodyfat/leanmass/weight/waist) with axis labels + tap-a-point tooltips.
  - **Drivers — consistency model** — each ring is a rolling 7-day hit rate shown as a %, with a ▲/▼ vs 30 days ago; expand for the 30-day trend line + month-over-month change. **Workouts scored against the schedule** (completed ÷ scheduled sessions via `workoutScheduleConsistency` + `resolveDaySchedule`; rest/family days excluded, falls back to days-in-window when no cycle is configured). Protein/Calories count an unlogged day as a miss. Volume = last-30-days load vs previous 30.
  - **Records** — exercise PRs grouped by category with Epley estimated 1RM (skipped for single-rep PRs).
- **Smart food logging** — tiered accuracy replaces guess-every-time: ① barcode → Open Food Facts, ② text search → CoFID (bundled UK dataset, offline) → OFF, ③ personal food library (`pump-food-library`), ④ AI estimate only as fallback. Inline quantity parsing ("320g roast beef", "2 eggs") auto-scales from a base unit. Photos are *identified* then cross-referenced against the DB (Claude no longer does portion arithmetic). All four macros (kcal/protein/carbs/fat) captured + shown in the logger. Save individual foods or whole meals for fuzzy re-use. Pure logic in `utils/foodLibrary.js`, `utils/cofid.js`, `utils/openFoodFacts.js`, `utils/nutritionResolver.js` (all unit-tested); CoFID JSON generated by `scripts/build-cofid.cjs` (`npm run build:cofid`). Attribution: **CoFID** — Public Health England, Open Government Licence v3.0; **Open Food Facts** — ODbL.
- **Backup/restore** — JSON export/import now includes `pump-food-library`, `pump-measurement-history` and `pump-workout-templates`; import writes each key independently (an oversized `chatHistory` can't abort the restore and bounce the app to onboarding), and base64 chat images are stripped on both export and import to stay under quota
- Service worker with cache-busting for automatic Android updates
- Schedule phase colouring for shift workers; mid-workout Coach access
- Workout logger Finish is **hold-to-confirm** (1.2s fill bar) to avoid accidental completion
- Coach chat search jumps to the top of results and scrolls through all matches
- Prompt caching on Anthropic API calls (system prompt cached)
- **Vitest** unit tests for cycle logic (`utils/schedule.test.js`), goal/metrics pure logic (`utils/goal.js`, `utils/metrics.js`), and Progress-tab maths (`utils/progressCalcs.test.js`) — 69 tests, `npm test`
- Test deploy workflow (`npm run deploy:test` → `docs/test/` on master)

### Known Quirks & Limitations
- **Schedule entry shapes**: a day in `pump-workout-schedule` may be a plain type string (`'push'`, from the default generator) OR an object (`{ lunch: { type, notes }, evening: {...}, calories, protein }`, from Coach/the Schedule editor). Any code reading the schedule must normalise both.
- **Tool use is Anthropic-only**: CLI proxy and OpenRouter providers don't support the tool-use loop. Coach on those providers reverts to static context only (no on-demand data access).
- **Lean mass needs body-fat data**: it's weight × (1 − bf%), so without periodic measurement snapshots its trend is flat/empty (shows a hint).
- **eslint**: `npm run lint` ignores build output (docs/dist); ~15 pre-existing structural react-compiler / rules-of-hooks warnings in components remain (deliberately not mechanically "fixed").
- **Cross-device sync**: Not supported — backup/restore is the only migration path
- **5MB localStorage limit**: Image data is stripped from chat history to mitigate; large chat histories or many workouts could approach the limit over time
- **SET_SCHEDULE JSON truncation**: If Coach writes verbose notes into notes fields, the JSON gets truncated and the command fails silently. Notes must be under 10 words.
- **Preview server**: Requires manual `cp dist/index.src.html dist/index.html` step after each build — the deploy script handles this for production but not for local preview.

### Next Steps / Potential Improvements
- App rename (current name "Pump" is a placeholder — "Satis" is the leading candidate)
- OpenRouter tool use support (format varies by model — Claude models via OpenRouter may support Anthropic tool format)
- Chat history pruning strategy (MAX_STORED_MESSAGES ~500) as localStorage grows over time
- URL allowlist for Jina fetching (scheme validation: http/https only)
- Backup import field whitelist (prevent unexpected localStorage keys)

---

## Troubleshooting

### Coach doesn't see cycle templates
Templates in `profile.cycleTemplate` (array, position-based). If missing after migration from old `weekTemplates` format: `location.reload()` — auto-migration runs on load and writes `cycleTemplate`.

### Coach blending yesterday's and today's data
The day boundary marker is injected based on message timestamps. If old messages lack timestamps, they all appear as today. Use the Clear button in Coach header to reset chat history — memories are preserved separately.

### SET_SCHEDULE not saving
Coach wrote verbose notes. Check browser console for JSON parse errors. Notes must be under 10 words.

### CLI proxy acting as Claude Code assistant
Proxy runs with `cwd: os.tmpdir()` to prevent CLAUDE.md auto-discovery — it cannot use `--bare` because that disables OAuth/keychain auth. If Coach responses bleed in Pump-specific context, ensure you're running the latest `scripts/pump-cli-proxy.cjs` and restart the proxy.

### Android not getting updates
Hard-refresh Chrome (Settings → Privacy → Clear browsing data → Cached images). The service worker cache name changes on each deploy, which should auto-update on next load.

### Preview server 404
After `npm run build`, run: `cp dist/index.src.html dist/index.html` then retry.

### Doc Save button not visible
If the bottom sheet appears but buttons are cut off, the modal z-index may be wrong. Doc prompt editor is `z-[60]` — must be above bottom nav (`z-50`).

### Missing Coach confirmations
Check console for `"Parsed commands:"` — empty array means command format is wrong. Requires exact `[COMMAND: {...}]` syntax with valid JSON inside.

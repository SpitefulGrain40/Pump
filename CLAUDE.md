# Pump - AI-Powered Fitness Coach

A minimalist PWA for tracking strength training and weight loss with AI coaching via Claude.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS 4 (OLED dark theme)
- **Icons**: Lucide React
- **Charts**: Chart.js + react-chartjs-2
- **Date Handling**: date-fns
- **AI**: OpenRouter or Anthropic API (user-configurable); CLI provider for local dev (no token cost)
- **Storage**: localStorage (all data persists locally)

## Project Structure

```
src/
├── App.jsx                    # Main app shell with navigation + Coach modal overlay
├── index.css                  # Tailwind config + OLED theme
├── main.jsx                   # Entry point
├── components/
│   ├── Dashboard.jsx          # Home view with daily overview + today's meals
│   ├── Coach.jsx              # AI chat interface with command execution
│   ├── Doc.jsx                # AI therapy companion (separate from Coach)
│   ├── Schedule.jsx           # Fortnightly workout calendar with flexible cycle support
│   ├── Progress.jsx           # Charts, PRs, and workout consistency
│   ├── Settings.jsx           # Profile, AI config, backup/restore
│   ├── Nutrition.jsx          # Full nutrition history with daily targets
│   ├── MealLogger.jsx         # Quick meal logging modal
│   ├── WorkoutLogger.jsx      # Exercise logging with PR detection + mid-workout Coach access
│   └── WeightModal.jsx        # Quick weigh-in modal
├── hooks/
│   ├── useLocalStorage.js     # Generic localStorage hook with cross-component sync
│   ├── useUserProfile.js      # User goals, targets, week type / phase calculation
│   ├── useWeightHistory.js    # Weight tracking
│   ├── useNutritionLogs.js    # Meal logging and daily totals
│   ├── useWorkoutLogs.js      # Workout logs, PRs, schedule management, templates
│   └── useSettings.js         # AI settings + backup utilities
├── services/
│   └── ai/
│       ├── index.js           # Unified exports
│       ├── providers.js       # OpenRouter + Anthropic + CLI proxy adapters
│       └── context.js         # System prompt + context builder + command parser
├── utils/
│   └── dataSchemas.js         # Data structures, defaults, week templates
└── scripts/
    └── pump-cli-proxy.cjs     # Local dev proxy: routes Coach through claude CLI (no API cost)
```

## Navigation

The app has 5 bottom-nav tabs:
- **Home** - Dashboard with goals, today's workout, nutrition summary, today's meals
- **Food** - Full nutrition history, daily targets from schedule, meal logging
- **Schedule** - Fortnightly calendar with flexible cycle support, completion checkboxes
- **Doc** - AI therapy companion (Doc persona, separate chat history)
- **More** (drawer) → **Coach** / **Progress** / **Settings**

**Coach** is also accessible as a floating bubble (bottom-right) on Home, Food, and Schedule tabs, and inside the WorkoutLogger mid-session. Tapping the bubble opens Coach as a slide-up modal overlay without leaving the current tab.

## z-index Hierarchy

| Layer | z-index | Component |
|-------|---------|-----------|
| Bottom nav | z-50 | App.jsx nav |
| Coach bubble | z-40 | App.jsx floating button |
| Coach modal | z-[60] | App.jsx modal overlay |
| WorkoutLogger | z-[70] | WorkoutLogger.jsx |
| Coach in workout | z-[75] | WorkoutLogger bubble |
| Coach over workout | z-[80] | WorkoutLogger Coach modal |
| Prompt editor | z-[80] | Coach.jsx system prompt editor |

## Data Schemas

### User Profile (`pump-user-profile`)
```javascript
{
  name: 'User Name',
  gender: 'male',
  age: 35,
  height: 180,
  currentWeight: 104.5,
  startingWeight: 106,
  targetWeight: 90,
  targetDate: '2026-07-31',
  tdee: 2723,                              // Can be set from Garmin/external source
  calorieTarget: { min: 2200, max: 2400 },
  proteinTarget: { min: 180, max: 200 },
  bodyFatPercentage: 25,
  neckCircumference: 40,
  waistCircumference: 95,
  hipCircumference: null,                  // Required for females
  physicalNotes: 'Slipped discs in neck',
  activityLevel: 'moderate',
  schedulePattern: {
    type: 'alternating' | 'rotating' | 'fixed' | 'custom',
    cycleLength: 14,                       // Days per full cycle (8 for 4-on/4-off, 14 for A/B)
    cycleStart: '2026-05-05',              // Anchor date for cycle calculation
    labels: ['A', 'B'],                    // Phase labels (e.g. ['On Shift', 'Off Shift'])
    description: 'Week A/B rotation',
    weekAStart: '2026-05-05'              // Legacy format — auto-migrated on load
  },
  weekTemplates: {                         // Coach uses these for planning
    A: { mon: {...}, tue: {...}, ... },
    B: { mon: {...}, tue: {...}, ... }
  },
  onboardingComplete: true
}
```

**Schedule pattern migration**: Old profiles with `schedulePattern.weekAStart` (no `type`/`cycleStart`) are supported via fallback logic in `useUserProfile.js` and `context.js`. No manual migration needed.

**Phase calculation** (`getWeekTypeForDate` in `useUserProfile.js`):
- New format: `positionInCycle = daysDiff % cycleLength`, then `weekIndex = floor(position / 7)` → `labels[weekIndex]`
- Day-level cycles (cycleLength < 14, e.g. 4-on/4-off): `phaseIndex = floor(position / (cycleLength / labels.length))`
- Legacy: `weekNumber = floor(daysDiff / 7)`, alternates A/B

### AI Settings (`pump-ai-settings`)
```javascript
{
  provider: 'openrouter' | 'anthropic' | 'cli',
  openrouterKey: 'sk-or-...',
  anthropicKey: 'sk-ant-...',
  model: 'anthropic/claude-sonnet-4-20250514',
  anthropicModel: 'claude-sonnet-4-6'
}
```

`provider: 'cli'` routes through the local proxy at `http://localhost:3141/chat` — no API key required. Default provider is `anthropic`.

### Workout Schedule (`pump-workout-schedule`)
```javascript
{
  "2026-05-08": {
    lunch: { type: 'push', notes: 'Gym between shouts' },
    evening: { type: 'skate', notes: 'Garage session' },
    calories: 2300,
    protein: 180,
    notes: 'Bed by 11:30pm'
  }
}
```

### Completed Workouts (`pump-completed-workouts`)
```javascript
{ "2026-05-08": { lunch: true, evening: false } }
```

### Meal Log (`pump-nutrition-logs`)
```javascript
[{
  id: 'meal-1715180400000',
  timestamp: '2026-05-08T12:30:00Z',
  items: [
    { name: 'Chicken breast', calories: 280, protein: 52 },
    { name: 'Rice', calories: 200, protein: 4 }
  ],
  totals: { calories: 480, protein: 56 },
  photoAnalyzed: false
}]
```

### Workout Log (`pump-workout-logs`)
```javascript
[{
  id: 'workout-2026-05-08-1715180400000',
  date: '2026-05-08',
  exercises: [{
    name: 'Landmine Press',
    actual: { sets: [true, true, true, true], reps: [8,8,8,8], weight: [30,30,30,30] }
  }],
  completedAt: '2026-05-08T13:00:00Z',
  notes: 'Felt strong today'
}]
```

### Personal Records (`pump-prs`)
```javascript
{ "Landmine Press": { weight: 35, date: '2026-05-08T13:00:00Z' } }
```

### Chat History (`pump-chat-history`)
```javascript
[{
  role: 'user',
  content: 'Log my lunch...',
  timestamp: 1715180400000
}, {
  role: 'assistant',
  content: 'Got it!\n\n✓ Logged meal: 400 kcal, 45g protein',
  timestamp: 1715180401000
}]
```

### Workout Draft (`pump-workout-draft`)
```javascript
{
  date: '2026-05-08',
  exercises: [...],   // Full exercises array with actual sets/reps/weight
  savedAt: '2026-05-08T13:00:00Z'
}
```
Auto-saved on every set tick. Restored when the same workout is reopened. Cleared on Finish.

### Doc Chat (`pump-doc-chat`, `pump-doc-longterm`, `pump-doc-sessions`, `pump-doc-system-prompt`)
Doc maintains its own separate chat history, long-term memory, session log, and custom system prompt — entirely independent of Coach.

### Coach Custom Prompt (`pump-coach-system-prompt`)
Optional override for the Coach system prompt. Empty = use the default context-aware prompt.

## localStorage Keys Summary

| Key | Purpose |
|-----|---------|
| `pump-user-profile` | User profile, goals, schedule pattern, week templates |
| `pump-ai-settings` | Provider, API keys, model selection |
| `pump-workout-schedule` | Daily schedule (type, notes, calories, protein) |
| `pump-completed-workouts` | Which sessions were completed per date |
| `pump-nutrition-logs` | Meal log array |
| `pump-workout-logs` | Completed workout log array |
| `pump-prs` | Personal records per exercise |
| `pump-weight-history` | Weight entries array |
| `pump-chat-history` | Coach chat history |
| `pump-coach-memories` | Coach long-term memories |
| `pump-coach-system-prompt` | Custom Coach system prompt override |
| `pump-workout-draft` | In-progress workout auto-save |
| `pump-doc-chat` | Doc chat history |
| `pump-doc-longterm` | Doc long-term memory |
| `pump-doc-sessions` | Doc session log |
| `pump-doc-system-prompt` | Custom Doc system prompt override |
| `pump-planning-snoozed` | Schedule planning banner snooze timestamp |
| `pump-pending-coach-prompt` | Pre-filled prompt passed to Coach on open |

## AI Commands

Coach can execute these commands by including them in responses:

### Log Meal
```
[LOG_MEAL: {"items": [{"name": "Chicken breast", "calories": 280, "protein": 52}], "totals": {"calories": 280, "protein": 52}}]
```
Multiple `[LOG_MEAL:]` blocks in one response are all executed (uses `extractAllJSON`).

### Log Weight
```
[LOG_WEIGHT: {"weight": 104.2}]
```

### Log Workout Performance
```
[LOG_WORKOUT: {"date": "2026-05-08", "exercises": [{"name": "Landmine Press", "sets": 4, "reps": [8,8,8,8], "weight": [30,30,30,30]}], "notes": "Felt strong"}]
```

### Set Schedule (Bulk)
```
[SET_SCHEDULE: {
  "2026-05-08": {
    "lunch": {"type": "push", "notes": "Gym between shouts"},
    "evening": {"type": "rest"},
    "calories": 2300,
    "protein": 180,
    "notes": "Bed by 11:30pm"
  }
}]
```
One block per message, max 14 days. Notes fields must be short (under 10 words) to avoid JSON truncation.

### Update Profile
```
[UPDATE_PROFILE: {"tdee": 2723, "calorieTarget": {"min": 2000, "max": 2200}}]
```

### Save Week Templates
```
[UPDATE_PROFILE: {"weekTemplates": {
  "On Shift": { "mon": {"lunch": {"type": "push"}, "calories": 3800} },
  "Off Shift": { "mon": {"lunch": {"type": "rest"}, "calories": 3200} }
}}]
```

### Modify Workout Template (incremental)
```
[UPDATE_TEMPLATE: {"template": "push", "action": "add", "exercise": {"name": "Bench Press", "sets": 4, "reps": 8, "weight": 80}}]
[UPDATE_TEMPLATE: {"template": "push", "action": "remove", "exerciseName": "Bench Press"}]
[UPDATE_TEMPLATE: {"template": "push", "action": "update", "exerciseName": "Bench Press", "updates": {"weight": 85}}]
```
Multiple `[UPDATE_TEMPLATE:]` blocks in one response are all executed.

### Replace Full Workout Template
```
[SET_TEMPLATE: {"template": "push", "exercises": [{"name": "Barbell Bench Press", "sets": 4, "reps": 8, "weight": 80}, ...]}]
```
Replaces all exercises in the template at once. Multiple `[SET_TEMPLATE:]` blocks supported.

### Memory
```
[SAVE_MEMORY: {"type": "preference", "content": "Hates burpees"}]
[FORGET_MEMORY: {"content": "Hates burpees"}]
```
Types: `preference` | `injury` | `insight` | `milestone` | `other`

## Schedule Phase Colouring

For day-level cycles (cycleLength < 14, e.g. 4-on/4-off with cycleLength 8):
- **On-shift days**: green tinted tile + green dot (top-left)
- **Off-shift days**: standard surface tile + grey dot
- **Today**: green accent ring as always

For A/B weekly patterns (cycleLength 14) and fixed schedules: standard activity colour coding unchanged.

## Key Features

### Coach Modal
- Floating green bubble (bottom-right) on Home, Food, Schedule tabs
- Also available inside WorkoutLogger at z-[75] — tap to open Coach over the workout
- Dismissing Coach returns to the exact view/workout you were in
- Requests complete even if modal is closed mid-response (persisted to localStorage)

### Workout Draft Auto-Save
- Every set tick saves progress to `pump-workout-draft`
- Reopening the same workout restores all set data
- Cleared automatically on Finish

### Schedule Planning Banner
- Shows Fri/Sat/Sun when next week isn't planned
- "Ask Coach" pre-fills prompt with date range and phase label
- Can snooze for 24 hours

### Nutrition Tracking
- Daily calorie/protein targets from schedule (falls back to profile)
- Today's meals shown on Dashboard
- Full history in Nutrition tab with date navigation
- 7-day averages

### Workout Consistency
- 30-day grid on Progress page
- Green = completed, Red = missed scheduled workout, Gray = rest day
- Streak counter

### Cross-Component Sync
- localStorage changes sync across all components via custom events
- No page refresh needed when Coach logs data

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Build for production
npm run preview    # Preview production build
```

### CLI Proxy (token-free local testing)
Runs Coach through your local `claude` CLI session — no API tokens consumed.

```bash
node scripts/pump-cli-proxy.cjs &   # Start proxy on localhost:3141
npm run dev                          # Or: npm run preview -- --port 4173
```

Then set provider to **CLI (local)** in Settings. The proxy uses `--bare --no-session-persistence --tools ""` to ensure complete isolation from your current Claude Code session.

Custom slash commands are available:
- `/pump-dev` — starts proxy + dev server
- `/pump-test` — builds + starts proxy + preview server on port 4173

## Building for Android

1. Run `npm run build`
2. Copy entire `dist/` folder to Google Drive
3. Download folder on Android device
4. Open `index.html` in Chrome
5. Use app - all data persists in localStorage
6. Optionally: Chrome menu → "Add to Home Screen" for app-like experience

## Backup & Restore

Via Settings page:
- **Export**: Downloads `pump-backup-{date}.json` with all localStorage data
- **Import**: Restores from backup file

**Important**: Always export a backup before clearing browser data or switching devices!

## Key Files to Modify

| Change | File |
|--------|------|
| User defaults & week templates | `src/utils/dataSchemas.js` |
| AI behavior & commands | `src/services/ai/context.js` |
| Theme colors | `src/index.css` (`:root` variables) |
| Exercise library | `src/utils/dataSchemas.js` → `EXERCISE_LIBRARY` |
| Workout templates | `src/utils/dataSchemas.js` → `WORKOUT_TEMPLATES` |
| CLI proxy | `scripts/pump-cli-proxy.cjs` |

## Troubleshooting

### Coach doesn't see week templates
Templates are stored in `profile.weekTemplates`. If missing after migration:
```javascript
location.reload(); // Auto-migration runs on load
```

### Old weekAStart profile not showing correct phase
Old `schedulePattern: { weekAStart: '...' }` profiles auto-migrate — the fallback in `getWeekTypeForDate` handles them. No manual action needed.

### Data not syncing between tabs
The app uses custom events for same-tab sync. Cross-tab sync is not supported — use one tab only.

### Missing confirmations in Coach
Check browser console for `"Parsed commands:"` — if empty array, the command format is wrong. Requires exact `[COMMAND: {...}]` syntax with valid JSON.

### SET_SCHEDULE not saving
Usually caused by Coach writing verbose notes (full exercise lists) into the notes fields, bloating the JSON beyond what the response can complete. Notes must be short (under 10 words). Check console for JSON parse errors.

### CLI proxy persona bleed
The proxy must use `--bare --no-session-persistence` flags. If Coach starts referencing dev tools or file access, restart the proxy — the old version (without `--bare`) may still be running.

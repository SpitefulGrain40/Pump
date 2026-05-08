# Pump - AI-Powered Fitness Coach

A minimalist PWA for tracking strength training and weight loss with AI coaching via Claude.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS 4 (OLED dark theme)
- **Icons**: Lucide React
- **Charts**: Chart.js + react-chartjs-2
- **Date Handling**: date-fns
- **AI**: OpenRouter or Anthropic API (user-configurable)
- **Storage**: localStorage (all data persists locally)

## Project Structure

```
src/
├── App.jsx                    # Main app shell with navigation
├── index.css                  # Tailwind config + OLED theme
├── main.jsx                   # Entry point
├── components/
│   ├── Dashboard.jsx          # Home view with daily overview + today's meals
│   ├── Coach.jsx              # AI chat interface with command execution
│   ├── Schedule.jsx           # Fortnightly workout calendar with Week A/B
│   ├── Progress.jsx           # Charts, PRs, and workout consistency
│   ├── Settings.jsx           # Profile, AI config, backup/restore
│   ├── Nutrition.jsx          # Full nutrition history with daily targets
│   ├── MealLogger.jsx         # Quick meal logging modal
│   ├── WorkoutLogger.jsx      # Exercise logging with PR detection
│   └── WeightModal.jsx        # Quick weigh-in modal
├── hooks/
│   ├── useLocalStorage.js     # Generic localStorage hook with cross-component sync
│   ├── useUserProfile.js      # User goals, targets, week type calculation
│   ├── useWeightHistory.js    # Weight tracking
│   ├── useNutritionLogs.js    # Meal logging and daily totals
│   ├── useWorkoutLogs.js      # Workout logs, PRs, and schedule management
│   └── useSettings.js         # AI settings + backup utilities
├── services/
│   └── ai/
│       ├── index.js           # Unified exports
│       ├── providers.js       # OpenRouter + Anthropic adapters
│       └── context.js         # System prompt + context builder + command parser
└── utils/
    └── dataSchemas.js         # Data structures, defaults, week templates
```

## Navigation

The app has 5 main tabs:
- **Home** - Dashboard with goals, today's workout, nutrition summary, today's meals
- **Food** - Full nutrition history, daily targets from schedule, meal logging
- **Coach** - AI chat for logging meals/workouts, planning schedules, advice
- **Schedule** - Fortnightly calendar with Week A/B, completion checkboxes
- **Progress** - Weight chart, calorie chart, workout consistency, PRs

Settings is accessed via the gear icon on the Progress page.

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
  schedulePattern: { weekAStart: '2026-05-05' },
  weekTemplates: {                         // Coach uses these for planning
    A: { mon: {...}, tue: {...}, ... },
    B: { mon: {...}, tue: {...}, ... }
  },
  onboardingComplete: true
}
```

### AI Settings (`pump-ai-settings`)
```javascript
{
  provider: 'openrouter' | 'anthropic',
  openrouterKey: 'sk-or-...',
  anthropicKey: 'sk-ant-...',
  model: 'anthropic/claude-sonnet-4-20250514',
  anthropicModel: 'claude-sonnet-4-6'
}
```

### Workout Schedule (`pump-workout-schedule`)
```javascript
{
  "2026-05-08": {
    lunch: { type: 'push', notes: 'Push + SB Strength (60m)' },
    evening: { type: 'skate', notes: 'Garage session 30-45m' },
    calories: 2300,      // Day-specific calorie target
    protein: 180,        // Day-specific protein target (optional)
    notes: 'Solo | Bed by 11:30pm'
  }
}
```

### Completed Workouts (`pump-completed-workouts`)
```javascript
{
  "2026-05-08": { lunch: true, evening: false }
}
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
{
  "Landmine Press": { weight: 35, date: '2026-05-08T13:00:00Z' },
  "DB Incline Press": { weight: 25, date: '2026-05-07T12:30:00Z' }
}
```

### Chat History (`pump-chat-history`)
```javascript
[{
  role: 'user',
  content: 'Log my lunch - chicken salad about 400 cals 45g protein',
  timestamp: 1715180400000
}, {
  role: 'assistant',
  content: 'Got it! I\'ve logged your chicken salad.\n\n✓ Logged meal: 400 kcal, 45g protein',
  timestamp: 1715180401000
}]
```

## AI Commands

Coach can execute these commands by including them in responses:

### Log Meal
```
[LOG_MEAL: {"items": [{"name": "Chicken breast", "calories": 280, "protein": 52}], "totals": {"calories": 280, "protein": 52}}]
```

### Log Weight
```
[LOG_WEIGHT: {"weight": 104.2}]
```

### Log Workout Performance
```
[LOG_WORKOUT: {"date": "2026-05-08", "exercises": [{"name": "Landmine Press", "sets": 4, "reps": [8,8,8,8], "weight": [30,30,30,30]}], "notes": "Felt strong"}]
```
- Logs exercise details with sets/reps/weights
- Auto-detects and records new PRs
- Marks the day's workout as complete

### Set Schedule (Bulk)
```
[SET_SCHEDULE: {
  "2026-05-08": {
    "lunch": {"type": "push", "notes": "Push + SB Strength"},
    "evening": {"type": "rest"},
    "calories": 2300,
    "notes": "Solo day"
  }
}]
```

### Update Profile
```
[UPDATE_PROFILE: {"tdee": 2723, "calorieTarget": {"min": 2000, "max": 2200}}]
```

## Week A/B System

The app uses a co-parenting schedule pattern:
- **Week A**: More solo time (different Fri/Sat/Sun activities)
- **Week B**: More Nyxie time (different Fri/Sat/Sun activities)
- Week type is calculated from `schedulePattern.weekAStart` date
- Templates in `weekTemplates.A` and `weekTemplates.B` define the patterns
- Coach uses these templates when planning upcoming weeks

## Key Features

### Schedule Planning Banner
- Shows Fri/Sat/Sun when next week isn't planned
- "Ask Coach" pre-fills prompt with date range and week type
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

## Building for Android

1. Run `npm run build`
2. Copy entire `dist/` folder to Google Drive
3. Download folder on Android device
4. Open `index.html` in Chrome
5. Use app - all data persists in localStorage
6. Optionally: Chrome menu → "Add to Home Screen" for app-like experience

**Data Persistence**: All data (profile, meals, workouts, chat history, settings) is stored in the browser's localStorage and will persist as long as you use the same browser and don't clear site data.

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

## Troubleshooting

### Coach doesn't see week templates
Run in browser console to add templates to existing profile:
```javascript
const profile = JSON.parse(localStorage.getItem('pump-user-profile'));
if (!profile.weekTemplates) {
  // Templates will auto-migrate on next page load
  location.reload();
}
```

### Data not syncing between tabs
The app uses custom events for same-tab sync. Cross-tab sync is not supported - use one tab only.

### Missing confirmations in Coach
Check browser console for "Parsed commands:" - if empty array, Coach didn't use the command format correctly. The command parsing requires exact `[COMMAND: {...}]` syntax.

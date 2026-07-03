# Pump User Guide

## Getting Started

### First Launch
1. Open the app and go to **Settings** (gear icon)
2. Configure your **AI Provider**:
   - Choose OpenRouter or Anthropic
   - Enter your API key
   - Tap "Test Connection" to verify
3. Review your **Profile** settings (pre-filled with your goals)
4. Go to **Schedule** and tap "Generate" to create your workout plan

### Daily Workflow

**Morning:**
1. Open Pump → Dashboard shows today's overview
2. Tap the weight button to log your morning weigh-in

**Meals:**
1. Tap "Log Meal" on Dashboard
2. Either:
   - Take a photo → AI analyzes and estimates calories
   - Manually enter items in the table
3. Review and save

**Workout:**
1. Dashboard shows today's planned workout
2. Tap "Start Workout"
3. For each exercise:
   - Tap the circle to mark a set complete
   - Adjust reps/weight if different from plan
   - Rest timer starts automatically
4. Tap "Finish" when done
5. New PRs are celebrated! 🎉

---

## Features

### Dashboard
- **Goal countdown**: Days remaining to target weight
- **Progress bar**: Visual progress toward 90kg
- **Today's workout**: What's planned for today
- **Calorie/Protein trackers**: Real-time progress rings
- **Quick actions**: Log meal, weigh in, ask Coach

### Coach (AI Chat)
Your personal AI fitness coach that:
- Knows your goals, schedule, and limitations
- Can log meals from text descriptions
- Suggests workout modifications for your neck
- Tracks your progress and keeps you accountable

**Quick prompts:**
- "Log my meal" - Describe food and Coach logs it
- "Today's workout" - Get a walkthrough
- "Neck hurts" - Get exercise modifications
- "Am I on track?" - Progress check-in

### Schedule
- **Fortnightly view**: See both Week A and Week B
- **Color-coded**: Push (blue), Pull (green), Legs (orange)
- **Tap any day** to change the workout type
- **Generate button**: Creates a fresh 2-week plan

### Progress
- **Weight chart**: Trend line toward your goal
- **Calorie bars**: Color-coded by target range
- **PR leaderboard**: All your personal records
- **Consistency calendar**: 30-day workout heatmap

### Settings
- **Profile**: Edit goals, targets, physical notes
- **AI Provider**: Switch between OpenRouter/Anthropic
- **Data**: Export/import backups, clear data

---

## Tips

### Logging Food
- **Type with a quantity**: "320g roast beef" or "2 eggs" — Pump parses the amount, looks the food up, and fills in the macros for you. No guessing.
- **Scan a barcode**: Tap the barcode icon and snap the barcode on any packaged product. Verified nutrition comes straight from Open Food Facts.
- **Photo method**: Take a pic of a plate or a nutrition label. Pump identifies the food and cross-references the database for accurate numbers; it only estimates when the food isn't found.
- **Save your regulars**: Tap the bookmark on any item to save it to *my foods*, or "Save meal" to store a whole meal. Next time, just start typing and pick it from the suggestions.
- **Four macros**: calories, protein, carbs and fat are all captured and shown.
- **Round numbers are fine**: This is about trends, not precision.

### Saving Foods & Scanning Barcodes
- Saved foods store macros **per base unit** (per 100g, per serving, or per item), so any portion scales exactly.
- Your saved foods and meals sync via **backup/restore** like everything else.
- **Data sources & attribution**: generic UK foods use **CoFID** (McCance & Widdowson's Composition of Foods Integrated Dataset, © Crown copyright, Public Health England, Open Government Licence v3.0). Packaged products use **Open Food Facts** (Open Database Licence, ODbL).

### Using Coach Effectively
- **Be conversational**: "My neck is sore today" works
- **Ask for modifications**: Coach knows your slipped discs
- **Request schedule changes**: "Move leg day to Friday"
- **Check in**: "How am I doing this week?"

### Workouts
- **Log as you go**: Mark sets complete during rest
- **Adjust weights**: If it's too easy/hard, change it
- **PRs count**: Going up 2.5kg counts as progress
- **Rest timer**: 90 seconds default, adjust in your head

### Weight Tracking
- **Same time daily**: Morning, after bathroom, before eating
- **Don't panic**: Weight fluctuates 1-2kg daily (water, food)
- **Weekly trend matters**: Not daily number

---

## Transferring to Android

### From PC to Phone
1. In Pump, go to Settings → Data → **Export Backup**
2. This downloads `pump-backup-{date}.json`
3. Upload this file to Google Drive

4. Build the app:
   ```
   npm run build
   ```
5. Zip the `dist` folder
6. Upload zip to Google Drive

7. On Android:
   - Download and unzip the `dist` folder
   - Open `index.html` in Chrome
   - Tap Chrome menu (⋮) → "Add to Home Screen"
   - Open the app from home screen
   - Go to Settings → Data → **Import Backup**
   - Select your backup file

### Syncing Between Devices
1. Export backup on source device
2. Upload to Google Drive
3. Download on target device
4. Import backup

**Note**: Do this regularly to keep devices in sync.

---

## Troubleshooting

### AI not responding
- Check Settings → AI Provider → Test Connection
- Verify API key is entered correctly
- Check internet connection
- Try a different model (Haiku is fastest)

### Data disappeared
- Check if you're on the same device/browser
- Data is stored in browser localStorage
- Import a backup if you have one

### App not installing on Android
- Must use Chrome browser
- Open `index.html` directly (not via file manager)
- Use Chrome menu → Add to Home Screen

### Photo analysis not working
- Ensure camera permissions are granted
- Check AI provider is configured
- Try gallery upload instead of camera

---

## Your Profile

| Setting | Value |
|---------|-------|
| Target Weight | 90 kg |
| Target Date | July 31, 2026 |
| Daily Calories | 2,200-2,400 kcal |
| Daily Protein | 180-200g |
| TDEE | 2,723 kcal |
| Physical Note | Slipped discs in neck |

Edit these anytime in Settings → Profile.

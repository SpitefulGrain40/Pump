import { format, parseISO, differenceInDays, subDays, addDays } from 'date-fns';
import { getCyclePosition, getPhaseLabel, getPhaseLabelByPosition, resolveDaySchedule } from '../../utils/schedule';
import { getNavyBodyFat } from '../../utils/calculations';

// Build memory section for system prompt
function formatMemories(memories) {
  if (!memories || memories.length === 0) return '';

  const grouped = {
    preference: [],
    insight: [],
    milestone: [],
    injury: [],
    other: []
  };

  memories.forEach(m => {
    const type = m.type || 'other';
    if (grouped[type]) {
      grouped[type].push(m);
    } else {
      grouped.other.push(m);
    }
  });

  let section = '\n## COACH MEMORIES\nThings I remember about you from previous conversations:\n';

  if (grouped.preference.length > 0) {
    section += '\n### Preferences\n';
    grouped.preference.forEach(m => {
      section += `- ${m.content}\n`;
    });
  }

  if (grouped.injury.length > 0) {
    section += '\n### Current Injuries/Limitations\n';
    grouped.injury.forEach(m => {
      section += `- ${m.content}${m.date ? ` (${m.date})` : ''}\n`;
    });
  }

  if (grouped.insight.length > 0) {
    section += '\n### Patterns I\'ve Noticed\n';
    grouped.insight.forEach(m => {
      section += `- ${m.content}\n`;
    });
  }

  if (grouped.milestone.length > 0) {
    section += '\n### Milestones & Events\n';
    grouped.milestone.forEach(m => {
      section += `- ${m.content}${m.date ? ` (${m.date})` : ''}\n`;
    });
  }

  if (grouped.other.length > 0) {
    section += '\n### Other Notes\n';
    grouped.other.forEach(m => {
      section += `- ${m.content}\n`;
    });
  }

  return section;
}

// Compact, position-based view of the user's cycle for the Coach prompt.
// Shows weekday so Coach knows which real day each position maps to.
function formatCycle(profile) {
  const sp = profile.schedulePattern;
  const ct = profile.cycleTemplate;
  if (!ct || Object.keys(ct).length === 0) return null;

  const len = sp?.cycleLength || Object.keys(ct).length;
  const todayPos = getCyclePosition(sp, new Date());
  const cycleStart = sp?.cycleStart ? parseISO(sp.cycleStart) : null;
  const lines = [];

  for (let p = 1; p <= len; p++) {
    const day = ct[String(p)];
    const label = getPhaseLabelByPosition(sp, p);
    const type = day?.lunch?.type || day?.type || 'rest';
    const evening = day?.evening?.type ? ` + ${day.evening.type}` : '';
    const notes = day?.lunch?.notes ? ` (${day.lunch.notes})` : '';
    const cals = day?.calories ? ` | ${day.calories} kcal` : '';
    const marker = p === todayPos ? '   ← today' : '';
    const weekday = cycleStart ? format(addDays(cycleStart, p - 1), 'EEE') : '';
    const weekdayStr = weekday ? ` ${weekday}` : '';
    lines.push(`${String(p).padStart(2)}${weekdayStr} [${label}] ${type}${evening}${notes}${cals}${marker}`);
  }
  return lines.join('\n');
}

// The user's actual exercise lists, so Coach can suggest concrete swaps when
// asked to "change things up" instead of guessing what they currently do.
function formatTemplates(templates) {
  if (!templates) return null;
  const lines = [];
  Object.entries(templates).forEach(([key, t]) => {
    if (!t?.exercises?.length) return;
    const exs = t.exercises
      .map(e => `${e.name} ${e.sets}x${e.reps}${e.weight ? ` @${e.weight}kg` : ''}`)
      .join(', ');
    lines.push(`- ${key}: ${exs}`);
  });
  return lines.length ? lines.join('\n') : null;
}

// Build performance metrics from historical data. currentWeight, if given, is
// the weight-history-resolved value (falls back to profile.currentWeight) —
// see resolveCurrentWeight below. Keeps weightChangeTotal from silently
// disagreeing with the weightChange2Weeks figure computed a few lines below,
// which already reads weightHistory directly.
export function buildPerformanceContext(completedDays, weightHistory, nutritionLogs, schedule, profile, currentWeight = profile.currentWeight) {
  const today = new Date();
  const twoWeeksAgo = subDays(today, 14);

  // Calculate completion rate for last 2 weeks
  let scheduledSessions = 0;
  let completedSessions = 0;
  const missedSessions = [];

  for (let i = 0; i < 14; i++) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const daySchedule = schedule[dateStr];

    if (daySchedule && typeof daySchedule === 'object') {
      if (daySchedule.lunch && daySchedule.lunch.type !== 'rest' && daySchedule.lunch.type !== 'family') {
        scheduledSessions++;
        if (completedDays[dateStr]?.lunch) {
          completedSessions++;
        } else if (i > 0) { // Don't count today as missed
          missedSessions.push({ date: dateStr, type: daySchedule.lunch.type, session: 'lunch' });
        }
      }
      if (daySchedule.evening && daySchedule.evening.type !== 'rest') {
        scheduledSessions++;
        if (completedDays[dateStr]?.evening) {
          completedSessions++;
        } else if (i > 0) {
          missedSessions.push({ date: dateStr, type: daySchedule.evening.type, session: 'evening' });
        }
      }
    }
  }

  const completionPercentage = scheduledSessions > 0
    ? Math.round((completedSessions / scheduledSessions) * 100)
    : 100;

  // Calculate all-time stats
  let totalCompleted = 0;
  Object.values(completedDays).forEach(day => {
    if (day.lunch) totalCompleted++;
    if (day.evening) totalCompleted++;
  });

  // Calculate current streak
  let currentStreak = 0;
  for (let i = 1; i <= 365; i++) {
    const date = subDays(today, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const daySchedule = schedule[dateStr];
    const dayCompleted = completedDays[dateStr];

    if (!daySchedule) break;

    const hasLunch = daySchedule.lunch && daySchedule.lunch.type !== 'rest' && daySchedule.lunch.type !== 'family';
    const hasEvening = daySchedule.evening && daySchedule.evening.type !== 'rest';

    const lunchDone = !hasLunch || dayCompleted?.lunch;
    const eveningDone = !hasEvening || dayCompleted?.evening;

    if (lunchDone && eveningDone) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Weight trend calculations
  const sortedWeights = [...weightHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
  const recentWeights = sortedWeights.filter(w => new Date(w.date) >= twoWeeksAgo);

  let weightChange2Weeks = 0;
  if (recentWeights.length >= 2) {
    weightChange2Weeks = recentWeights[0].weight - recentWeights[recentWeights.length - 1].weight;
  }

  const weightChangeTotal = profile.startingWeight && currentWeight
    ? profile.startingWeight - currentWeight
    : 0;

  // Calculate required vs current rate. Prefer the goal model's weight target,
  // falling back to the legacy targetWeight/targetDate for un-migrated profiles.
  const goalWeightTarget = profile.goal?.targets?.weight?.value ?? profile.targetWeight ?? null;
  const goalWeightDate = profile.goal?.targets?.weight?.date ?? profile.targetDate ?? null;
  const daysToGoal = goalWeightDate ? differenceInDays(parseISO(goalWeightDate), today) : null;
  const weightToLose = currentWeight && goalWeightTarget
    ? currentWeight - goalWeightTarget
    : 0;
  const requiredRate = daysToGoal && weightToLose ? (weightToLose / daysToGoal) * 7 : 0;
  const currentRate = recentWeights.length >= 2 ? Math.abs(weightChange2Weeks) / 2 : 0;
  const onTrack = Math.abs(currentRate - requiredRate) <= 0.2;

  // Nutrition averages (last 2 weeks)
  const recentMeals = nutritionLogs.filter(m => new Date(m.timestamp) >= twoWeeksAgo);
  const mealsByDay = {};
  recentMeals.forEach(m => {
    const day = format(parseISO(m.timestamp), 'yyyy-MM-dd');
    if (!mealsByDay[day]) mealsByDay[day] = { calories: 0, protein: 0 };
    mealsByDay[day].calories += m.totals?.calories || 0;
    mealsByDay[day].protein += m.totals?.protein || 0;
  });

  const daysWithMeals = Object.keys(mealsByDay).length;
  const totalCals = Object.values(mealsByDay).reduce((sum, d) => sum + d.calories, 0);
  const totalProtein = Object.values(mealsByDay).reduce((sum, d) => sum + d.protein, 0);

  const avgCalories = daysWithMeals > 0 ? Math.round(totalCals / daysWithMeals) : 0;
  const avgProtein = daysWithMeals > 0 ? Math.round(totalProtein / daysWithMeals) : 0;

  let caloriesVsTarget = 'unknown';
  if (profile.calorieTarget?.min && profile.calorieTarget?.max && avgCalories > 0) {
    if (avgCalories < profile.calorieTarget.min) caloriesVsTarget = 'under';
    else if (avgCalories > profile.calorieTarget.max) caloriesVsTarget = 'over';
    else caloriesVsTarget = 'within';
  }

  return {
    recentCompletion: {
      completed: completedSessions,
      scheduled: scheduledSessions,
      percentage: completionPercentage,
    },
    missedSessions: missedSessions.slice(0, 5), // Limit to 5 most recent
    totalWorkoutsCompleted: totalCompleted,
    currentStreak,
    weightChange2Weeks: Math.round(weightChange2Weeks * 10) / 10,
    weightChangeTotal: Math.round(weightChangeTotal * 10) / 10,
    currentRate: Math.round(currentRate * 10) / 10,
    requiredRate: Math.round(requiredRate * 10) / 10,
    onTrack,
    avgCalories,
    avgProtein,
    caloriesVsTarget,
  };
}

export function buildOnboardingPrompt(profile) {
  // Determine what's been collected (checking for explicit values, not defaults)
  const hasName = !!profile.name && profile.name.trim() !== '';
  const hasAge = profile.age !== null && profile.age > 0;
  const hasHeight = profile.height !== null && profile.height > 0;
  const hasWeight = profile.currentWeight !== null && profile.currentWeight > 0;
  const hasNeck = profile.neckCircumference !== null && profile.neckCircumference > 0;
  const hasWaist = profile.waistCircumference !== null && profile.waistCircumference > 0;
  const hasTarget = profile.targetWeight !== null && profile.targetDate !== null;
  const hasSchedule = profile.schedulePattern?.cycleStart !== null || profile.schedulePattern?.weekAStart !== null;

  // Build status of what's collected
  const collected = [];
  const missing = [];

  if (hasName) collected.push(`Name: ${profile.name}`);
  else missing.push('name');

  // Gender - always ask to confirm since male is default
  if (hasName && !hasAge) {
    // Ask gender along with age
  }
  collected.push(`Gender: ${profile.gender}`);

  if (hasAge) collected.push(`Age: ${profile.age}`);
  else if (hasName) missing.push('age');

  if (hasHeight) collected.push(`Height: ${profile.height} cm`);
  else if (hasAge) missing.push('height (cm)');

  if (hasWeight) collected.push(`Current weight: ${profile.currentWeight} kg`);
  else if (hasHeight) missing.push('current weight (kg)');

  if (hasNeck) collected.push(`Neck: ${profile.neckCircumference} cm`);
  else if (hasWeight) missing.push('neck circumference (cm)');

  if (hasWaist) collected.push(`Waist: ${profile.waistCircumference} cm`);
  else if (hasNeck) missing.push('waist circumference at navel (cm)');

  if (profile.gender === 'female') {
    if (profile.hipCircumference) collected.push(`Hips: ${profile.hipCircumference} cm`);
    else if (hasWaist) missing.push('hip circumference (cm)');
  }

  if (hasTarget) collected.push(`Target: ${profile.targetWeight} kg by ${profile.targetDate}`);
  else if (hasWaist && (profile.gender === 'male' || profile.hipCircumference)) missing.push('target weight and target date');

  if (profile.physicalNotes) collected.push(`Physical notes: ${profile.physicalNotes}`);
  else if (hasTarget) missing.push('any injuries or physical limitations (or "none")');

  if (hasSchedule) collected.push(`Schedule: ${profile.schedulePattern?.type || 'alternating'} (${profile.schedulePattern?.labels?.join('/') || 'A/B'})`);
  else if (hasTarget && (profile.physicalNotes !== '' || profile.physicalNotes === '')) {
    if (profile.physicalNotes !== undefined) missing.push('schedule type and start date');
  }

  const collectedStr = collected.length > 0 ? collected.join('\n- ') : 'Nothing yet';
  const nextItem = missing.length > 0 ? missing[0] : null;

  return `You are Coach, setting up a new user's Pump fitness profile.

## COLLECTED SO FAR
- ${collectedStr}

## NEXT TO COLLECT
${nextItem ? `**${nextItem}**` : 'ALL DONE - ready to complete onboarding!'}

## INSTRUCTIONS
${!nextItem ? `
Summarize their complete profile, tell them their calculated stats (body fat, TDEE, calorie/protein targets will be auto-calculated), and complete onboarding:
[UPDATE_PROFILE: {"onboardingComplete": true}]
` : `
Ask for: **${nextItem}**

When they answer, IMMEDIATELY save with [UPDATE_PROFILE: {...}]

Field mapping:
- name → "name" (string)
- age → "age" (number)
- gender → "gender" ("male" or "female")
- height → "height" (number in cm)
- weight → "currentWeight" AND "startingWeight" (both same number in kg)
- neck → "neckCircumference" (number in cm)
- waist → "waistCircumference" (number in cm)
- hips → "hipCircumference" (number in cm, females only)
- target weight → "targetWeight" (number in kg)
- target date → "targetDate" (string "YYYY-MM-DD")
- injuries/limitations → "physicalNotes" (string, can be "None")
- schedule → "schedulePattern" ({"type": "alternating", "cycleLength": 14, "cycleStart": "YYYY-MM-DD", "labels": ["A","B"], "description": ""})
`}

## MEASUREMENT TIPS (use when relevant)
- Neck: Narrowest point below Adam's apple
- Waist: At navel, relaxed (don't suck in)
- Hips: Widest point (females only)

## EXAMPLE
User: "I'm Sarah, 32"
Response: "Nice to meet you Sarah! I've got your name and age.
[UPDATE_PROFILE: {"name": "Sarah", "age": 32}]
Are you male or female? (I need this for accurate body fat calculations)"

## RULES
1. Ask ONE thing at a time
2. ALWAYS include [UPDATE_PROFILE: {...}] when user gives data
3. Be brief - no long explanations
4. Today's date is ${format(new Date(), 'yyyy-MM-dd')} for reference`;
}

export function buildCoachSystemPrompt(profile, context, performance = null, memories = []) {
  if (!profile.onboardingComplete) {
    return buildOnboardingPrompt(profile);
  }

  // currentWeight/measurementHistory come from buildContextFromState, which
  // resolves them from weightHistory/measurementHistory (falling back to the
  // profile's own fields) — the actual source of truth, not the profile
  // snapshot alone, which only reliably reflects onboarding + Settings edits.
  const currentWeight = context.currentWeight ?? profile.currentWeight;
  const daysToGoal = profile.targetDate ? differenceInDays(parseISO(profile.targetDate), new Date()) : null;
  const weightToLose = currentWeight && profile.targetWeight ? currentWeight - profile.targetWeight : null;
  const weekType = context.weekType || 'A';

  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: {} };
  const intentRules = {
    cut: 'GOAL = CUT. Prioritise a calorie deficit and steady weight loss. Keep protein high to preserve muscle. Frame advice around the deficit.',
    recomp: 'GOAL = RECOMP. Prioritise hitting the protein target with a moderate (small) deficit. Deprioritise the scale — focus on body composition (body fat %, waist) and strength retention.',
    bulk: 'GOAL = BULK. Prioritise a calorie surplus with high protein to maximise muscle gain. Expect the scale to rise; that is intended.',
    maintain: 'GOAL = MAINTAIN. Focus on hitting calorie and protein targets consistently with no deficit or surplus. Keep weight and composition stable.',
  };
  const primaryTarget = goal.targets?.[goal.primaryMetric];

  // Format memories section
  const memoriesSection = formatMemories(memories);

  const scheduleDescription = profile.schedulePattern?.description
    ? `\nSchedule pattern: ${profile.schedulePattern.description}`
    : '';

  const cycleLength = profile.schedulePattern?.cycleLength || 14;

  return `You are Coach, an expert fitness coach and nutritionist for the Pump app. You are knowledgeable, encouraging, and concise.

## USER PROFILE
- Name: ${profile.name || 'User'}
- Gender: ${profile.gender || 'Not specified'}
- Age: ${profile.age || 'Not specified'}
- Height: ${profile.height ? profile.height + ' cm' : 'Not specified'}
- Current Weight: ${currentWeight ? currentWeight + ' kg' : 'Not specified'}
- Target Weight: ${profile.targetWeight ? profile.targetWeight + ' kg' : 'Not specified'}
- Target Date: ${profile.targetDate ? `${profile.targetDate} (${daysToGoal} days remaining)` : 'Not set'}
${weightToLose ? `- Weight to Lose: ${weightToLose.toFixed(1)} kg` : ''}
${weightToLose && daysToGoal ? `- Required Rate: ~${((weightToLose / daysToGoal) * 7).toFixed(1)} kg/week` : ''}
${(() => {
  // Navy is the trend baseline (see calculations.js) — matches what the
  // dashboard/Progress tab display as the main number. Manual/DEXA is shown
  // alongside as a reference so Coach can comment on the gap, same as the
  // dashboard's secondary annotation, without either number silently
  // overriding the other.
  const measurementHistory = context.measurementHistory || [];
  const navy = getNavyBodyFat(profile, measurementHistory);
  const manual = [...measurementHistory]
    .filter((e) => e.bodyFatManual != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.bodyFatManual
    ?? profile.bodyFatManual ?? profile.bodyFatPercentage;
  const parts = [];
  if (navy != null) parts.push(`Navy: ${navy}%`);
  if (manual) parts.push(`Manual: ${manual}%`);
  return `- Body Fat: ${parts.length ? parts.join(' | ') : 'Not measured'}`;
})()}
- TDEE: ${profile.tdee ? profile.tdee + ' kcal/day' : 'Not calculated'}
- Target Calories: ${profile.calorieTarget?.min && profile.calorieTarget?.max ? `${profile.calorieTarget.min}-${profile.calorieTarget.max} kcal/day` : 'Not set'}
- Protein Target: ${profile.proteinTarget?.min && profile.proteinTarget?.max ? `${profile.proteinTarget.min}-${profile.proteinTarget.max}g/day` : 'Not set'}
- Physical Limitations: ${profile.physicalNotes || 'None noted'}

## GOAL
- Training intent: ${goal.intent}
- Primary metric: ${goal.primaryMetric}${primaryTarget?.value != null ? ` (target ${primaryTarget.value}${primaryTarget.date ? ` by ${primaryTarget.date}` : ''})` : ''}
- ${intentRules[goal.intent] || intentRules.maintain}

## TODAY'S CONTEXT
- Date: ${format(new Date(), 'EEEE, MMMM d, yyyy')}
${context.cycleText ? `- Current phase: ${weekType}${context.cyclePosition ? ` (day ${context.cyclePosition} of ${cycleLength}-day cycle)` : ''}${scheduleDescription}` : ''}
${context.todayWorkout ? `- Today's Workout: ${context.todayWorkout}` : '- No workout scheduled today'}
${context.todayNutrition ? `- Today's Nutrition: ${context.todayNutrition.calories} kcal, ${context.todayNutrition.protein}g protein` : '- No meals logged today'}

## RECENT HISTORY
${context.recentWorkouts || 'No recent workouts logged.'}
${context.performanceSnapshot ? `\nSnapshot: ${context.performanceSnapshot}` : ''}

## TRAINING CYCLE
The user's repeating pattern. The app auto-fills the calendar from this, so you normally only change the cycle itself — not individual dates.
${context.cycleText || 'No cycle set up yet. If the user describes a recurring routine (e.g. an 8-day shift rotor, or an A/B fortnight), capture it with SET_CYCLE_TEMPLATE.'}

## DATA TOOLS
Call these to look up real data — never guess or make up numbers:
- get_nutrition_history(days): daily calorie/protein totals for the last N days (no food items)
- get_meal_items(date): individual foods logged on a specific date — use for re-logging or "what did I eat on X?"
- get_workout_history(days, exercise?): completed sessions; filter by exercise name if needed
- get_pr_records(exercise?): personal bests for all or one exercise
- get_weight_history(days): body weight entries over time
- get_workout_templates(): full exercise lists for all templates (push, pull, legs, push_b, etc.)
- get_performance_summary(): 2-week completion rate, streak, weight change, nutrition averages

## PLANNING APPROACH
${context.cycleText
  ? 'Use the cycle and the data tools to give specific advice. If the user is progressing well, leave things alone. If they\'re bored, plateauing, or hitting PRs, call get_workout_templates() to see their current exercises, suggest concrete swaps, and write a [SET_TEMPLATE: ...] command in your reply to apply them (see YOUR CAPABILITIES below — this is a text command, not a tool call). Call get_performance_summary() before any progress review. Be honest; don\'t pad.'
  : 'This user is just getting started. Help them set up their training cycle and workout templates by writing [SET_CYCLE_TEMPLATE: ...] and [SET_TEMPLATE: ...] commands in your reply (see YOUR CAPABILITIES below — these are text commands, not tool calls). Ask what their typical weekly routine looks like before suggesting anything. Keep it simple and practical.'
}

## YOUR CAPABILITIES
When the user wants to log or update data, include these commands in your response:

- Log food: [LOG_MEAL: {"items": [{"name": "Chicken breast", "calories": 280, "protein": 52}, {"name": "Rice", "calories": 200, "protein": 4}], "totals": {"calories": 480, "protein": 56}}]
  Items array holds only food rows (no "Total" row — totals go in the separate object). Log ONLY items in the current message; don't re-log existing meal items. For a past date (max 2 days), add "date": "YYYY-MM-DD". Today is ${format(new Date(), 'yyyy-MM-dd')}; defaults to today.
- Log weight: [LOG_WEIGHT: {"weight": 82.0}]
- Log measurements: [LOG_MEASUREMENT: {"waist": 88, "neck": 40, "hip": 100, "bodyFatManual": 18}] (all fields optional; body fat auto-computed from waist/neck/hip if omitted)
- Log workout performance: [LOG_WORKOUT: {"date": "2026-06-01", "exercises": [{"name": "Bench Press", "sets": 4, "reps": [8, 8, 8, 7], "weight": [80, 80, 80, 80]}, {"name": "Overhead Press", "sets": 3, "reps": [10, 10, 9], "weight": [50, 50, 50]}], "notes": "Felt strong today"}]
  - date: The date of the workout (YYYY-MM-DD format)
  - exercises: Array of exercises performed
  - Each exercise has: name, sets (number), reps (array per set), weight (array per set in kg)
  - notes: Optional notes about the session
  - This also marks the workout as complete for that day
- Update profile: [UPDATE_PROFILE: {"fieldName": "value"}]
  - **EXACT field names — anything else is silently dropped**:
    - name, age, gender ("male" | "female"), height (cm), currentWeight (kg), targetWeight (kg), targetDate ("YYYY-MM-DD")
    - **neckCircumference** (cm) — NOT "neck"
    - **waistCircumference** (cm) — NOT "waist"
    - **hipCircumference** (cm, females only) — NOT "hips"
    - bodyFatManual (%) — user-entered DEXA/scan/calipers reading (separate from Navy)
    - tdee (kcal/day), calorieTarget {min, max}, proteinTarget {min, max}
    - physicalNotes (string), activityLevel ("sedentary"|"light"|"moderate"|"active"|"veryActive")
  - When user reports measurements, ALWAYS save them with the full field name above. Body fat (Navy) is auto-recomputed from these measurements — never set bodyFatPercentage directly from a Navy calc, set the measurements and let the system recompute.
  - bodyFatManual is for user-reported DEXA/scan/scale readings only, not for storing your own Navy calculation.
- **Modify workout templates**: [UPDATE_TEMPLATE: {"template": "push", "action": "add", "exercise": {"name": "Exercise Name", "sets": 3, "reps": 10, "weight": 20}}]
  - action: "add" | "remove" | "update"
  - template: any template key — built-in (push, pull, legs, bike, core) or custom (push_b, pull_a, etc.)
  - For remove: {"template": "push", "action": "remove", "exerciseName": "Exercise Name"}
  - For update: {"template": "push", "action": "update", "exerciseName": "Exercise Name", "updates": {"weight": 25}}
- **Replace full template**: [SET_TEMPLATE: {"template": "push_b", "exercises": [{"name": "Bench Press", "sets": 4, "reps": 8, "weight": 80}, ...]}]
  Replaces all exercises for the named template. Use any key — built-in (push/pull/legs/core/bike) or a new custom one (push_b, pull_a, etc.). NOT for scheduling days. To add an A/B variant: create a new template key (push_b), then update the cycle position to use that type.

### Scheduling
The schedule is driven by the user's TRAINING CYCLE (above). The app auto-fills every calendar date from it, so you almost never set individual dates.

- **Shift the cycle anchor** when the user wants A/B to restart from a different date: [SET_CYCLE_START: {"date": "YYYY-MM-DD"}]. This moves the reference point WITHOUT touching the cycle template. Use this — never SET_CYCLE_TEMPLATE — when the user says "start Week A from [date]", "reset the cycle to Monday", or asks to realign the schedule.

- **Set/replace the whole cycle** with [SET_CYCLE_TEMPLATE: {...}] — keyed by cycle POSITION ("1".."${cycleLength}"). CRITICAL: check the TRAINING CYCLE table above first — each position has a weekday label (Mon/Tue/etc.) so you know exactly which real day you're assigning. Build the positions from what the user tells you; do not assume a split.
  Each position: {"lunch": {"type": "...", "notes": "short note"}, "evening": {"type": "..."}, "calories": 2200, "protein": 185}
  evening is optional. notes must be under 10 words. Only use activity types the user actually has.

- **One-off override** for a specific date (travel, illness) with [SET_SCHEDULE: {"2026-05-08": {"lunch": {"type": "rest"}, "notes": "Travelling"}}] — same day-object shape, keyed by date. Only for exceptions; don't rebuild the whole calendar this way.

Built-in types: push, pull, legs, power, strength, bike, bikesprints, hiit, skate, ride, rest, active, yoga, core, family. You can also use custom types (push_b, pull_a, legs_b, etc.) — create them with SET_TEMPLATE first, then reference them in the cycle.

## FORMATTING RULES
- Be concise and direct. No fluff.
- For food summaries, use this table format:
| Item | Calories | Protein |
|------|----------|---------|
| Food name | 123 | 12g |
| **Total** | **123** | **12g** |

${profile.physicalNotes ? `- Consider user's physical limitations: ${profile.physicalNotes}. Always offer modifications.` : ''}
- Encourage progress without being overly positive. Be honest about whether they're on track.

## IMPORTANT: USER-PROVIDED VALUES AND TARGETS
- When the user gives you a specific value (TDEE from Garmin, body fat from a scan, calorie target, etc.), use their value EXACTLY - do not recalculate or suggest a different number.
- When updating weight goals (targetWeight, targetDate), ALSO recalculate and update calorieTarget based on their TDEE and the new timeline.
- Example: If user changes target to lose 15kg in 12 weeks, calculate the required deficit and set appropriate calorie targets.
- To update calorie targets: [UPDATE_PROFILE: {"calorieTarget": {"min": 2000, "max": 2200}}]
- To update protein targets: [UPDATE_PROFILE: {"proteinTarget": {"min": 160, "max": 180}}]
- Trust external data sources (Garmin, scales, DEXA scans) over formulas.

### Memory Commands
Save important things you learn about the user that aren't captured elsewhere:
- [SAVE_MEMORY: {"type": "preference", "content": "Hates burpees - avoid in programming"}]
- [SAVE_MEMORY: {"type": "injury", "content": "Tweaked left shoulder doing overhead press", "date": "2026-05-08"}]
- [SAVE_MEMORY: {"type": "insight", "content": "Tends to skip Thursday evening workouts - suggest morning alternatives"}]
- [SAVE_MEMORY: {"type": "milestone", "content": "Hit first bodyweight pull-up!", "date": "2026-06-01"}]

Types: preference, injury, insight, milestone, other

To remove outdated memories:
- [FORGET_MEMORY: {"content": "Tweaked left shoulder"}] (partial match is fine)

Use SAVE_MEMORY when the user shares something important that:
- Isn't already in their profile
- Would be useful to remember in future sessions
- Relates to preferences, temporary injuries, patterns you notice, or significant events
${memoriesSection}

Remember: You can help log meals, suggest workouts, modify exercises for injuries, track progress, and provide nutrition advice. Be the coach that keeps them accountable.`;
}

export function buildContextFromState(profile, nutritionLogs, workoutLogs, workoutSchedule, weightHistory, completedDays = {}, templates = null, measurementHistory = []) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Resolve "current" weight from the actual history log (falling back to
  // the profile's own field for brand-new profiles with no history yet), so
  // Coach's view matches what WeightModal/MeasurementModal/Settings actually
  // recorded — not a separately-maintained profile snapshot that can
  // silently drift from it. measurementHistory itself is passed through
  // below so getNavyBodyFat can search the full history (a manual-only
  // latest entry shouldn't hide an older, still-valid waist/neck snapshot).
  const latestWeightEntry = weightHistory.length
    ? [...weightHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null;
  const currentWeight = latestWeightEntry?.weight ?? profile.currentWeight ?? null;

  const todayMeals = nutritionLogs.filter((m) =>
    format(parseISO(m.timestamp), 'yyyy-MM-dd') === todayStr
  );
  const todayNutrition = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.totals?.calories || 0),
      protein: acc.protein + (m.totals?.protein || 0),
    }),
    { calories: 0, protein: 0 }
  );

  // Resolve today from explicit schedule first, then the cycle template.
  const todaySchedule = resolveDaySchedule(profile, workoutSchedule, todayStr);
  let todayWorkout = null;
  if (todaySchedule) {
    if (typeof todaySchedule === 'string') {
      todayWorkout = `${todaySchedule.charAt(0).toUpperCase() + todaySchedule.slice(1)} Day`;
    } else if (todaySchedule.lunch?.type) {
      todayWorkout = `${todaySchedule.lunch.type.charAt(0).toUpperCase() + todaySchedule.lunch.type.slice(1)}`;
      if (todaySchedule.lunch.notes) todayWorkout += ` (${todaySchedule.lunch.notes})`;
      if (todaySchedule.evening?.type) {
        todayWorkout += ` + Evening: ${todaySchedule.evening.type}`;
      }
    }
  }

  const recentWorkouts = workoutLogs
    .filter((w) => w.completedAt)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 2)
    .map((w) => `- ${w.date}: ${w.exercises?.length || 0} exercises`)
    .join('\n');

  // Current schedule phase — splits the cycle evenly across labels (rotor-safe).
  let weekType = 'A';
  const sp = profile.schedulePattern;
  if (sp?.type && sp?.cycleStart && sp?.labels?.length > 0) {
    weekType = getPhaseLabel(sp, today);
  } else if (sp?.weekAStart) {
    // Legacy format
    const startDate = parseISO(sp.weekAStart);
    const daysDiff = differenceInDays(today, startDate);
    const weekNumber = Math.floor(daysDiff / 7);
    weekType = weekNumber % 2 === 0 ? 'A' : 'B';
  }

  const cyclePosition = getCyclePosition(sp, today);

  // Performance snapshot — one-liner for the static prompt.
  // Full detail available via get_performance_summary() tool.
  const performance = buildPerformanceContext(completedDays, weightHistory, nutritionLogs, workoutSchedule, profile, currentWeight);
  // Suppress snapshot for brand-new users — 0 scheduled sessions gives 100% completion
  // which is misleading noise, not useful signal.
  const performanceSnapshot = performance && performance.recentCompletion.scheduled > 0
    ? `${performance.recentCompletion.percentage}% completion (14d) | Streak: ${performance.currentStreak}d | Weight: ${performance.weightChange2Weeks >= 0 ? '+' : ''}${performance.weightChange2Weeks}kg (2wk) | Avg ${performance.avgCalories || '?'} kcal/day`
    : '';

  return {
    todayNutrition: todayNutrition.calories > 0 ? todayNutrition : null,
    todayWorkout,
    recentWorkouts: recentWorkouts || 'No recent workouts.',
    weekType,
    cyclePosition,
    cycleText: formatCycle(profile),
    performanceSnapshot,
    performance,
    currentWeight,
    measurementHistory,
  };
}

export function parseAICommands(content) {
  const commands = [];

  // Extract first JSON object after a marker
  const extractJSON = (str, startMarker) => {
    const startIdx = str.indexOf(startMarker);
    if (startIdx === -1) return null;

    const jsonStart = str.indexOf('{', startIdx);
    if (jsonStart === -1) return null;

    let depth = 0;
    let jsonEnd = -1;

    for (let i = jsonStart; i < str.length; i++) {
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    if (jsonEnd === -1) return null;

    const jsonStr = str.slice(jsonStart, jsonEnd);
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error(`Failed to parse JSON for ${startMarker}:`, e.message);
      console.error('JSON string was:', jsonStr.substring(0, 500));
      return null;
    }
  };

  // Extract ALL JSON objects for a repeated marker (e.g. multiple UPDATE_TEMPLATE blocks)
  const extractAllJSON = (str, startMarker) => {
    const results = [];
    let searchFrom = 0;
    while (true) {
      const startIdx = str.indexOf(startMarker, searchFrom);
      if (startIdx === -1) break;

      const jsonStart = str.indexOf('{', startIdx);
      if (jsonStart === -1) break;

      let depth = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < str.length; i++) {
        if (str[i] === '{') depth++;
        else if (str[i] === '}') {
          depth--;
          if (depth === 0) { jsonEnd = i + 1; break; }
        }
      }
      if (jsonEnd === -1) break;

      const jsonStr = str.slice(jsonStart, jsonEnd);
      try {
        results.push(JSON.parse(jsonStr));
      } catch (e) {
        console.error(`Failed to parse JSON for ${startMarker}:`, e.message);
      }
      searchFrom = jsonEnd;
    }
    return results;
  };

  // Parse each command type
  const mealDataList = extractAllJSON(content, '[LOG_MEAL:');
  mealDataList.forEach(data => commands.push({ type: 'LOG_MEAL', data }));

  const weightData = extractJSON(content, '[LOG_WEIGHT:');
  if (weightData) {
    commands.push({ type: 'LOG_WEIGHT', data: weightData });
  }

  const workoutData = extractJSON(content, '[LOG_WORKOUT:');
  if (workoutData) {
    commands.push({ type: 'LOG_WORKOUT', data: workoutData });
  }

  const scheduleData = extractJSON(content, '[UPDATE_SCHEDULE:');
  if (scheduleData) {
    commands.push({ type: 'UPDATE_SCHEDULE', data: scheduleData });
  }

  const bulkScheduleData = extractJSON(content, '[SET_SCHEDULE:');
  if (bulkScheduleData) {
    commands.push({ type: 'SET_SCHEDULE', data: bulkScheduleData });
  }

  const cycleStartData = extractJSON(content, '[SET_CYCLE_START:');
  if (cycleStartData) {
    commands.push({ type: 'SET_CYCLE_START', data: cycleStartData });
  }

  const cycleTemplateData = extractJSON(content, '[SET_CYCLE_TEMPLATE:');
  if (cycleTemplateData) {
    commands.push({ type: 'SET_CYCLE_TEMPLATE', data: cycleTemplateData });
  }

  const profileData = extractJSON(content, '[UPDATE_PROFILE:');
  if (profileData) {
    commands.push({ type: 'UPDATE_PROFILE', data: profileData });
  }

  const saveMemoryDataList = extractAllJSON(content, '[SAVE_MEMORY:');
  saveMemoryDataList.forEach(data => commands.push({ type: 'SAVE_MEMORY', data }));

  const forgetMemoryData = extractJSON(content, '[FORGET_MEMORY:');
  if (forgetMemoryData) {
    commands.push({ type: 'FORGET_MEMORY', data: forgetMemoryData });
  }

  const templateDataList = extractAllJSON(content, '[UPDATE_TEMPLATE:');
  templateDataList.forEach(data => commands.push({ type: 'UPDATE_TEMPLATE', data }));

  const setTemplateDataList = extractAllJSON(content, '[SET_TEMPLATE:');
  setTemplateDataList.forEach(data => commands.push({ type: 'SET_TEMPLATE', data }));

  const measurementDataList = extractAllJSON(content, '[LOG_MEASUREMENT:');
  measurementDataList.forEach(data => commands.push({ type: 'LOG_MEASUREMENT', data }));

  // Clean content - remove all command blocks
  let cleanContent = content;
  const commandPatterns = ['LOG_MEAL', 'LOG_WEIGHT', 'LOG_WORKOUT', 'UPDATE_SCHEDULE', 'SET_SCHEDULE', 'SET_CYCLE_START', 'SET_CYCLE_TEMPLATE', 'UPDATE_PROFILE', 'SAVE_MEMORY', 'FORGET_MEMORY', 'UPDATE_TEMPLATE', 'SET_TEMPLATE', 'LOG_MEASUREMENT'];

  for (const cmd of commandPatterns) {
    const marker = `[${cmd}:`;
    let idx = cleanContent.indexOf(marker);
    while (idx !== -1) {
      const jsonStart = cleanContent.indexOf('{', idx);
      if (jsonStart === -1) break;

      let depth = 0;
      let jsonEnd = -1;

      for (let i = jsonStart; i < cleanContent.length; i++) {
        if (cleanContent[i] === '{') depth++;
        else if (cleanContent[i] === '}') {
          depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }

      if (jsonEnd === -1) break;

      // Find the closing bracket
      const closeBracket = cleanContent.indexOf(']', jsonEnd);
      const endIdx = closeBracket !== -1 ? closeBracket + 1 : jsonEnd;

      cleanContent = cleanContent.slice(0, idx) + cleanContent.slice(endIdx);
      idx = cleanContent.indexOf(marker);
    }
  }

  return { commands, cleanContent: cleanContent.trim() };
}

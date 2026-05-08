import { format, parseISO, differenceInDays, subDays, addDays } from 'date-fns';

// Helper to format week template for Coach prompt
function formatWeekTemplate(template) {
  if (!template) return 'Not configured';

  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return days.map((day, i) => {
    const d = template[day];
    if (!d) return `${dayNames[i]}: Rest`;

    const lunch = d.lunch ? `${d.lunch.type}${d.lunch.notes ? ` (${d.lunch.notes})` : ''}` : 'Rest';
    const evening = d.evening ? ` + Evening: ${d.evening.type}` : '';
    const cals = d.calories ? ` | ${d.calories} kcal` : '';
    const notes = d.notes ? ` | ${d.notes}` : '';

    return `${dayNames[i]}: ${lunch}${evening}${cals}${notes}`;
  }).join('\n');
}

// Build performance metrics from historical data
export function buildPerformanceContext(completedDays, weightHistory, nutritionLogs, schedule, profile) {
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

  const weightChangeTotal = profile.startingWeight && profile.currentWeight
    ? profile.startingWeight - profile.currentWeight
    : 0;

  // Calculate required vs current rate
  const daysToGoal = profile.targetDate ? differenceInDays(parseISO(profile.targetDate), today) : null;
  const weightToLose = profile.currentWeight && profile.targetWeight
    ? profile.currentWeight - profile.targetWeight
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
  const hasGender = !!profile.gender; // Will always have a value due to default
  const hasAge = profile.age !== null && profile.age > 0;
  const hasHeight = profile.height !== null && profile.height > 0;
  const hasWeight = profile.currentWeight !== null && profile.currentWeight > 0;
  const hasNeck = profile.neckCircumference !== null && profile.neckCircumference > 0;
  const hasWaist = profile.waistCircumference !== null && profile.waistCircumference > 0;
  const hasHips = profile.hipCircumference !== null || profile.gender === 'male';
  const hasTarget = profile.targetWeight !== null && profile.targetDate !== null;
  const hasSchedule = profile.schedulePattern?.weekAStart !== null;

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

  if (hasSchedule) collected.push(`Week A starts: ${profile.schedulePattern.weekAStart}`);
  else if (hasTarget && (profile.physicalNotes !== '' || profile.physicalNotes === '')) {
    // Only ask for schedule after physical notes
    if (profile.physicalNotes !== undefined) missing.push('Week A start date (Monday of a week when you have the kids)');
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
- week A start → "schedulePattern" ({"weekAStart": "YYYY-MM-DD"})
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

export function buildCoachSystemPrompt(profile, context, performance = null) {
  if (!profile.onboardingComplete) {
    return buildOnboardingPrompt(profile);
  }

  const daysToGoal = profile.targetDate ? differenceInDays(parseISO(profile.targetDate), new Date()) : null;
  const weightToLose = profile.currentWeight && profile.targetWeight ? profile.currentWeight - profile.targetWeight : null;
  const weekType = context.weekType || 'A';
  const nextWeekType = weekType === 'A' ? 'B' : 'A';

  // Format performance section
  let performanceSection = '';
  if (performance) {
    const missedList = performance.missedSessions.length > 0
      ? performance.missedSessions.map(s => `${s.date} (${s.type})`).join(', ')
      : 'None';

    performanceSection = `
## PERFORMANCE METRICS

### Recent (Last 2 Weeks)
- Workout completion: ${performance.recentCompletion.percentage}% (${performance.recentCompletion.completed}/${performance.recentCompletion.scheduled} sessions)
- Missed sessions: ${missedList}
- Weight change: ${performance.weightChange2Weeks > 0 ? '+' : ''}${performance.weightChange2Weeks}kg
- Avg calories: ${performance.avgCalories || 'No data'} kcal/day
- Avg protein: ${performance.avgProtein || 'No data'}g/day
- Calories vs target: ${performance.caloriesVsTarget}

### All-Time
- Total workouts completed: ${performance.totalWorkoutsCompleted}
- Current streak: ${performance.currentStreak} days

### Goal Progress
- Current loss rate: ${performance.currentRate}kg/week
- Required rate: ${performance.requiredRate}kg/week
- Status: ${performance.onTrack ? 'ON TRACK - maintain current program' : 'BEHIND - consider small adjustments'}
`;
  }

  // Format week templates
  const weekATemplate = formatWeekTemplate(profile.weekTemplates?.A);
  const weekBTemplate = formatWeekTemplate(profile.weekTemplates?.B);

  return `You are Coach, an expert fitness coach and nutritionist for the Pump app. You are knowledgeable, encouraging, and concise.

## USER PROFILE
- Name: ${profile.name || 'User'}
- Gender: ${profile.gender || 'Not specified'}
- Age: ${profile.age || 'Not specified'}
- Height: ${profile.height ? profile.height + ' cm' : 'Not specified'}
- Current Weight: ${profile.currentWeight ? profile.currentWeight + ' kg' : 'Not specified'}
- Target Weight: ${profile.targetWeight ? profile.targetWeight + ' kg' : 'Not specified'}
- Target Date: ${profile.targetDate ? `${profile.targetDate} (${daysToGoal} days remaining)` : 'Not set'}
${weightToLose ? `- Weight to Lose: ${weightToLose.toFixed(1)} kg` : ''}
${weightToLose && daysToGoal ? `- Required Rate: ~${((weightToLose / daysToGoal) * 7).toFixed(1)} kg/week` : ''}
- Body Fat: ${profile.bodyFatPercentage ? profile.bodyFatPercentage + '%' : 'Not measured'}
- TDEE: ${profile.tdee ? profile.tdee + ' kcal/day' : 'Not calculated'}
- Target Calories: ${profile.calorieTarget?.min && profile.calorieTarget?.max ? `${profile.calorieTarget.min}-${profile.calorieTarget.max} kcal/day` : 'Not set'}
- Protein Target: ${profile.proteinTarget?.min && profile.proteinTarget?.max ? `${profile.proteinTarget.min}-${profile.proteinTarget.max}g/day` : 'Not set'}
- Physical Limitations: ${profile.physicalNotes || 'None noted'}

## TODAY'S CONTEXT
- Date: ${format(new Date(), 'EEEE, MMMM d, yyyy')}
- Week Type: ${weekType} (next week is ${nextWeekType})
${context.todayWorkout ? `- Today's Workout: ${context.todayWorkout}` : '- No workout scheduled today'}
${context.todayNutrition ? `- Today's Nutrition: ${context.todayNutrition.calories} kcal, ${context.todayNutrition.protein}g protein` : '- No meals logged today'}

## RECENT HISTORY
${context.recentWorkouts || 'No recent workouts logged.'}
${context.weightTrend || ''}
${performanceSection}

## WEEK TEMPLATES (User's preferred patterns)

### Week A (more solo time):
${weekATemplate}

### Week B (more Nyxie time - different Fri/Sat/Sun):
${weekBTemplate}

## SCHEDULE PLANNING RULES

When creating upcoming schedules:
1. **Use the Week A or B template as the BASE** - don't reinvent the wheel
2. **If user is ON TRACK** (within 0.2kg/week of required rate):
   - "If it ain't broke, don't fix it"
   - Keep the template exactly unless user requests changes
   - Just acknowledge progress and apply the template
3. **If user is BEHIND on weight loss:**
   - Suggest ONE small adjustment (extra cardio OR slightly lower calories, not both)
   - Explain the reasoning briefly
   - Ask if they want the change before applying
4. **If user MISSED sessions:**
   - Note which ones and ask if there was a reason (don't assume)
   - Fatigue, schedule conflicts, and injury need different responses
   - Be understanding, not judgmental
5. **If completion rate < 70%:**
   - Suggest simplifying (fewer sessions, not harder ones)
   - Consider if the schedule is too ambitious
6. **Always include** the template's notes (bed times, kitchen rules, Nyxie/Solo indicators)

## YOUR CAPABILITIES
When the user wants to log or update data, include these commands in your response:

- Log food: [LOG_MEAL: {"items": [{"name": "Chicken breast", "calories": 280, "protein": 52}, {"name": "Rice", "calories": 200, "protein": 4}], "totals": {"calories": 480, "protein": 56}}]
  IMPORTANT: Only include actual food items in "items" array - do NOT include a "Total" row. The totals go in the separate "totals" object.
- Log weight: [LOG_WEIGHT: {"weight": 104.2}]
- Log workout performance: [LOG_WORKOUT: {"date": "2026-05-08", "exercises": [{"name": "Landmine Press", "sets": 4, "reps": [8, 8, 8, 8], "weight": [30, 30, 30, 30]}, {"name": "DB Incline Press", "sets": 3, "reps": [10, 10, 8], "weight": [20, 20, 20]}], "notes": "Felt strong today"}]
  - date: The date of the workout (YYYY-MM-DD format)
  - exercises: Array of exercises performed
  - Each exercise has: name, sets (number), reps (array per set), weight (array per set in kg)
  - notes: Optional notes about the session
  - This also marks the workout as complete for that day
- Update profile: [UPDATE_PROFILE: {"fieldName": "value"}]

### Schedule Commands
Set full day schedule with lunch/evening sessions, calories, and notes:
[SET_SCHEDULE: {
  "2026-05-08": {
    "lunch": {"type": "push", "notes": "Gym: Push + SB Strength"},
    "evening": {"type": "rest", "notes": "50g Protein Dinner"},
    "calories": 2300,
    "notes": "Bed by 11:30pm"
  },
  "2026-05-09": {
    "lunch": {"type": "bike", "notes": "20m HIIT Intervals"},
    "evening": {"type": "skate", "notes": "Garage session"},
    "calories": 2400,
    "notes": "Kitchen closed 9pm"
  }
}]

Activity types:
- Gym: push, pull, legs, power, strength
- Cardio: bike, bikesprints, hiit, skate, ride (big ride 3-4hrs)
- Recovery: rest, active, yoga, core
- Other: family

When creating schedules, include:
- lunch.type and lunch.notes for the main daytime session
- evening.type and evening.notes for evening activity
- calories target for the day (from template)
- notes for daily standards (sleep time, kitchen rules, Nyxie/Solo, etc.)

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

Remember: You can help log meals, suggest workouts, modify exercises for injuries, track progress, and provide nutrition advice. Be the coach that keeps them accountable.`;
}

export function buildContextFromState(profile, nutritionLogs, workoutLogs, workoutSchedule, weightHistory, completedDays = {}) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

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

  // Handle both string and object schedule formats
  const todaySchedule = workoutSchedule[todayStr];
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
    .slice(0, 3)
    .map((w) => `- ${w.date}: ${w.exercises?.length || 0} exercises`)
    .join('\n');

  const recentWeights = weightHistory
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  let weightTrend = '';
  if (recentWeights.length >= 2) {
    const change = recentWeights[0].weight - recentWeights[recentWeights.length - 1].weight;
    weightTrend = `\n## WEIGHT TREND (last ${recentWeights.length} entries)\n${change > 0 ? '+' : ''}${change.toFixed(1)} kg`;
  }

  const startDate = profile.schedulePattern?.weekAStart
    ? parseISO(profile.schedulePattern.weekAStart)
    : new Date();
  const daysDiff = differenceInDays(today, startDate);
  const weekNumber = Math.floor(daysDiff / 7);
  const weekType = weekNumber % 2 === 0 ? 'A' : 'B';

  // Build performance metrics
  const performance = buildPerformanceContext(completedDays, weightHistory, nutritionLogs, workoutSchedule, profile);

  return {
    todayNutrition: todayNutrition.calories > 0 ? todayNutrition : null,
    todayWorkout,
    recentWorkouts: recentWorkouts || 'No recent workouts.',
    weightTrend,
    weekType,
    performance,
  };
}

export function parseAICommands(content) {
  const commands = [];

  // Helper to extract balanced JSON from content
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

    try {
      return JSON.parse(str.slice(jsonStart, jsonEnd));
    } catch (e) {
      return null;
    }
  };

  // Parse each command type
  const mealData = extractJSON(content, '[LOG_MEAL:');
  if (mealData) {
    commands.push({ type: 'LOG_MEAL', data: mealData });
  }

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

  const profileData = extractJSON(content, '[UPDATE_PROFILE:');
  if (profileData) {
    commands.push({ type: 'UPDATE_PROFILE', data: profileData });
  }

  // Clean content - remove all command blocks
  let cleanContent = content;
  const commandPatterns = ['LOG_MEAL', 'LOG_WEIGHT', 'LOG_WORKOUT', 'UPDATE_SCHEDULE', 'SET_SCHEDULE', 'UPDATE_PROFILE'];

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

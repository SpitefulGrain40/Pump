export const DEFAULT_USER_PROFILE = {
  onboardingComplete: false,
  name: '',
  gender: 'male',
  age: null,
  height: null, // cm
  currentWeight: null,
  startingWeight: null,
  targetWeight: null,
  targetDate: null,
  // Body measurements for Navy Method body fat calculation
  neckCircumference: null, // cm
  waistCircumference: null, // cm (at navel)
  hipCircumference: null, // cm (women only, at widest point)
  bodyFatPercentage: null,
  // Nutrition targets
  tdee: null,
  calorieTarget: { min: null, max: null },
  proteinTarget: { min: null, max: null },
  // Physical notes
  physicalNotes: '',
  // Schedule
  schedulePattern: {
    type: 'alternating',     // 'fixed' | 'alternating' | 'rotating' | 'custom'
    cycleLength: 14,         // days in one full cycle (7=weekly, 14=fortnightly, N=shift)
    cycleStart: null,        // ISO date string — day 1 of cycle (Monday)
    labels: ['A', 'B'],     // names for each week/phase
    description: '',         // optional free text shown in Schedule header
  },
  // Week templates for Coach to reference
  weekTemplates: {
    A: {},
    B: {},
  },
};

export const DEFAULT_AI_SETTINGS = {
  provider: 'anthropic',
  openrouterKey: '',
  anthropicKey: '',
  model: 'anthropic/claude-haiku-4-5-20251001',
  anthropicModel: 'claude-sonnet-4-6',
};

export const createWorkoutLog = (date, exercises) => ({
  id: `workout-${date}-${Date.now()}`,
  date,
  exercises,
  completedAt: null,
  notes: '',
});

export const createExerciseLog = (name, planned, actual = null) => ({
  name,
  planned: { sets: planned.sets, reps: planned.reps, weight: planned.weight },
  actual: actual || { sets: [], reps: [], weight: [] },
  isPR: false,
});

export const createMealLog = (items, totals, photoAnalyzed = false) => ({
  id: `meal-${Date.now()}`,
  timestamp: new Date().toISOString(),
  items,
  totals,
  photoAnalyzed,
});

export const createWeightEntry = (weight, date = null) => ({
  date: date || new Date().toISOString().split('T')[0],
  weight,
  timestamp: new Date().toISOString(),
});

export const EXERCISE_LIBRARY = [
  // Push exercises
  { name: 'Landmine Press', category: 'push', muscleGroups: ['shoulders', 'chest'], neckSafe: true },
  { name: 'DB Incline Press', category: 'push', muscleGroups: ['chest', 'shoulders'] },
  { name: 'DB Lateral Raises', category: 'push', muscleGroups: ['shoulders'] },
  { name: 'DB Chest Flyes', category: 'push', muscleGroups: ['chest'] },
  { name: 'Tricep Pushdowns', category: 'push', muscleGroups: ['triceps'] },
  { name: 'Band Pull-Aparts', category: 'push', muscleGroups: ['rear-delts', 'upper-back'], neckSafe: true },
  // Pull exercises
  { name: 'Landmine Row', category: 'pull', muscleGroups: ['back', 'biceps'], neckSafe: true },
  { name: 'TRX Row', category: 'pull', muscleGroups: ['back', 'biceps'], neckSafe: true },
  { name: 'TRX Bicep Curl', category: 'pull', muscleGroups: ['biceps'], neckSafe: true },
  { name: 'Hammer Curl', category: 'pull', muscleGroups: ['biceps'] },
  { name: 'Band Face Pulls', category: 'pull', muscleGroups: ['rear-delts', 'upper-back'], neckSafe: true },
  // Core
  { name: 'Dead Bug', category: 'core', muscleGroups: ['core'], neckSafe: true },
  { name: 'KB Swing', category: 'core', muscleGroups: ['core', 'glutes', 'hamstrings'], neckSafe: true },
  { name: 'Hollow Hold', category: 'core', muscleGroups: ['core'], neckSafe: true },
  { name: 'Plank', category: 'core', muscleGroups: ['core'], neckSafe: true },
  // Cardio
  { name: 'Bike HIIT', category: 'cardio', muscleGroups: ['legs'], neckSafe: true },
  { name: 'Bike Sprints', category: 'cardio', muscleGroups: ['legs'], neckSafe: true },
  // Legacy
  { name: 'Bench Press', category: 'push', muscleGroups: ['chest', 'triceps', 'shoulders'] },
  { name: 'Incline Dumbbell Press', category: 'push', muscleGroups: ['chest', 'shoulders'] },
  { name: 'Overhead Press', category: 'push', muscleGroups: ['shoulders', 'triceps'] },
  { name: 'Tricep Pushdown', category: 'push', muscleGroups: ['triceps'] },
  { name: 'Lateral Raises', category: 'push', muscleGroups: ['shoulders'] },
  { name: 'Deadlift', category: 'pull', muscleGroups: ['back', 'hamstrings', 'glutes'] },
  { name: 'Barbell Row', category: 'pull', muscleGroups: ['back', 'biceps'] },
  { name: 'Lat Pulldown', category: 'pull', muscleGroups: ['back', 'biceps'] },
  { name: 'Face Pulls', category: 'pull', muscleGroups: ['rear-delts', 'upper-back'], neckSafe: true },
  { name: 'Bicep Curls', category: 'pull', muscleGroups: ['biceps'] },
  { name: 'Squat', category: 'legs', muscleGroups: ['quads', 'glutes', 'hamstrings'] },
  { name: 'Leg Press', category: 'legs', muscleGroups: ['quads', 'glutes'] },
  { name: 'Romanian Deadlift', category: 'legs', muscleGroups: ['hamstrings', 'glutes'] },
  { name: 'Leg Curl', category: 'legs', muscleGroups: ['hamstrings'] },
  { name: 'Calf Raises', category: 'legs', muscleGroups: ['calves'] },
  { name: 'Cable Crunch', category: 'core', muscleGroups: ['core'] },
  { name: 'Walking', category: 'cardio', muscleGroups: [], neckSafe: true },
  { name: 'Cycling', category: 'cardio', muscleGroups: [], neckSafe: true },
  { name: 'Rowing Machine', category: 'cardio', muscleGroups: ['back', 'legs'] },
];

export const WORKOUT_TEMPLATES = {
  push: {
    name: 'Push + SB Strength',
    focus: 'Chest, Shoulders, Triceps',
    duration: 60,
    warmup: ['Band pull-aparts 2x15', 'Chest opener stretch', 'Gentle neck rolls'],
    exercises: [
      { name: 'Landmine Press', sets: 3, reps: 10, weight: 20, notes: 'Neutral spine, no shrug (20-25kg)' },
      { name: 'DB Incline Press', sets: 3, reps: 10, weight: 32, notes: '45° incline, each hand' },
      { name: 'DB Lateral Raises', sets: 3, reps: 12, weight: 10, notes: 'Slight forward lean (10-12kg)' },
      { name: 'DB Chest Flyes', sets: 3, reps: 12, weight: 16, notes: 'Flat or incline (16-18kg)' },
      { name: 'Tricep Pushdowns', sets: 3, reps: 12, weight: 0, notes: 'Band/heavy, elbows tucked' },
    ],
    finisher: 'SB Strength App — 15-20 min',
    cooldown: ['Band pull-aparts', 'Chest stretch'],
  },
  pull: {
    name: 'Pull + Neck Mobility',
    focus: 'Back, Biceps',
    duration: 60,
    warmup: ['Band pull-aparts 2x15', 'Scapular retractions', 'Arm circles'],
    exercises: [
      { name: 'Landmine Row', sets: 3, reps: 10, weight: 35, notes: 'Brace core, neutral spine' },
      { name: 'TRX Row', sets: 3, reps: 12, weight: 0, notes: 'Bodyweight, feet forward = harder' },
      { name: 'TRX Bicep Curl', sets: 3, reps: 10, weight: 0, notes: 'Bodyweight, neutral grip' },
      { name: 'Hammer Curl', sets: 3, reps: 8, weight: 20, notes: 'Each hand, elbow care' },
      { name: 'Band Face Pulls', sets: 3, reps: 15, weight: 0, notes: 'Medium band, pull to nose' },
    ],
    finisher: 'SB Strength App — 15-20 min',
    cooldown: [],
    evening: {
      name: 'Neck mobility + yoga',
      duration: 20,
      exercises: ['Chin tucks 3x10', 'Cervical side stretch holds', 'Upper trap release', 'Cat/cow flow'],
    },
  },
  bike: {
    name: 'Bike HIIT',
    focus: 'Cardio, Fat Burn',
    duration: 20,
    warmup: [],
    intervals: { work: '30 sec max effort', rest: '90 sec recovery', rounds: 8 },
    burnTarget: '300-400 kcal',
    exercises: [],
    cooldown: [],
  },
  bikesprints: {
    name: 'Bike Sprints + Core',
    focus: 'Power, Core',
    duration: 25,
    warmup: ['5 min easy ride'],
    intervals: { work: 'Hill sprint max effort', rest: '2 min recovery', rounds: 4 },
    exercises: [],
    cooldown: ['5 min easy ride'],
    evening: {
      name: 'Core Circuit',
      duration: 15,
      exercises: [
        { name: 'Dead Bug', sets: 3, reps: '10 each', notes: 'Slow, controlled breathing' },
        { name: 'KB Swing', sets: 3, reps: 15, weight: '18kg', notes: 'Hinge not squat' },
        { name: 'Hollow Hold', sets: 3, reps: '30 sec', notes: 'Lower back pressed down' },
        { name: 'Plank', sets: 3, reps: '40 sec', notes: 'No neck strain, eyes down' },
      ],
    },
  },
  skate: {
    name: 'Skate Session',
    focus: 'Active Recovery, Fun',
    duration: 45,
    warmup: [],
    exercises: [],
    cooldown: [],
    notes: 'Street/transition flow',
  },
  rest: {
    name: 'Rest Day',
    focus: 'Recovery',
    exercises: [],
  },
  active: {
    name: 'Active Recovery',
    focus: 'Light movement, mobility',
    exercises: [
      { name: 'Walking', sets: 1, reps: 30, weight: null },
    ],
  },
  legs: {
    name: 'Leg Day',
    focus: 'Quads, Hamstrings, Glutes',
    exercises: [
      { name: 'Squat', sets: 4, reps: 8, weight: null },
      { name: 'Romanian Deadlift', sets: 3, reps: 10, weight: null },
      { name: 'Leg Press', sets: 3, reps: 12, weight: null },
      { name: 'Leg Curl', sets: 3, reps: 12, weight: null },
      { name: 'Calf Raises', sets: 4, reps: 15, weight: null },
    ],
  },
};

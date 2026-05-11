import { useLocalStorage, useLocalStorageArray } from './useLocalStorage';
import { createWorkoutLog, WORKOUT_TEMPLATES } from '../utils/dataSchemas';
import { format, parseISO, isToday, startOfWeek, addDays } from 'date-fns';

export function useWorkoutLogs() {
  const { items: logs, add, update, clear } = useLocalStorageArray('pump-workout-logs', []);
  const [prs, setPRs] = useLocalStorage('pump-prs', {});

  const logWorkout = (date, exercises) => {
    const workout = createWorkoutLog(date, exercises);
    add(workout);
    return workout;
  };

  const completeWorkout = (workoutId, exercises) => {
    const now = new Date().toISOString();
    const newPRs = [];

    exercises.forEach((ex) => {
      if (!ex.actual || ex.actual.weight.length === 0) return;

      const maxWeight = Math.max(...ex.actual.weight.filter((w) => w > 0));
      const currentPR = prs[ex.name];

      if (!currentPR || maxWeight > currentPR.weight) {
        newPRs.push({ name: ex.name, weight: maxWeight, date: now });
        setPRs((prev) => ({
          ...prev,
          [ex.name]: { weight: maxWeight, date: now },
        }));
      }
    });

    update(workoutId, { completedAt: now, exercises });
    return newPRs;
  };

  const getTodaysWorkout = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return logs.find((w) => w.date === today);
  };

  const getWorkoutForDate = (date) => {
    const dateStr = format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd');
    return logs.find((w) => w.date === dateStr);
  };

  const getCompletedWorkouts = (days = 30) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return logs.filter((w) => w.completedAt && new Date(w.date) >= cutoff);
  };

  const getExerciseHistory = (exerciseName, limit = 10) => {
    const history = [];

    logs.forEach((workout) => {
      if (!workout.completedAt) return;

      const exercise = workout.exercises?.find((e) => e.name === exerciseName);
      if (exercise && exercise.actual) {
        history.push({
          date: workout.date,
          ...exercise.actual,
        });
      }
    });

    return history.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
  };

  const getPR = (exerciseName) => prs[exerciseName] || null;

  const getAllPRs = () => prs;

  return {
    logs,
    prs,
    setPRs,
    logWorkout,
    completeWorkout,
    getTodaysWorkout,
    getWorkoutForDate,
    getCompletedWorkouts,
    getExerciseHistory,
    getPR,
    getAllPRs,
    clear,
  };
}

export function useWorkoutSchedule() {
  const [schedule, setSchedule] = useLocalStorage('pump-workout-schedule', {});

  const setWorkoutForDate = (date, workoutType) => {
    const dateStr = format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd');
    setSchedule((prev) => ({
      ...prev,
      [dateStr]: workoutType,
    }));
  };

  const getWorkoutForDate = (date) => {
    const dateStr = format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd');
    return schedule[dateStr] || null;
  };

  const getWorkoutTemplate = (workoutType) => {
    return WORKOUT_TEMPLATES[workoutType] || null;
  };

  const getFortnightSchedule = (startDate = new Date()) => {
    const start = startOfWeek(startDate, { weekStartsOn: 1 });
    const days = [];

    for (let i = 0; i < 14; i++) {
      const date = addDays(start, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      days.push({
        date: dateStr,
        dayOfWeek: format(date, 'EEE'),
        workoutType: schedule[dateStr] || null,
      });
    }

    return days;
  };

  const generateDefaultSchedule = (weekType, startDate) => {
    const weekAPattern = ['push', 'rest', 'pull', 'rest', 'legs', 'active', 'rest'];
    const weekBPattern = ['rest', 'push', 'rest', 'pull', 'rest', 'legs', 'active'];

    const patternA = weekType === 'A' ? weekAPattern : weekBPattern;
    const patternB = weekType === 'A' ? weekBPattern : weekAPattern;

    const start = startOfWeek(startDate || new Date(), { weekStartsOn: 1 });
    const newSchedule = { ...schedule };

    for (let i = 0; i < 7; i++) {
      const dateA = addDays(start, i);
      const dateB = addDays(start, i + 7);
      newSchedule[format(dateA, 'yyyy-MM-dd')] = patternA[i];
      newSchedule[format(dateB, 'yyyy-MM-dd')] = patternB[i];
    }

    setSchedule(newSchedule);
    return newSchedule;
  };

  return {
    schedule,
    setWorkoutForDate,
    getWorkoutForDate,
    getWorkoutTemplate,
    getFortnightSchedule,
    generateDefaultSchedule,
    setSchedule,
  };
}

export function useWorkoutTemplates() {
  const [templates, setTemplates] = useLocalStorage('pump-workout-templates', WORKOUT_TEMPLATES);

  const getTemplate = (type) => templates[type] || WORKOUT_TEMPLATES[type] || null;

  const addExercise = (templateName, exercise) => {
    setTemplates(prev => {
      const template = prev[templateName] || WORKOUT_TEMPLATES[templateName];
      if (!template) return prev;

      return {
        ...prev,
        [templateName]: {
          ...template,
          exercises: [...(template.exercises || []), exercise]
        }
      };
    });
  };

  const removeExercise = (templateName, exerciseName) => {
    setTemplates(prev => {
      const template = prev[templateName] || WORKOUT_TEMPLATES[templateName];
      if (!template) return prev;

      return {
        ...prev,
        [templateName]: {
          ...template,
          exercises: (template.exercises || []).filter(e => e.name !== exerciseName)
        }
      };
    });
  };

  const updateExercise = (templateName, exerciseName, updates) => {
    setTemplates(prev => {
      const template = prev[templateName] || WORKOUT_TEMPLATES[templateName];
      if (!template) return prev;

      return {
        ...prev,
        [templateName]: {
          ...template,
          exercises: (template.exercises || []).map(e =>
            e.name === exerciseName ? { ...e, ...updates } : e
          )
        }
      };
    });
  };

  return {
    templates,
    getTemplate,
    addExercise,
    removeExercise,
    updateExercise,
    setTemplates,
  };
}

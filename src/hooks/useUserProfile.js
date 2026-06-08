import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_USER_PROFILE } from '../utils/dataSchemas';
import { differenceInDays, parseISO } from 'date-fns';
import { useEffect } from 'react';
import { migrateGoal } from '../utils/goal';

export function useUserProfile() {
  const [profile, setProfile, reset] = useLocalStorage('pump-user-profile', DEFAULT_USER_PROFILE);

  // Ensure weekTemplates exist (for profiles created before this feature)
  useEffect(() => {
    if (!profile.weekTemplates && DEFAULT_USER_PROFILE.weekTemplates) {
      setProfile(prev => ({ ...prev, weekTemplates: DEFAULT_USER_PROFILE.weekTemplates }));
    }
  }, [profile.weekTemplates, setProfile]);

  // Migrate old weekAStart format to new schedulePattern shape
  useEffect(() => {
    const sp = profile.schedulePattern;
    if (sp && sp.weekAStart && !sp.type) {
      setProfile(prev => ({
        ...prev,
        schedulePattern: {
          type: 'alternating',
          cycleLength: 14,
          cycleStart: sp.weekAStart,
          labels: ['A', 'B'],
          description: '',
        },
      }));
    }
  }, [profile.schedulePattern, setProfile]);

  // Build the goal model for profiles created before it existed (runs once).
  useEffect(() => {
    if (!profile.goal) {
      setProfile(prev => ({ ...prev, goal: migrateGoal(prev) }));
    }
  }, [profile.goal, setProfile]);

  const updateProfile = (updates) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  };

  const getDaysToGoal = () => {
    return differenceInDays(parseISO(profile.targetDate), new Date());
  };

  const getWeightTarget = () => profile.goal?.targets?.weight?.value ?? profile.targetWeight ?? null;

  const getWeightToLose = () => {
    const t = getWeightTarget();
    return t != null ? profile.currentWeight - t : 0;
  };

  const getWeightLost = () => {
    return profile.startingWeight - profile.currentWeight;
  };

  const getRequiredWeeklyRate = () => {
    const days = getDaysToGoal();
    const toLose = getWeightToLose();
    return days > 0 ? (toLose / days) * 7 : 0;
  };

  const getProgress = () => {
    const t = getWeightTarget();
    if (t == null || !profile.startingWeight) return 0;
    const total = profile.startingWeight - t;
    const lost = profile.startingWeight - profile.currentWeight;
    return total !== 0 ? Math.min(Math.max((lost / total) * 100, 0), 100) : 0;
  };

  const getCalorieTarget = () => {
    return Math.round((profile.calorieTarget.min + profile.calorieTarget.max) / 2);
  };

  const getProteinTarget = () => {
    return Math.round((profile.proteinTarget.min + profile.proteinTarget.max) / 2);
  };

  const getCurrentWeekType = () => {
    return getWeekTypeForDate(new Date());
  };

  // Returns the phase label (e.g. 'A', 'B', 'On', 'Off') for any given date
  const getWeekTypeForDate = (date) => {
    const sp = profile.schedulePattern;

    // New format
    if (sp?.type && sp?.cycleStart && sp?.labels?.length > 0) {
      const startDate = parseISO(sp.cycleStart);
      const daysDiff = differenceInDays(date, startDate);
      const positionInCycle = ((daysDiff % sp.cycleLength) + sp.cycleLength) % sp.cycleLength;
      const weekIndex = Math.floor(positionInCycle / 7);
      return sp.labels[weekIndex] ?? sp.labels[0];
    }

    // Legacy format: weekAStart
    if (sp?.weekAStart) {
      const startDate = parseISO(sp.weekAStart);
      const daysDiff = differenceInDays(date, startDate);
      const weekNumber = Math.floor(daysDiff / 7);
      return weekNumber % 2 === 0 ? 'A' : 'B';
    }

    return 'A'; // Default
  };

  return {
    profile,
    setProfile,
    updateProfile,
    reset,
    getDaysToGoal,
    getWeightTarget,
    getWeightToLose,
    getWeightLost,
    getRequiredWeeklyRate,
    getProgress,
    getCalorieTarget,
    getProteinTarget,
    getCurrentWeekType,
    getWeekTypeForDate,
  };
}

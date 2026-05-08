import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_USER_PROFILE } from '../utils/dataSchemas';
import { differenceInDays, parseISO } from 'date-fns';
import { useEffect } from 'react';

export function useUserProfile() {
  const [profile, setProfile, reset] = useLocalStorage('pump-user-profile', DEFAULT_USER_PROFILE);

  // Ensure weekTemplates exist (for profiles created before this feature)
  useEffect(() => {
    if (!profile.weekTemplates && DEFAULT_USER_PROFILE.weekTemplates) {
      setProfile(prev => ({ ...prev, weekTemplates: DEFAULT_USER_PROFILE.weekTemplates }));
    }
  }, [profile.weekTemplates, setProfile]);

  const updateProfile = (updates) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  };

  const getDaysToGoal = () => {
    return differenceInDays(parseISO(profile.targetDate), new Date());
  };

  const getWeightToLose = () => {
    return profile.currentWeight - profile.targetWeight;
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
    const total = profile.startingWeight - profile.targetWeight;
    const lost = getWeightLost();
    return total > 0 ? (lost / total) * 100 : 0;
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

  const getWeekTypeForDate = (date) => {
    if (!profile.schedulePattern?.weekAStart) {
      return 'A'; // Default to Week A if not configured
    }
    const startDate = parseISO(profile.schedulePattern.weekAStart);
    const daysDiff = differenceInDays(date, startDate);
    const weekNumber = Math.floor(daysDiff / 7);
    return weekNumber % 2 === 0 ? 'A' : 'B';
  };

  return {
    profile,
    setProfile,
    updateProfile,
    reset,
    getDaysToGoal,
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

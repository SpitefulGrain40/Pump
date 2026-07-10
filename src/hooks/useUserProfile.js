import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_USER_PROFILE } from '../utils/dataSchemas';
import { differenceInDays, parseISO } from 'date-fns';
import { useEffect } from 'react';
import { migrateGoal } from '../utils/goal';
import { getPhaseLabel } from '../utils/schedule';

// Convert the legacy weekday-based weekTemplates ({ A: {mon..sun}, B: {...} })
// into a position-based cycleTemplate ({ "1": ..., "14": ... }). Position is
// labelIndex * 7 + dayIndex + 1, which is exactly how A/B fortnights laid out.
function migrateWeekTemplatesToCycle(profile) {
  const wt = profile.weekTemplates || {};
  const labels = profile.schedulePattern?.labels || ['A', 'B'];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const cycleTemplate = {};
  labels.forEach((label, li) => {
    const week = wt[label];
    if (!week) return;
    days.forEach((day, di) => {
      if (week[day]) cycleTemplate[String(li * 7 + di + 1)] = week[day];
    });
  });
  return cycleTemplate;
}

const PROFILE_KEY = 'pump-user-profile';
const STORAGE_UPDATE_EVENT = 'local-storage-update';

export function useUserProfile() {
  const [profile, setProfile, reset] = useLocalStorage(PROFILE_KEY, DEFAULT_USER_PROFILE);

  // One-time migration: legacy weekTemplates → position-based cycleTemplate.
  // Runs once (until cycleTemplate exists), drops weekTemplates afterwards.
  useEffect(() => {
    if (profile.cycleTemplate) return;
    setProfile(prev => {
      const { weekTemplates, ...rest } = prev;
      const hasLegacy = weekTemplates &&
        Object.values(weekTemplates).some(w => w && Object.keys(w).length > 0);
      return { ...rest, cycleTemplate: hasLegacy ? migrateWeekTemplatesToCycle(prev) : {} };
    });
  }, [profile.cycleTemplate, setProfile]);

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

  // Reads fresh from localStorage and writes synchronously (same pattern as
  // useLocalStorageArray.add()) rather than relying solely on setProfile's
  // effect-based persistence. A plain setProfile() alone only writes to
  // localStorage in a useEffect on the NEXT render of this hook's own
  // instance — if the caller (e.g. a modal) unmounts itself in the same
  // synchronous handler (onClose() right after updateProfile()), that
  // render never happens and the update is silently lost.
  const updateProfile = (updates) => {
    const current = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || DEFAULT_USER_PROFILE;
    const next = { ...current, ...updates };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key: PROFILE_KEY } }));
    setProfile(next);
  };

  const getDaysToGoal = () => {
    const date = profile.goal?.targets?.weight?.date ?? profile.targetDate ?? null;
    if (!date) return null;
    return differenceInDays(parseISO(date), new Date());
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

  // Returns the phase label (e.g. 'A', 'B', 'On', 'Off') for any given date.
  // Splits the cycle evenly across labels.length phases, so an 8-day rotor with
  // ['On','Off'] gets 4 days each — not the old "divide by 7" weekly assumption.
  const getWeekTypeForDate = (date) => {
    const sp = profile.schedulePattern;

    if (sp?.type && sp?.cycleStart && sp?.labels?.length > 0) {
      return getPhaseLabel(sp, date);
    }

    // Legacy format: weekAStart
    if (sp?.weekAStart) {
      const daysDiff = differenceInDays(date, parseISO(sp.weekAStart));
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

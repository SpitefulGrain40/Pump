import { useLocalStorageArray } from './useLocalStorage';
import { createMealLog } from '../utils/dataSchemas';
import { format, parseISO, startOfDay, isToday } from 'date-fns';

export function useNutritionLogs() {
  const { items: meals, add, update, remove, clear } = useLocalStorageArray('pump-nutrition-logs', []);

  const logMeal = (items, totals, photoAnalyzed = false) => {
    const meal = createMealLog(items, totals, photoAnalyzed);
    add(meal);
    return meal;
  };

  const getTodaysMeals = () => {
    return meals.filter((m) => isToday(parseISO(m.timestamp)));
  };

  const getTodaysTotals = () => {
    const todayMeals = getTodaysMeals();
    return todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.totals?.calories || 0),
        protein: acc.protein + (meal.totals?.protein || 0),
      }),
      { calories: 0, protein: 0 }
    );
  };

  const getMealsForDate = (date) => {
    const targetDate = format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd');
    return meals.filter((m) => format(parseISO(m.timestamp), 'yyyy-MM-dd') === targetDate);
  };

  const getDailyTotals = (date) => {
    const dayMeals = getMealsForDate(date);
    return dayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (meal.totals?.calories || 0),
        protein: acc.protein + (meal.totals?.protein || 0),
      }),
      { calories: 0, protein: 0 }
    );
  };

  const getWeeklyAverage = () => {
    const now = new Date();
    let totalCalories = 0;
    let totalProtein = 0;
    let daysWithData = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const totals = getDailyTotals(date);
      if (totals.calories > 0) {
        totalCalories += totals.calories;
        totalProtein += totals.protein;
        daysWithData++;
      }
    }

    return daysWithData > 0
      ? {
          calories: Math.round(totalCalories / daysWithData),
          protein: Math.round(totalProtein / daysWithData),
          daysTracked: daysWithData,
        }
      : { calories: 0, protein: 0, daysTracked: 0 };
  };

  return {
    meals,
    logMeal,
    updateMeal: update,
    removeMeal: remove,
    getTodaysMeals,
    getTodaysTotals,
    getMealsForDate,
    getDailyTotals,
    getWeeklyAverage,
    clear,
  };
}

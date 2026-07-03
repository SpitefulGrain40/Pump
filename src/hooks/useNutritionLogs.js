import { useLocalStorageArray } from './useLocalStorage';
import { createMealLog } from '../utils/dataSchemas';
import { format, parseISO, isToday } from 'date-fns';

// Round to 1 decimal place — fixes float artifacts like 10.00000000000002
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function useNutritionLogs() {
  const { items: meals, add, update, remove, clear } = useLocalStorageArray('pump-nutrition-logs', []);

  const logMeal = (items, totals, photoAnalyzed = false, date = null) => {
    const meal = createMealLog(items, totals, photoAnalyzed, date);
    add(meal);
    return meal;
  };

  const getTodaysMeals = () => {
    return meals.filter((m) => isToday(parseISO(m.timestamp)));
  };

  const getTodaysTotals = () => {
    const todayMeals = getTodaysMeals();
    const sum = todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (Number(meal.totals?.calories) || 0),
        protein: acc.protein + (Number(meal.totals?.protein) || 0),
        carbs: acc.carbs + (Number(meal.totals?.carbs) || 0),
        fat: acc.fat + (Number(meal.totals?.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return { calories: round1(sum.calories), protein: round1(sum.protein), carbs: round1(sum.carbs), fat: round1(sum.fat) };
  };

  const getMealsForDate = (date) => {
    const targetDate = format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd');
    return meals.filter((m) => format(parseISO(m.timestamp), 'yyyy-MM-dd') === targetDate);
  };

  const getDailyTotals = (date) => {
    const dayMeals = getMealsForDate(date);
    const sum = dayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + (Number(meal.totals?.calories) || 0),
        protein: acc.protein + (Number(meal.totals?.protein) || 0),
        carbs: acc.carbs + (Number(meal.totals?.carbs) || 0),
        fat: acc.fat + (Number(meal.totals?.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return { calories: round1(sum.calories), protein: round1(sum.protein), carbs: round1(sum.carbs), fat: round1(sum.fat) };
  };

  // 7-day average. Calories and protein are averaged INDEPENDENTLY — a day
  // with 0 calories doesn't drag the calorie avg; a day with 0 protein doesn't
  // drag the protein avg. Skipped/empty days are excluded from both denominators.
  const getWeeklyAverage = () => {
    const now = new Date();
    let totalCalories = 0;
    let totalProtein = 0;
    let calorieDays = 0;
    let proteinDays = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const totals = getDailyTotals(date);
      if (totals.calories > 0) {
        totalCalories += totals.calories;
        calorieDays++;
      }
      if (totals.protein > 0) {
        totalProtein += totals.protein;
        proteinDays++;
      }
    }

    // daysTracked = max of either to give the user a sense of coverage.
    const daysTracked = Math.max(calorieDays, proteinDays);
    return {
      calories: calorieDays > 0 ? Math.round(totalCalories / calorieDays) : 0,
      protein: proteinDays > 0 ? Math.round(totalProtein / proteinDays) : 0,
      daysTracked,
    };
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

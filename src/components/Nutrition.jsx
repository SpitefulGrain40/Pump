import { useState } from 'react';
import { Flame, Beef, ChevronLeft, ChevronRight, Trash2, Plus } from 'lucide-react';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useUserProfile } from '../hooks/useUserProfile';
import { useWorkoutSchedule } from '../hooks/useWorkoutLogs';
import { format, addDays, subDays, isToday, startOfDay } from 'date-fns';
import MealLogger from './MealLogger';

export default function Nutrition() {
  const { meals, getMealsForDate, getDailyTotals, getWeeklyAverage, removeMeal } = useNutritionLogs();
  const { profile, getCalorieTarget, getProteinTarget } = useUserProfile();
  const { schedule } = useWorkoutSchedule();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showMealLogger, setShowMealLogger] = useState(false);

  const defaultCalorieTarget = getCalorieTarget() || 2300;
  const defaultProteinTarget = getProteinTarget() || 180;
  const weeklyAvg = getWeeklyAverage();

  // Get the day's scheduled targets, fall back to profile defaults
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const daySchedule = schedule[dateStr];
  const calorieTarget = daySchedule?.calories || defaultCalorieTarget;
  const proteinTarget = daySchedule?.protein || defaultProteinTarget;

  const dayMeals = getMealsForDate(selectedDate);
  const dayTotals = getDailyTotals(selectedDate);

  const handlePrevDay = () => setSelectedDate(d => subDays(d, 1));
  const handleNextDay = () => setSelectedDate(d => addDays(d, 1));
  const handleToday = () => setSelectedDate(new Date());

  const getCalorieColor = (calories) => {
    // Use day-specific target for color calculation
    const targetMax = daySchedule?.calories || profile.calorieTarget?.max || calorieTarget;
    const targetMin = daySchedule?.calories ? targetMax - 200 : profile.calorieTarget?.min;

    if (!targetMin) return 'text-text';
    if (calories < targetMin) return 'text-info';
    if (calories <= targetMax) return 'text-accent';
    return 'text-danger';
  };

  const getProteinColor = (protein) => {
    // Use day-specific target for color calculation
    const targetMin = daySchedule?.protein || profile.proteinTarget?.min;
    if (!targetMin) return 'text-text';
    if (protein >= targetMin) return 'text-accent';
    if (protein >= targetMin * 0.8) return 'text-warning';
    return 'text-text-muted';
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Nutrition</h1>
          <p className="text-sm text-text-muted">Track your meals</p>
        </div>
        <button
          onClick={() => setShowMealLogger(true)}
          className="flex items-center gap-2 bg-accent text-bg px-4 py-2 rounded-lg font-medium"
        >
          <Plus size={18} />
          Log Meal
        </button>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-surface rounded-xl p-3">
        <button onClick={handlePrevDay} className="p-2">
          <ChevronLeft size={20} />
        </button>
        <button onClick={handleToday} className="text-center">
          <div className="font-medium">
            {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE')}
          </div>
          <div className="text-sm text-text-muted">{format(selectedDate, 'MMM d, yyyy')}</div>
        </button>
        <button onClick={handleNextDay} className="p-2">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Daily Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={18} className="text-warning" />
            <span className="text-sm text-text-muted">Calories</span>
          </div>
          <div className={`text-2xl font-bold ${getCalorieColor(dayTotals.calories)}`}>
            {dayTotals.calories}
          </div>
          <div className="text-xs text-text-muted">/ {calorieTarget} kcal</div>
          <div className="w-full bg-border rounded-full h-1.5 mt-2">
            <div
              className={`h-1.5 rounded-full transition-all ${
                dayTotals.calories > calorieTarget ? 'bg-danger' : 'bg-warning'
              }`}
              style={{ width: `${Math.min((dayTotals.calories / calorieTarget) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Beef size={18} className="text-accent" />
            <span className="text-sm text-text-muted">Protein</span>
          </div>
          <div className={`text-2xl font-bold ${getProteinColor(dayTotals.protein)}`}>
            {dayTotals.protein}g
          </div>
          <div className="text-xs text-text-muted">/ {proteinTarget}g</div>
          <div className="w-full bg-border rounded-full h-1.5 mt-2">
            <div
              className="bg-accent h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min((dayTotals.protein / proteinTarget) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Weekly Average */}
      {weeklyAvg.daysTracked > 0 && (
        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-medium mb-2">7-Day Average</h3>
          <div className="flex justify-between text-sm">
            <div>
              <span className="text-text-muted">Calories: </span>
              <span className={getCalorieColor(weeklyAvg.calories)}>{weeklyAvg.calories}</span>
            </div>
            <div>
              <span className="text-text-muted">Protein: </span>
              <span className={getProteinColor(weeklyAvg.protein)}>{weeklyAvg.protein}g</span>
            </div>
            <div className="text-text-muted">
              {weeklyAvg.daysTracked} days tracked
            </div>
          </div>
        </div>
      )}

      {/* Meals List */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="font-medium mb-3">
          {isToday(selectedDate) ? "Today's" : format(selectedDate, 'MMM d')} Meals
        </h3>
        {dayMeals.length > 0 ? (
          <div className="space-y-2">
            {dayMeals.map((meal) => (
              <div key={meal.id} className="bg-bg rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-text-muted mb-1">
                      {format(new Date(meal.timestamp), 'h:mm a')}
                    </div>
                    <div className="space-y-1">
                      {meal.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="truncate mr-2">{item.name}</span>
                          <span className="text-text-muted whitespace-nowrap">
                            {item.calories} · {item.protein}g
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-border text-sm font-medium">
                      <span>Total</span>
                      <span>
                        {meal.totals?.calories || 0} kcal · {meal.totals?.protein || 0}g protein
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMeal(meal.id)}
                    className="p-2 text-text-muted hover:text-danger ml-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-muted">
            <Flame size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No meals logged</p>
            {isToday(selectedDate) && (
              <button
                onClick={() => setShowMealLogger(true)}
                className="mt-3 text-accent text-sm font-medium"
              >
                Log your first meal
              </button>
            )}
          </div>
        )}
      </div>

      {/* Meal Logger Modal */}
      {showMealLogger && <MealLogger onClose={() => setShowMealLogger(false)} />}
    </div>
  );
}

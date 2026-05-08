import { useState } from 'react';
import { Target, Flame, Beef, Dumbbell, Plus, Scale, MessageCircle, UserCircle, ChevronRight, Trash2, Download, X } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useWorkoutSchedule, useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWeightHistory } from '../hooks/useWeightHistory';
import { useBackup } from '../hooks/useSettings';
import { format } from 'date-fns';
import WeightModal from './WeightModal';
import MealLogger from './MealLogger';
import WorkoutLogger from './WorkoutLogger';

export default function Dashboard({ onNavigate }) {
  const { profile, getDaysToGoal, getProgress, getCalorieTarget, getProteinTarget } = useUserProfile();
  const { getTodaysTotals, getTodaysMeals, removeMeal } = useNutritionLogs();
  const { schedule, getWorkoutForDate, getWorkoutTemplate } = useWorkoutSchedule();
  const { getTodaysWorkout } = useWorkoutLogs();
  const { getLatestWeight } = useWeightHistory();
  const { exportData, needsBackupReminder } = useBackup();

  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMealLogger, setShowMealLogger] = useState(false);
  const [showWorkoutLogger, setShowWorkoutLogger] = useState(false);
  const [backupDismissed, setBackupDismissed] = useState(false);

  const isOnboarded = profile.onboardingComplete;

  // If not onboarded, show setup prompt
  if (!isOnboarded) {
    return (
      <div className="p-4 space-y-4">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-text">PUMP</h1>
          <p className="text-text-muted text-sm">{format(new Date(), 'EEEE, MMM d')}</p>
        </header>

        <div className="bg-surface rounded-xl p-6 text-center">
          <UserCircle size={48} className="mx-auto mb-4 text-accent opacity-50" />
          <h2 className="text-lg font-semibold mb-2">Welcome to Pump!</h2>
          <p className="text-text-muted text-sm mb-4">
            Let's set up your fitness profile so I can help you reach your goals.
          </p>
          <button
            onClick={() => onNavigate('coach')}
            className="bg-accent text-bg px-6 py-3 rounded-xl font-semibold"
          >
            Start Setup with Coach
          </button>
        </div>
      </div>
    );
  }

  const todaysTotals = getTodaysTotals();
  const todaysMeals = getTodaysMeals();
  const daysToGoal = getDaysToGoal() || 0;
  const progress = getProgress() || 0;

  // Get today's schedule-specific targets, fall back to profile defaults
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = schedule[todayStr];
  const defaultCalorieTarget = getCalorieTarget() || 2300;
  const defaultProteinTarget = getProteinTarget() || 180;
  const calorieTarget = todaySchedule?.calories || defaultCalorieTarget;
  const proteinTarget = todaySchedule?.protein || defaultProteinTarget;

  const todayWorkoutType = getWorkoutForDate(new Date());
  const todayTemplate = todayWorkoutType ? getWorkoutTemplate(todayWorkoutType) : null;
  const todaysWorkoutLog = getTodaysWorkout();

  const latestWeight = getLatestWeight();
  const currentWeight = latestWeight?.weight || profile.currentWeight || '--';

  const caloriePercent = calorieTarget ? Math.min((todaysTotals.calories / calorieTarget) * 100, 100) : 0;
  const proteinPercent = proteinTarget ? Math.min((todaysTotals.protein / proteinTarget) * 100, 100) : 0;

  const getCalorieColor = () => {
    // Use schedule-specific target, then profile min/max, then default
    const targetMax = todaySchedule?.calories || profile.calorieTarget?.max || calorieTarget;
    const targetMin = todaySchedule?.calories ? targetMax - 200 : profile.calorieTarget?.min;

    if (!targetMin) return 'text-text';
    if (todaysTotals.calories < targetMin) return 'text-info';
    if (todaysTotals.calories <= targetMax) return 'text-accent';
    return 'text-danger';
  };

  const getProteinColor = () => {
    // Use schedule-specific target, then profile min
    const targetMin = todaySchedule?.protein || profile.proteinTarget?.min;
    if (!targetMin) return 'text-text';
    if (todaysTotals.protein >= targetMin) return 'text-accent';
    if (todaysTotals.protein >= targetMin * 0.8) return 'text-warning';
    return 'text-text-muted';
  };

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">
            {profile.name ? `Hey, ${profile.name.split(' ')[0]}!` : 'PUMP'}
          </h1>
          <p className="text-text-muted text-sm">{format(new Date(), 'EEEE, MMM d')}</p>
        </div>
        <button
          onClick={() => setShowWeightModal(true)}
          className="flex items-center gap-2 bg-surface-light px-3 py-2 rounded-lg text-sm"
        >
          <Scale size={16} />
          <span className="font-medium">{currentWeight} kg</span>
        </button>
      </header>

      {/* Backup Reminder */}
      {needsBackupReminder() && !backupDismissed && (
        <div className="bg-warning/20 border border-warning/30 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Download size={20} className="text-warning" />
            <div>
              <div className="text-sm font-medium">Weekly backup reminder</div>
              <div className="text-xs text-text-muted">Keep your data safe</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                exportData();
                setBackupDismissed(true);
              }}
              className="bg-warning text-bg px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              Backup
            </button>
            <button
              onClick={() => setBackupDismissed(true)}
              className="p-1.5 text-text-muted"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Goal Countdown */}
      {profile.targetWeight && profile.targetDate && (
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={20} className="text-accent" />
              <span className="font-medium">Goal: {profile.targetWeight} kg</span>
            </div>
            <span className="text-2xl font-bold text-accent">{daysToGoal > 0 ? daysToGoal : 0}</span>
          </div>
          <p className="text-text-muted text-sm mb-3">days remaining</p>
          <div className="w-full bg-border rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all"
              style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-2">
            <span>{profile.startingWeight || profile.currentWeight} kg</span>
            <span>{currentWeight} kg</span>
            <span>{profile.targetWeight} kg</span>
          </div>
        </div>
      )}

      {/* Body Stats Summary */}
      {profile.bodyFatPercentage && (
        <div className="bg-surface rounded-xl p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-accent">{profile.bodyFatPercentage}%</div>
              <div className="text-xs text-text-muted">Body Fat</div>
            </div>
            <div>
              <div className="text-lg font-bold text-info">{profile.tdee || '--'}</div>
              <div className="text-xs text-text-muted">TDEE</div>
            </div>
            <div>
              <div className="text-lg font-bold text-warning">
                {profile.currentWeight && profile.bodyFatPercentage
                  ? Math.round(profile.currentWeight * (1 - profile.bodyFatPercentage / 100) * 10) / 10
                  : '--'}
              </div>
              <div className="text-xs text-text-muted">Lean Mass</div>
            </div>
          </div>
        </div>
      )}

      {/* Today's Workout */}
      <div className="bg-surface rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Dumbbell size={20} className="text-info" />
            <span className="font-medium">{todayTemplate?.name || 'No workout scheduled'}</span>
          </div>
          {todaysWorkoutLog?.completedAt && (
            <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">Done</span>
          )}
        </div>
        {todayTemplate && todayTemplate.exercises.length > 0 ? (
          <>
            <p className="text-text-muted text-sm mb-3">{todayTemplate.focus}</p>
            <ul className="text-sm space-y-1 mb-3">
              {todayTemplate.exercises.slice(0, 3).map((ex, i) => (
                <li key={i} className="text-text-muted">
                  {ex.name} · {ex.sets}×{ex.reps}
                </li>
              ))}
              {todayTemplate.exercises.length > 3 && (
                <li className="text-text-muted">+{todayTemplate.exercises.length - 3} more</li>
              )}
            </ul>
            {!todaysWorkoutLog?.completedAt && (
              <button
                onClick={() => setShowWorkoutLogger(true)}
                className="w-full bg-info/20 text-info py-2 rounded-lg font-medium"
              >
                Start Workout
              </button>
            )}
          </>
        ) : todayTemplate?.name === 'Rest Day' ? (
          <p className="text-text-muted text-sm">Recovery day - stretch and rest</p>
        ) : (
          <button
            onClick={() => onNavigate('schedule')}
            className="w-full bg-surface-light text-text-muted py-2 rounded-lg text-sm"
          >
            Set up workout schedule
          </button>
        )}
      </div>

      {/* Nutrition Trackers */}
      <div className="grid grid-cols-2 gap-3">
        {/* Calories */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={18} className="text-warning" />
            <span className="text-sm text-text-muted">Calories</span>
          </div>
          <div className={`text-2xl font-bold ${getCalorieColor()}`}>
            {todaysTotals.calories}
          </div>
          <div className="text-xs text-text-muted mb-2">/ {calorieTarget} kcal</div>
          <div className="w-full bg-border rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                todaysTotals.calories > calorieTarget ? 'bg-danger' : 'bg-warning'
              }`}
              style={{ width: `${caloriePercent}%` }}
            />
          </div>
        </div>

        {/* Protein */}
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Beef size={18} className="text-accent" />
            <span className="text-sm text-text-muted">Protein</span>
          </div>
          <div className={`text-2xl font-bold ${getProteinColor()}`}>
            {todaysTotals.protein}g
          </div>
          <div className="text-xs text-text-muted mb-2">/ {proteinTarget}g</div>
          <div className="w-full bg-border rounded-full h-1.5">
            <div
              className="bg-accent h-1.5 rounded-full transition-all"
              style={{ width: `${proteinPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Today's Meals */}
      {todaysMeals.length > 0 && (
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-warning" />
              <span className="font-medium">Today's Meals</span>
            </div>
            <button
              onClick={() => onNavigate('nutrition')}
              className="flex items-center gap-1 text-xs text-text-muted"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-2">
            {todaysMeals.map((meal) => (
              <div key={meal.id} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {meal.items?.map(i => i.name).join(', ') || 'Meal'}
                  </div>
                  <div className="text-xs text-text-muted">
                    {format(new Date(meal.timestamp), 'h:mm a')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium">{meal.totals?.calories || 0}</div>
                    <div className="text-xs text-text-muted">{meal.totals?.protein || 0}g</div>
                  </div>
                  <button
                    onClick={() => removeMeal(meal.id)}
                    className="p-1 text-text-muted hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setShowMealLogger(true)}
          className="bg-surface rounded-xl p-4 flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 bg-warning/20 rounded-full flex items-center justify-center">
            <Plus size={20} className="text-warning" />
          </div>
          <span className="text-xs text-text-muted">Log Meal</span>
        </button>

        <button
          onClick={() => setShowWeightModal(true)}
          className="bg-surface rounded-xl p-4 flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center">
            <Scale size={20} className="text-accent" />
          </div>
          <span className="text-xs text-text-muted">Weigh In</span>
        </button>

        <button
          onClick={() => onNavigate('coach')}
          className="bg-surface rounded-xl p-4 flex flex-col items-center gap-2"
        >
          <div className="w-10 h-10 bg-info/20 rounded-full flex items-center justify-center">
            <MessageCircle size={20} className="text-info" />
          </div>
          <span className="text-xs text-text-muted">Ask Coach</span>
        </button>
      </div>

      {/* Modals */}
      {showWeightModal && <WeightModal onClose={() => setShowWeightModal(false)} />}
      {showMealLogger && <MealLogger onClose={() => setShowMealLogger(false)} />}
      {showWorkoutLogger && (
        <WorkoutLogger
          workout={todayTemplate}
          onClose={() => setShowWorkoutLogger(false)}
        />
      )}
    </div>
  );
}

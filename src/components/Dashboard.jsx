import { useState, useMemo } from 'react';
import { Target, Flame, Beef, Dumbbell, Plus, Scale, UserCircle, ChevronRight, ChevronDown, Trash2, Download, X, TrendingDown, Trophy, Calendar } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useUserProfile } from '../hooks/useUserProfile';
import { resolveBodyFat, getNavyBodyFat } from '../utils/calculations';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useWorkoutSchedule, useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useWeightHistory } from '../hooks/useWeightHistory';
import { useBackup } from '../hooks/useSettings';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { format, subDays, parseISO } from 'date-fns';
import WeightModal from './WeightModal';
import MealLogger from './MealLogger';
import WorkoutLogger from './WorkoutLogger';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
    y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
  },
};

export default function Dashboard({ onNavigate, onOpenCoach }) {
  const { profile, getDaysToGoal, getProgress, getCalorieTarget, getProteinTarget, getWeightLost } = useUserProfile();
  const { getTodaysTotals, getTodaysMeals, removeMeal, getDailyTotals } = useNutritionLogs();
  const { schedule, getWorkoutForDate, getWorkoutTemplate } = useWorkoutSchedule();
  const { getTodaysWorkout, getAllPRs } = useWorkoutLogs();
  const { getLatestWeight, entries: weightEntries } = useWeightHistory();
  const { exportData, needsBackupReminder } = useBackup();
  const [completedDays] = useLocalStorage('pump-completed-workouts', {});

  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMealLogger, setShowMealLogger] = useState(false);
  const [showWorkoutLogger, setShowWorkoutLogger] = useState(false);
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

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
  const weightLost = getWeightLost ? getWeightLost() : 0;

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

  // Progress chart data
  const prs = getAllPRs ? getAllPRs() : {};
  const prList = Object.entries(prs).map(([name, data]) => ({ name, ...data })).sort((a, b) => new Date(b.date) - new Date(a.date));

  const weightChartData = useMemo(() => {
    const sorted = [...weightEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const last14 = sorted.slice(-14);
    return {
      labels: last14.map(e => format(parseISO(e.date), 'MMM d')),
      datasets: [
        { label: 'Weight', data: last14.map(e => e.weight), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#22c55e' },
        { label: 'Target', data: last14.map(() => profile.targetWeight), borderColor: '#3b82f6', borderDash: [5, 5], pointRadius: 0 },
      ],
    };
  }, [weightEntries, profile.targetWeight]);

  const calorieChartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const totals = getDailyTotals(date);
      days.push({ date: format(date, 'MMM d'), calories: totals.calories });
    }
    return {
      labels: days.map(d => d.date),
      datasets: [{
        label: 'Calories', data: days.map(d => d.calories),
        backgroundColor: days.map(d => {
          if (d.calories === 0) return '#1f1f1f';
          if (d.calories < (profile.calorieTarget?.min || 2000)) return '#3b82f6';
          if (d.calories <= (profile.calorieTarget?.max || 2400)) return '#22c55e';
          return '#ef4444';
        }),
        borderRadius: 4,
      }],
    };
  }, [getDailyTotals, profile.calorieTarget]);

  const workoutDays = useMemo(() => {
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      const daySchedule = schedule[date];
      const dayCompleted = completedDays[date];
      const hasScheduledWorkout = daySchedule && (
        (daySchedule.lunch?.type && !['rest', 'family'].includes(daySchedule.lunch.type)) ||
        (daySchedule.evening?.type && !['rest', 'family'].includes(daySchedule.evening.type))
      );
      last30.push({ date, hasWorkout: dayCompleted?.lunch || dayCompleted?.evening, wasScheduled: hasScheduledWorkout });
    }
    return last30;
  }, [completedDays, schedule]);

  const streak = useMemo(() => {
    let count = 0;
    for (let i = workoutDays.length - 1; i >= 0; i--) {
      if (workoutDays[i].hasWorkout) count++;
      else if (count > 0) break;
    }
    return count;
  }, [workoutDays]);

  const completedCount = workoutDays.filter(d => d.hasWorkout).length;

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

      {/* Body Stats Summary — Navy is the displayed default; manual shown as small secondary */}
      {(() => {
        const { value: displayedBF, source } = resolveBodyFat(profile);
        const navy = getNavyBodyFat(profile);
        const manual = profile.bodyFatManual ?? profile.bodyFatPercentage;
        const showSecondary = navy && manual && Math.abs(navy - manual) >= 0.5;
        if (!displayedBF) return null;
        return (
          <div className="bg-surface rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-accent">{displayedBF}%</div>
                <div className="text-xs text-text-muted">
                  Body Fat{source === 'navy' ? ' (Navy)' : source === 'manual' ? ' (manual)' : ''}
                </div>
                {showSecondary && (
                  <div className="text-[10px] text-text-muted/70 mt-0.5">
                    manual: {manual}%
                  </div>
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-info">{profile.tdee || '--'}</div>
                <div className="text-xs text-text-muted">TDEE</div>
              </div>
              <div>
                <div className="text-lg font-bold text-warning">
                  {profile.currentWeight && displayedBF
                    ? Math.round(profile.currentWeight * (1 - displayedBF / 100) * 10) / 10
                    : '--'}
                </div>
                <div className="text-xs text-text-muted">Lean Mass</div>
              </div>
            </div>
          </div>
        );
      })()}

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
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowMealLogger(true)}
          className="bg-surface rounded-xl p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-warning/20 rounded-full flex items-center justify-center shrink-0">
            <Plus size={20} className="text-warning" />
          </div>
          <span className="text-sm font-medium">Log Meal</span>
        </button>

        <button
          onClick={() => setShowWeightModal(true)}
          className="bg-surface rounded-xl p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
            <Scale size={20} className="text-accent" />
          </div>
          <span className="text-sm font-medium">Weigh In</span>
        </button>
      </div>

      {/* Collapsible Progress */}
      <div className="bg-surface rounded-xl overflow-hidden">
        <button
          onClick={() => setProgressOpen(o => !o)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-accent" />
            <span className="font-medium">Progress</span>
            <span className="text-xs text-text-muted ml-1">
              {weightLost > 0 ? `−${weightLost.toFixed(1)} kg` : ''}{streak > 0 ? ` · ${streak}d streak` : ''}
            </span>
          </div>
          <ChevronDown size={18} className={`text-text-muted transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
        </button>

        {progressOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={14} className="text-accent" />
                  <span className="text-xs text-text-muted">Lost</span>
                </div>
                <div className="text-xl font-bold text-accent">{weightLost.toFixed(1)} kg</div>
                <div className="text-xs text-text-muted">{progress.toFixed(0)}% to goal</div>
              </div>
              <div className="bg-bg rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={14} className="text-info" />
                  <span className="text-xs text-text-muted">Streak</span>
                </div>
                <div className="text-xl font-bold text-info">{streak} days</div>
                <div className="text-xs text-text-muted">{completedCount} this month</div>
              </div>
            </div>

            {/* Weight chart */}
            <div>
              <div className="text-xs text-text-muted mb-2">Weight (14 days)</div>
              <div className="h-36">
                {weightEntries.length > 0 ? (
                  <Line data={weightChartData} options={chartOptions} />
                ) : (
                  <div className="h-full flex items-center justify-center text-text-muted text-xs">Log weight to see trends</div>
                )}
              </div>
            </div>

            {/* Calorie chart */}
            <div>
              <div className="text-xs text-text-muted mb-2">Calories (14 days)</div>
              <div className="h-28">
                <Bar data={calorieChartData} options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 3500 } } }} />
              </div>
            </div>

            {/* Workout grid */}
            <div>
              <div className="text-xs text-text-muted mb-2">Workouts (30 days)</div>
              <div className="grid grid-cols-10 gap-1">
                {workoutDays.map((day, i) => (
                  <div key={i} title={day.date} className={`aspect-square rounded-sm ${day.hasWorkout ? 'bg-accent' : day.wasScheduled ? 'bg-danger/50' : 'bg-border'}`} />
                ))}
              </div>
            </div>

            {/* PRs */}
            {prList.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={14} className="text-warning" />
                  <span className="text-xs text-text-muted">Personal Records</span>
                </div>
                <div className="space-y-1">
                  {prList.slice(0, 5).map(pr => (
                    <div key={pr.name} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                      <span className="text-xs">{pr.name}</span>
                      <span className="text-xs font-medium text-accent">{pr.weight} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showWeightModal && <WeightModal onClose={() => setShowWeightModal(false)} />}
      {showMealLogger && <MealLogger onClose={() => setShowMealLogger(false)} />}
      {showWorkoutLogger && (
        <WorkoutLogger
          workout={todayTemplate}
          onClose={() => setShowWorkoutLogger(false)}
          onOpenCoach={onOpenCoach}
        />
      )}
    </div>
  );
}

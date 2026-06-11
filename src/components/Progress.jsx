import { useMemo, useState } from 'react';
import { EXERCISE_LIBRARY } from '../utils/dataSchemas';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { TrendingDown, Trophy, Flame, Calendar, Settings, ChevronDown, ChevronRight, Target } from 'lucide-react';
import { useWeightHistory } from '../hooks/useWeightHistory';
import { useUserProfile } from '../hooks/useUserProfile';
import { useWorkoutLogs, useWorkoutSchedule, useWorkoutTemplates } from '../hooks/useWorkoutLogs';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { format, subDays, parseISO, isWithinInterval, startOfDay } from 'date-fns';
import { getMetric } from '../utils/metrics';
import { getGoalProgress } from '../utils/goal';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import SecondaryMetricStrip from './SecondaryMetricStrip';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { color: '#1f1f1f' },
      ticks: { color: '#a1a1aa', font: { size: 10 } },
    },
    y: {
      grid: { color: '#1f1f1f' },
      ticks: { color: '#a1a1aa', font: { size: 10 } },
    },
  },
};

export default function Progress({ onNavigate }) {
  const { entries: weightEntries } = useWeightHistory();
  const { profile } = useUserProfile();
  const { getAllPRs } = useWorkoutLogs();
  const { schedule } = useWorkoutSchedule();
  const { templates } = useWorkoutTemplates();
  const { getDailyTotals } = useNutritionLogs();
  const [completedDays] = useLocalStorage('pump-completed-workouts', {});

  const { entries: measurementHistory } = useMeasurementHistory();
  const prs = getAllPRs();

  const metricData = { weightHistory: weightEntries, measurementHistory, prs };
  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: {} };
  const primaryMetric = getMetric(goal.primaryMetric);
  const primarySeries = primaryMetric.getSeries(profile, metricData);
  const primaryCurrent = primaryMetric.getCurrent(profile, metricData);
  const primaryTarget = primaryMetric.supportsTarget ? (goal.targets?.[goal.primaryMetric] || {}) : {};
  const primaryChange = (primaryCurrent != null && primarySeries.length >= 2)
    ? Math.round((primaryCurrent - primarySeries[0].value) * 10) / 10
    : null;
  const primaryProgress = (primaryMetric.supportsTarget && primaryTarget.value != null && primaryCurrent != null)
    ? getGoalProgress({ start: primarySeries.length ? primarySeries[0].value : primaryCurrent, current: primaryCurrent, target: primaryTarget.value })
    : { percent: null };
  const unitSuffix = primaryMetric.unit === '%' ? '' : ' ' + primaryMetric.unit;
  const last14Primary = primarySeries.slice(-14);
  const primaryChartData = {
    labels: last14Primary.map((p) => format(parseISO(p.date), 'MMM d')),
    datasets: [
      { label: primaryMetric.label, data: last14Primary.map((p) => p.value), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#22c55e' },
      ...(primaryTarget.value != null
        ? [{ label: 'Target', data: last14Primary.map(() => primaryTarget.value), borderColor: '#3b82f6', borderDash: [5, 5], pointRadius: 0 }]
        : []),
    ],
  };

  const calorieChartData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const totals = getDailyTotals(date);
      days.push({
        date: format(date, 'MMM d'),
        calories: totals.calories,
      });
    }

    const targetMid = (profile.calorieTarget.min + profile.calorieTarget.max) / 2;

    return {
      labels: days.map((d) => d.date),
      datasets: [
        {
          label: 'Calories',
          data: days.map((d) => d.calories),
          backgroundColor: days.map((d) => {
            if (d.calories === 0) return '#1f1f1f';
            if (d.calories < profile.calorieTarget.min) return '#3b82f6';
            if (d.calories <= profile.calorieTarget.max) return '#22c55e';
            return '#ef4444';
          }),
          borderRadius: 4,
        },
      ],
    };
  }, [getDailyTotals, profile.calorieTarget]);

  const prList = Object.entries(prs)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Map a workout-template key (e.g. "push", "bike", "shoulders") to a PR
  // category. Custom exercises don't have a category field, but they do live
  // inside a template — Coach naturally adds push exercises to the push
  // template etc. So if an exercise is in a template, we infer its category
  // from the template name. This means user-added exercises categorise
  // automatically with no extra config — they just need to be added via
  // Coach's UPDATE_TEMPLATE command (which Coach does by default).
  const templateToCategory = (key) => {
    const k = String(key || '').toLowerCase();
    if (k.includes('push') || k.includes('chest') || k.includes('shoulder')) return 'push';
    if (k.includes('pull') || k.includes('back') || k.includes('bicep')) return 'pull';
    if (k.includes('leg') || k.includes('quad') || k.includes('squat') || k.includes('glute') || k.includes('hamstring')) return 'legs';
    if (k.includes('core') || k.includes('abs') || k.includes('ab')) return 'core';
    if (k.includes('bike') || k.includes('cardio') || k.includes('skate') || k.includes('run') || k === 'active') return 'cardio';
    return null;
  };

  // Categorise PRs by: 1) hardcoded EXERCISE_LIBRARY, 2) custom-template
  // membership (auto-inferred), 3) fallback to "Other".
  const categorisedPRs = useMemo(() => {
    const lookup = Object.fromEntries(EXERCISE_LIBRARY.map((e) => [e.name, e.category]));

    // Overlay categories from user's workout templates — exercises Coach added
    // via UPDATE_TEMPLATE land here. Library entries take precedence (don't
    // overwrite known exercises with template-inferred categories).
    for (const [tmplKey, tmpl] of Object.entries(templates || {})) {
      const cat = templateToCategory(tmplKey);
      if (!cat) continue;
      for (const ex of tmpl?.exercises || []) {
        if (ex?.name && !lookup[ex.name]) lookup[ex.name] = cat;
      }
    }

    const groups = { push: [], pull: [], legs: [], core: [], cardio: [], other: [] };
    for (const pr of prList) {
      if (!Number.isFinite(Number(pr.weight)) || Number(pr.weight) <= 0) continue;
      const cat = lookup[pr.name] || 'other';
      (groups[cat] || groups.other).push(pr);
    }
    // Sort each group by weight DESC so "top 5" is the heaviest 5.
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => Number(b.weight) - Number(a.weight));
    }
    return groups;
  }, [prList, templates]);

  const CATEGORY_LABELS = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core', cardio: 'Cardio', other: 'Other' };
  const CATEGORY_ORDER = ['push', 'pull', 'legs', 'core', 'cardio', 'other'];
  const [expandedCats, setExpandedCats] = useState({});
  const toggleCat = (k) => setExpandedCats((s) => ({ ...s, [k]: !s[k] }));

  const workoutDays = useMemo(() => {
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      const daySchedule = schedule[date];
      const dayCompleted = completedDays[date];

      // Check if this day had a workout scheduled (not rest/family)
      const hasScheduledWorkout = daySchedule && (
        (daySchedule.lunch?.type && !['rest', 'family'].includes(daySchedule.lunch.type)) ||
        (daySchedule.evening?.type && !['rest', 'family'].includes(daySchedule.evening.type))
      );

      // Check if any session was completed
      const hasCompletedWorkout = dayCompleted?.lunch || dayCompleted?.evening;

      last30.push({
        date,
        hasWorkout: hasCompletedWorkout,
        wasScheduled: hasScheduledWorkout
      });
    }
    return last30;
  }, [completedDays, schedule]);

  const completedCount = useMemo(() => {
    return workoutDays.filter(d => d.hasWorkout).length;
  }, [workoutDays]);

  const streak = useMemo(() => {
    let count = 0;
    for (let i = workoutDays.length - 1; i >= 0; i--) {
      if (workoutDays[i].hasWorkout) count++;
      else if (count > 0) break;
    }
    return count;
  }, [workoutDays]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Progress</h1>
        <button
          onClick={() => onNavigate?.('settings')}
          className="p-2 bg-surface rounded-lg text-text-muted"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target size={18} className="text-accent" />
            <span className="text-sm text-text-muted">{primaryMetric.label}</span>
          </div>
          <div className="text-2xl font-bold text-accent">
            {primaryCurrent != null ? `${primaryCurrent}${unitSuffix}` : '—'}
          </div>
          <div className="text-xs text-text-muted">
            {primaryProgress.percent != null
              ? `${primaryProgress.percent}% to goal`
              : primaryChange != null
                ? `${primaryChange >= 0 ? '+' : ''}${primaryChange}${primaryMetric.unit === '%' ? '%' : primaryMetric.unit} since start`
                : 'Tracking'}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={18} className="text-info" />
            <span className="text-sm text-text-muted">Streak</span>
          </div>
          <div className="text-2xl font-bold text-info">{streak} days</div>
          <div className="text-xs text-text-muted">{completedCount} workouts this month</div>
        </div>
      </div>

      {/* Primary metric trend */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <TrendingDown size={18} className="text-accent" />
          {primaryMetric.label} Trend
        </h3>
        <div className="h-48">
          {primarySeries.length > 0 ? (
            <Line data={primaryChartData} options={chartOptions} />
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm text-center px-4">
              {goal.primaryMetric === 'leanmass'
                ? 'Log weight + body-fat measurements to see lean mass.'
                : `Log ${primaryMetric.label.toLowerCase()} data to see your trend.`}
            </div>
          )}
        </div>
      </div>

      {/* Other metrics at a glance */}
      <SecondaryMetricStrip profile={profile} data={metricData} />

      {/* Calorie Chart */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Flame size={18} className="text-warning" />
          Daily Calories (14 days)
        </h3>
        <div className="h-40">
          <Bar data={calorieChartData} options={{
            ...chartOptions,
            scales: {
              ...chartOptions.scales,
              y: {
                ...chartOptions.scales.y,
                min: 0,
                max: 3500,
              },
            },
          }} />
        </div>
        <div className="flex justify-center gap-4 mt-2 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-[#22c55e]" /> In range
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-[#3b82f6]" /> Under
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-[#ef4444]" /> Over
          </span>
        </div>
      </div>

      {/* Workout Calendar */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-info" />
          Workout Consistency (30 days)
        </h3>
        <div className="grid grid-cols-10 gap-1">
          {workoutDays.map((day, i) => (
            <div
              key={i}
              title={`${day.date}${day.hasWorkout ? ' ✓' : day.wasScheduled ? ' ✗' : ''}`}
              className={`aspect-square rounded-sm ${
                day.hasWorkout
                  ? 'bg-accent'
                  : day.wasScheduled
                    ? 'bg-danger/50'
                    : 'bg-border'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-center gap-4 mt-2 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-accent" /> Completed
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-danger/50" /> Missed
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-border" /> Rest
          </span>
        </div>
      </div>

      {/* PR List — categorised, top 5 per group with expand */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="font-medium mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-warning" />
          Personal Records
        </h3>
        {prList.length > 0 ? (
          <div className="space-y-3">
            {CATEGORY_ORDER.map((cat) => {
              const items = categorisedPRs[cat] || [];
              if (items.length === 0) return null;
              const isOpen = !!expandedCats[cat];
              const visible = isOpen ? items : items.slice(0, 5);
              return (
                <div key={cat}>
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full flex items-center justify-between text-xs text-text-muted hover:text-text py-1"
                  >
                    <span className="font-medium uppercase tracking-wide">
                      {CATEGORY_LABELS[cat]} <span className="opacity-60">({items.length})</span>
                    </span>
                    {items.length > 5 && (
                      isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                  </button>
                  <div className="mt-1">
                    {visible.map((pr) => (
                      <div
                        key={pr.name}
                        className="flex items-center justify-between py-1.5 border-b border-border last:border-0"
                      >
                        <span className="text-sm truncate mr-2">{pr.name}</span>
                        <div className="text-right shrink-0">
                          <span className="font-medium text-accent">{pr.weight} kg</span>
                          <span className="text-xs text-text-muted ml-2">
                            {format(parseISO(pr.date), 'MMM d')}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!isOpen && items.length > 5 && (
                      <button
                        onClick={() => toggleCat(cat)}
                        className="text-xs text-accent mt-1 hover:underline"
                      >
                        Show {items.length - 5} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Complete workouts to track PRs</p>
        )}
      </div>
    </div>
  );
}

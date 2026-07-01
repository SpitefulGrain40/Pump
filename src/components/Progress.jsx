import { useMemo } from 'react';
import { EXERCISE_LIBRARY } from '../utils/dataSchemas';
import { Line } from 'react-chartjs-2';
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
import { useWeightHistory } from '../hooks/useWeightHistory';
import { useUserProfile } from '../hooks/useUserProfile';
import { useWorkoutLogs, useWorkoutSchedule } from '../hooks/useWorkoutLogs';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { hasCycleTemplate } from '../utils/schedule';
import {
  getGoalConfig,
  buildBodyFatSeries,
  buildLeanMassSeries,
  buildWaistSeries,
  buildWeightSeries,
  forecastToTarget,
  calcWeeklyVolumes,
  workoutDailyHits,
  workoutScheduleConsistency,
  proteinDailyHits,
  calorieDailyHits,
  rollingConsistency,
  monthlyConsistencyChange,
  volumeLoadInRange,
  getExercisePRs,
} from '../utils/progressCalcs';
import CompositionBar from './progress/CompositionBar';
import ForecastChart from './progress/ForecastChart';
import ScoreRing from './progress/ScoreRing';
import InfoToggle from './progress/InfoToggle';
import ExpandableRow from './progress/ExpandableRow';
import SparklineSVG from './progress/SparklineSVG';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
);

const METRIC_COLORS = {
  bodyfat: '#60a5fa',
  leanmass: '#4ade80',
  weight: '#a1a1aa',
  waist: '#f472b6',
};

const METRIC_LABELS = {
  bodyfat: 'Body fat %',
  leanmass: 'Lean mass',
  weight: 'Weight',
  waist: 'Waist',
};

const METRIC_UNITS = {
  bodyfat: '%',
  leanmass: ' kg',
  weight: ' kg',
  waist: ' cm',
};

function SectionHeading({ label, infoColor, children }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">{label}</h2>
        <InfoToggle id={label} color={infoColor}>{children}</InfoToggle>
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface-light rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

export default function Progress() {
  const { entries: weightHistory } = useWeightHistory();
  const { profile } = useUserProfile();
  const { entries: measurementEntries } = useMeasurementHistory();
  const { meals: nutritionLogs } = useNutritionLogs();
  const { logs: workoutLogs } = useWorkoutLogs();
  const { schedule } = useWorkoutSchedule();
  const [completedDays] = useLocalStorage('pump-completed-workouts', {});

  const intent = profile?.goal?.intent || 'recomp';
  const goalConfig = useMemo(() => getGoalConfig(intent), [intent]);
  const targets = profile?.goal?.targets || {};

  // ── Build series ────────────────────────────────────────────────────────
  const bfSeries = useMemo(
    () => buildBodyFatSeries(measurementEntries, profile || {}),
    [measurementEntries, profile],
  );
  const leanSeries = useMemo(
    () => buildLeanMassSeries(weightHistory, measurementEntries, profile || {}),
    [weightHistory, measurementEntries, profile],
  );
  const waistSeries = useMemo(() => buildWaistSeries(measurementEntries), [measurementEntries]);
  const weightSeries = useMemo(() => buildWeightSeries(weightHistory), [weightHistory]);

  const seriesByMetric = { bodyfat: bfSeries, leanmass: leanSeries, waist: waistSeries, weight: weightSeries };

  // ── Latest values ───────────────────────────────────────────────────────
  const latest = (series) => series[series.length - 1]?.value ?? null;
  const first = (series) => series[0]?.value ?? null;
  const latestBF = latest(bfSeries);
  const latestLean = latest(leanSeries);
  const latestWeight = latest(weightSeries);

  // ── Composition card (lean/fat split + body-fat goal meter) ──────────────
  const bodyFatGoal = targets.bodyfat?.value ?? null;
  const leanFirst = first(leanSeries);
  const leanDeltaStr = (latestLean != null && leanFirst != null)
    ? `${latestLean - leanFirst >= 0 ? '+' : ''}${(latestLean - leanFirst).toFixed(1)} kg`
    : null;

  // ── Forecast (primary metric only — a single, meaningful y-axis) ─────────
  const primaryMetric = goalConfig.forecastMetrics[0];
  const primaryTarget = targets[primaryMetric]?.value ?? null;
  const primaryForecast = useMemo(
    () => primaryTarget ? forecastToTarget(seriesByMetric[primaryMetric], primaryTarget) : null,
    [bfSeries, leanSeries, weightSeries, primaryMetric, primaryTarget],
  );

  function buildProjected(series, forecast) {
    if (!forecast || !goalConfig.showForecastProjection) return null;
    const last = series[series.length - 1];
    if (!last) return null;
    const points = [];
    for (let d = 0; d <= 63; d += 7) {
      const date = new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
      points.push({ date, value: last.value + forecast.slope * d });
    }
    return points;
  }

  const forecastPrimary = {
    historical: seriesByMetric[primaryMetric].filter(
      (p) => new Date(p.date) >= new Date(Date.now() - 56 * 86400000),
    ),
    projected: buildProjected(seriesByMetric[primaryMetric], primaryForecast),
    color: METRIC_COLORS[primaryMetric],
    goalValue: primaryTarget,
    interceptDate: primaryForecast?.interceptDate ?? null,
    weeksToGoal: primaryForecast?.weeksAway ?? null,
  };

  const forecastUnit = primaryMetric === 'bodyfat' ? '%' : ' kg';
  const forecastGoalLabelText = primaryMetric === 'bodyfat'
    ? METRIC_LABELS[primaryMetric].replace('%', '').trim().toLowerCase()
    : METRIC_LABELS[primaryMetric].toLowerCase();
  const forecastGoalLabel = primaryTarget
    ? `${primaryTarget}${forecastUnit} ${forecastGoalLabelText}`
    : '';

  // Explain WHY there's no projection, when there isn't one.
  const recentPrimaryCount = seriesByMetric[primaryMetric].filter(
    (p) => new Date(p.date) >= new Date(Date.now() - 28 * 86400000),
  ).length;
  let noForecastReason = null;
  if (!goalConfig.showForecastProjection) {
    noForecastReason = 'Trend only — holding steady is the goal on maintain.';
  } else if (primaryTarget == null) {
    noForecastReason = `Set a ${forecastGoalLabelText} target in Settings to see your forecast.`;
  } else if (recentPrimaryCount < 3) {
    const need = 3 - recentPrimaryCount;
    noForecastReason = `Log ${need} more measurement${need > 1 ? 's' : ''} in the last month to project a forecast.`;
  } else if (!primaryForecast) {
    noForecastReason = 'Your recent trend is flat or moving away from your goal — no forecast yet.';
  }

  // ── Sub-metrics ───────────────────────────────────────────────────────────
  const subMetricNotes = { weight: goalConfig.weightRowNote };

  // ── Drivers: consistency scores (rolling 7-day tracked over 30 days) ─────
  const proteinMin = profile?.proteinTarget?.min ?? 0;
  const calorieTarget = profile?.calorieTarget ?? { min: null, max: null };
  const SPAN = 60; // history for the 30-day trend + month-over-month compare

  // Prefer measuring workouts against the schedule (completed ÷ scheduled, so
  // rest days don't count against you). Fall back to days-out-of-window only if
  // no schedule/cycle is configured at all.
  const scheduleConfigured = hasCycleTemplate(profile) || Object.keys(schedule || {}).length > 0;
  const workoutHits = useMemo(
    () => scheduleConfigured
      ? workoutScheduleConsistency(workoutLogs, completedDays, profile, schedule, SPAN)
      : workoutDailyHits(workoutLogs, SPAN),
    [workoutLogs, completedDays, profile, schedule, scheduleConfigured],
  );
  const proteinHits = useMemo(() => proteinDailyHits(nutritionLogs, proteinMin, SPAN), [nutritionLogs, proteinMin]);
  const calorieHits = useMemo(() => calorieDailyHits(nutritionLogs, calorieTarget, intent, SPAN), [nutritionLogs, calorieTarget, intent]);

  const workoutScore = useMemo(() => rollingConsistency(workoutHits), [workoutHits]);
  const proteinScore = useMemo(() => rollingConsistency(proteinHits), [proteinHits]);
  const calorieScore = useMemo(() => rollingConsistency(calorieHits), [calorieHits]);

  const workoutMonthly = useMemo(() => monthlyConsistencyChange(workoutHits), [workoutHits]);
  const proteinMonthly = useMemo(() => monthlyConsistencyChange(proteinHits), [proteinHits]);
  const calorieMonthly = useMemo(() => monthlyConsistencyChange(calorieHits), [calorieHits]);

  // Volume: last 30 days of load vs the previous 30 (progressive overload).
  const volNow = Date.now();
  const vol30 = useMemo(() => volumeLoadInRange(workoutLogs, volNow - 30 * 86400000, volNow + 86400000), [workoutLogs]);
  const volPrev30 = useMemo(() => volumeLoadInRange(workoutLogs, volNow - 60 * 86400000, volNow - 30 * 86400000), [workoutLogs]);
  const volumeChangePct = volPrev30 > 0 ? Math.round(((vol30 - volPrev30) / volPrev30) * 100) : null;
  // Ring fill: map −20%..+20% onto 0..100, 50 = no change.
  const volumeRingValue = Math.max(0, Math.min(100, 50 + (volumeChangePct ?? 0) * 2.5));
  const volumeDisplayVal = volumeChangePct != null ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}%` : '--';
  const weeklyVolumes = useMemo(() => calcWeeklyVolumes(workoutLogs, 8), [workoutLogs]);

  // ▲/▼ trend sub-labels. higherBetter=true for all these (more is better).
  const trendSub = (t) => (t == null ? null : `${t >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(t))}%`);
  const trendColor = (t) => (t == null || Math.round(t) === 0 ? '#71717a' : t > 0 ? '#4ade80' : '#f87171');
  const monthlyCaption = (m) => m
    ? `This month ${Math.round(m.currentPct)}% · ${m.delta >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(m.delta))}% vs last month`
    : 'A month-over-month change appears once you have two months of history.';

  const chartBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, beginAtZero: true },
    },
  };

  function buildVolumeLineData() {
    return {
      labels: weeklyVolumes.map((w) => w.weekStart),
      datasets: [{
        data: weeklyVolumes.map((w) => w.volume),
        borderColor: '#c084fc',
        backgroundColor: 'rgba(192,132,252,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#c084fc',
      }],
    };
  }

  // ── Records computation ───────────────────────────────────────────────────
  const exercisePRs = useMemo(
    () => getExercisePRs(workoutLogs, EXERCISE_LIBRARY),
    [workoutLogs],
  );

  const CATEGORY_ORDER = ['push', 'pull', 'legs', 'core', 'cardio', 'other'];

  const prsByCategory = useMemo(() => {
    const groups = {};
    Object.entries(exercisePRs).forEach(([name, pr]) => {
      const cat = pr.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ name, ...pr });
    });
    // Sort each category by PR weight descending
    Object.values(groups).forEach((arr) => arr.sort((a, b) => b.weight - a.weight));
    return groups;
  }, [exercisePRs]);

  return (
    <div className="p-4 space-y-6 pb-24">

      {/* Page header — consistent with the other tabs */}
      <div>
        <h1 className="text-2xl font-bold text-text">Progress</h1>
        <p className="text-text-muted text-sm">Outcomes, drivers, and records</p>
      </div>

      {/* ── Section 1: Outcomes ── */}
      <section>
        <SectionHeading label="Outcomes" infoColor="#60a5fa">
          <strong>Is it working?</strong> This section tracks your body composition over time.
          The bar shows your current lean mass vs fat mass split; the meter tracks body fat
          against your goal. The forecast projects your trend using linear regression on your
          recent measurements. Body fat % uses the US Navy formula from your measurement history.
        </SectionHeading>

        {/* Composition card */}
        <Card className="mb-3">
          <CompositionBar
            weight={latestWeight}
            leanMass={latestLean}
            bodyFatPct={latestBF}
            bodyFatGoal={bodyFatGoal}
            leanChange={leanDeltaStr}
          />
        </Card>

        {/* Forecast chart */}
        <Card className="mb-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-text">
              {goalConfig.showForecastProjection && primaryTarget
                ? `Forecast to ${forecastGoalLabel}`
                : 'Trend'}
            </span>
            <InfoToggle id="forecast" color="#60a5fa">
              The solid line is your actual {forecastGoalLabelText}; the dashed line projects it
              forward using linear regression on the last 4 weeks. The filled dot marks where your
              trend meets your goal. Needs at least 3 measurements in the last month — and only
              projects when your trend is actually heading toward your goal.
            </InfoToggle>
          </div>
          <ForecastChart
            primarySeries={forecastPrimary}
            showProjection={goalConfig.showForecastProjection}
            goalLabel={forecastGoalLabel}
            unit={forecastUnit}
            noForecastReason={noForecastReason}
          />
        </Card>

        {/* Sub-metric expandables */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-text">Sub-metrics</span>
            <InfoToggle id="sub-metrics" color="#a1a1aa">
              All weights in kg. Body fat % uses the US Navy formula from waist, neck, and hip
              measurements. Lean mass = weight × (1 − body fat%). Tap any row to see the last 8
              weeks — then tap a point on the chart for its exact date and value.
            </InfoToggle>
          </div>
          <div className="divide-y divide-border">
            {goalConfig.subMetricOrder.map((metric) => {
              const series = seriesByMetric[metric];
              const val = latest(series);
              const prev = series.length >= 2 ? series[series.length - 2]?.value : null;
              const change = val != null && prev != null ? val - prev : null;
              const positiveChange =
                metric === 'bodyfat' || metric === 'waist' ? change < 0 : change > 0;
              const displayChange = change != null
                ? `${change > 0 ? '+' : ''}${change.toFixed(1)}${METRIC_UNITS[metric]}`
                : null;
              const bfGoal = metric === 'bodyfat' ? targets.bodyfat?.value : null;

              return (
                <ExpandableRow
                  key={metric}
                  dotColor={METRIC_COLORS[metric]}
                  label={METRIC_LABELS[metric]}
                  value={val != null ? `${val.toFixed(1)}${METRIC_UNITS[metric]}` : '--'}
                  change={displayChange}
                  changePositive={change != null ? positiveChange : undefined}
                >
                  <SparklineSVG
                    data={series.slice(-56)}
                    color={METRIC_COLORS[metric]}
                    goalValue={bfGoal}
                    unit={METRIC_UNITS[metric]}
                    note={subMetricNotes[metric]}
                    height={56}
                  />
                </ExpandableRow>
              );
            })}
          </div>
        </Card>
      </section>

      {/* ── Section 2: Drivers ── */}
      <section>
        <SectionHeading label="Drivers" infoColor="#4ade80">
          <strong>How consistent am I?</strong> Each score is a rolling 7-day average, so it climbs
          as you string good days together and dips when you slip. The ▲/▼ under each ring is the
          change vs 30 days ago; expand a row for the 30-day trend and last month's change.
          <br /><br />
          <strong>Workouts:</strong> of your <em>scheduled</em> sessions, how many you completed (logged or ticked off). Rest days don't count against you, so following your plan = 100%.<br />
          <strong>Protein:</strong> days you hit your protein minimum ({proteinMin}g) — a day with no food logged counts as a miss.<br />
          <strong>{goalConfig.calorieRingLabel}:</strong> days your calories were {
            intent === 'cut' ? `under ${calorieTarget.max} kcal`
            : intent === 'bulk' ? `over ${calorieTarget.min} kcal`
            : `within ${calorieTarget.min}–${calorieTarget.max} kcal`
          } — unlogged days count as a miss.<br />
          <strong>Volume:</strong> total training load (sets × reps × kg) over the last 30 days vs the previous 30. The ring midpoint = no change.
        </SectionHeading>

        {/* Score rings */}
        <Card className="mb-3">
          <div className="grid grid-cols-4 gap-2">
            <ScoreRing
              value={workoutScore.score}
              max={100}
              displayValue={`${Math.round(workoutScore.score)}%`}
              label="Workouts"
              color="#4ade80"
              sub={trendSub(workoutScore.trend)}
              subColor={trendColor(workoutScore.trend)}
            />
            <ScoreRing
              value={proteinScore.score}
              max={100}
              displayValue={`${Math.round(proteinScore.score)}%`}
              label="Protein"
              color="#60a5fa"
              sub={trendSub(proteinScore.trend)}
              subColor={trendColor(proteinScore.trend)}
            />
            <ScoreRing
              value={calorieScore.score}
              max={100}
              displayValue={`${Math.round(calorieScore.score)}%`}
              label={goalConfig.calorieRingLabel}
              color={goalConfig.calorieRingColor}
              sub={trendSub(calorieScore.trend)}
              subColor={trendColor(calorieScore.trend)}
            />
            <ScoreRing
              value={volumeRingValue}
              max={100}
              displayValue={volumeDisplayVal}
              label="Volume"
              color="#c084fc"
              sub={volumeChangePct != null ? 'vs prev 30d' : null}
            />
          </div>
        </Card>

        {/* Driver expandables */}
        <Card>
          <div className="text-sm font-medium text-text mb-2">Consistency trend — last 30 days</div>
          <div className="divide-y divide-border">

            {/* Workouts */}
            <ExpandableRow
              dotColor="#4ade80"
              label="Workouts"
              value={`${Math.round(workoutScore.score)}%`}
              change={trendSub(workoutScore.trend)}
              changePositive={workoutScore.trend != null ? workoutScore.trend >= 0 : undefined}
            >
              <SparklineSVG data={workoutScore.series} color="#4ade80" unit="%" height={56} />
              <p className="text-[10px] text-text-muted mt-1">{monthlyCaption(workoutMonthly)}</p>
            </ExpandableRow>

            {/* Protein */}
            <ExpandableRow
              dotColor="#60a5fa"
              label="Protein"
              value={`${Math.round(proteinScore.score)}%`}
              change={trendSub(proteinScore.trend)}
              changePositive={proteinScore.trend != null ? proteinScore.trend >= 0 : undefined}
            >
              <SparklineSVG data={proteinScore.series} color="#60a5fa" unit="%" height={56} />
              <p className="text-[10px] text-text-muted mt-1">{monthlyCaption(proteinMonthly)}</p>
            </ExpandableRow>

            {/* Calories */}
            <ExpandableRow
              dotColor={goalConfig.calorieRingColor}
              label={goalConfig.calorieRingLabel}
              value={`${Math.round(calorieScore.score)}%`}
              change={trendSub(calorieScore.trend)}
              changePositive={calorieScore.trend != null ? calorieScore.trend >= 0 : undefined}
            >
              <SparklineSVG data={calorieScore.series} color={goalConfig.calorieRingColor} unit="%" height={56} />
              <p className="text-[10px] text-text-muted mt-1">{monthlyCaption(calorieMonthly)}</p>
            </ExpandableRow>

            {/* Volume */}
            <ExpandableRow
              dotColor="#c084fc"
              label="Volume load"
              value={vol30.toLocaleString() + ' kg'}
              change={volumeChangePct != null ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}%` : undefined}
              changePositive={volumeChangePct != null ? volumeChangePct > 0 : undefined}
            >
              <div style={{ height: 60 }}>
                <Line
                  data={buildVolumeLineData()}
                  options={{
                    ...chartBarOptions,
                    scales: {
                      x: { display: false },
                      y: { display: false },
                    },
                  }}
                />
              </div>
              <p className="text-[10px] text-text-muted mt-1">Weekly volume load (sets × reps × kg) over 8 weeks. Last 30 days: {vol30.toLocaleString()} kg vs {volPrev30.toLocaleString()} kg previously.</p>
            </ExpandableRow>

          </div>
        </Card>
      </section>

      {/* ── Section 3: Records ── */}
      <section>
        <SectionHeading label="Records" infoColor="#fbbf24">
          <strong>How strong am I?</strong> Personal records from your completed workout logs.
          <br /><br />
          <strong>PR weight:</strong> the heaviest set you've logged for each exercise.<br />
          <strong>Est. 1RM:</strong> estimated one-rep maximum using the Epley formula
          (weight × (1 + reps ÷ 30)). Not shown when the PR was a single rep — that weight
          IS your 1RM.
        </SectionHeading>

        <Card>
          {CATEGORY_ORDER.filter((cat) => prsByCategory[cat]?.length > 0).map((cat) => (
            <div key={cat} className="mb-4 last:mb-0">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 capitalize">
                {cat}
              </div>
              <div className="space-y-2">
                {prsByCategory[cat].map((pr) => (
                  <div key={pr.name} className="flex items-center justify-between">
                    <span className="text-sm text-text">{pr.name}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-green-400">{pr.weight} kg</span>
                      {pr.estimatedOneRM && (
                        <span className="text-xs text-text-muted ml-2">
                          est. 1RM {pr.estimatedOneRM.toFixed(0)} kg
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(prsByCategory).length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              No records yet — complete a workout to see your PRs here.
            </p>
          )}
        </Card>
      </section>

    </div>
  );
}

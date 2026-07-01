import { useMemo } from 'react';
import { EXERCISE_LIBRARY } from '../utils/dataSchemas';
import { Bar, Line } from 'react-chartjs-2';
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
import { useWorkoutLogs } from '../hooks/useWorkoutLogs';
import { useNutritionLogs } from '../hooks/useNutritionLogs';
import { useMeasurementHistory } from '../hooks/useMeasurementHistory';
import {
  getGoalConfig,
  buildBodyFatSeries,
  buildLeanMassSeries,
  buildWaistSeries,
  buildWeightSeries,
  forecastToTarget,
  calcWeeklyVolumes,
  calcWorkoutAdherence,
  calcProteinAdherence,
  calcCalorieAdherence,
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

  // ── Drivers computation ──────────────────────────────────────────────────
  const workoutAdherence = useMemo(
    () => calcWorkoutAdherence(workoutLogs, 7),
    [workoutLogs],
  );

  const proteinMin = profile?.proteinTarget?.min ?? 0;
  const proteinAdherence = useMemo(
    () => calcProteinAdherence(nutritionLogs, proteinMin, 7),
    [nutritionLogs, proteinMin],
  );

  const calorieTarget = profile?.calorieTarget ?? { min: null, max: null };
  const calorieAdherence = useMemo(
    () => calcCalorieAdherence(nutritionLogs, calorieTarget, 7, intent),
    [nutritionLogs, calorieTarget, intent],
  );

  // 30-day versions power the expandable detail charts (a week is too short to
  // read a trend); the rings above stay on the 7-day snapshot.
  const workoutAdherence30 = useMemo(() => calcWorkoutAdherence(workoutLogs, 30), [workoutLogs]);
  const proteinAdherence30 = useMemo(
    () => calcProteinAdherence(nutritionLogs, proteinMin, 30),
    [nutritionLogs, proteinMin],
  );
  const calorieAdherence30 = useMemo(
    () => calcCalorieAdherence(nutritionLogs, calorieTarget, 30, intent),
    [nutritionLogs, calorieTarget, intent],
  );

  const weeklyVolumes = useMemo(() => calcWeeklyVolumes(workoutLogs, 8), [workoutLogs]);
  const thisWeekVol = weeklyVolumes[weeklyVolumes.length - 1]?.volume ?? 0;
  const lastWeekVol = weeklyVolumes[weeklyVolumes.length - 2]?.volume ?? 0;
  const volumeChangePct = lastWeekVol > 0
    ? Math.round(((thisWeekVol - lastWeekVol) / lastWeekVol) * 100)
    : null;

  // Volume ring: treat % change as a score. +10% = full ring. cap at ±10%.
  const volumeRingValue = Math.max(0, Math.min(10, (volumeChangePct ?? 0) + 5));
  const volumeDisplayVal = volumeChangePct != null
    ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}%`
    : '--';

  const chartBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, beginAtZero: true },
    },
  };

  function buildProteinBars() {
    const results = [...proteinAdherence30.results].reverse();
    return {
      labels: results.map((r) => r.date),
      datasets: [{
        data: results.map((r) => r.value),
        backgroundColor: results.map((r) => r.hit ? '#60a5fa' : '#78350f'),
        borderRadius: 3,
      }],
    };
  }

  function buildCalorieBars() {
    const results = [...calorieAdherence30.results].reverse();
    return {
      labels: results.map((r) => r.date),
      datasets: [{
        data: results.map((r) => r.value),
        backgroundColor: results.map((r) => r.hit ? '#4ade80' : '#7f1d1d'),
        borderRadius: 3,
      }],
    };
  }

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
          <strong>What's making it happen?</strong> The four habits that drive your results. Each
          ring scores the <strong>last 7 days</strong>; expand a row for the last 30.
          <br /><br />
          <strong>Workouts:</strong> days you completed a logged session — full ring = 7/7.<br />
          <strong>Protein:</strong> days you hit your protein minimum ({proteinMin}g), of the days you logged food — full ring = 7/7.<br />
          <strong>{goalConfig.calorieRingLabel}:</strong> {
            intent === 'cut' ? `days under your max calorie target (${calorieTarget.max} kcal)`
            : intent === 'bulk' ? `days hitting your calorie minimum (${calorieTarget.min} kcal)`
            : `days within your calorie range (${calorieTarget.min}–${calorieTarget.max} kcal)`
          } — full ring = 7/7.<br />
          <strong>Volume:</strong> this week's training volume (sets × reps × kg) vs last week. Full ring = +10% or more; the midpoint = no change.
        </SectionHeading>

        {/* Score rings */}
        <Card className="mb-3">
          <div className="grid grid-cols-4 gap-2">
            <ScoreRing
              value={workoutAdherence.daysHit}
              max={7}
              displayValue={`${workoutAdherence.daysHit}/7`}
              label="Workouts"
              color="#4ade80"
            />
            <ScoreRing
              value={proteinAdherence.daysHit}
              max={7}
              displayValue={`${proteinAdherence.daysHit}/7`}
              label="Protein"
              color="#60a5fa"
            />
            <ScoreRing
              value={calorieAdherence.daysHit}
              max={7}
              displayValue={`${calorieAdherence.daysHit}/7`}
              label={goalConfig.calorieRingLabel}
              color={goalConfig.calorieRingColor}
            />
            <ScoreRing
              value={volumeRingValue}
              max={10}
              displayValue={volumeDisplayVal}
              label="Volume"
              color="#c084fc"
            />
          </div>
        </Card>

        {/* Driver expandables */}
        <Card>
          <div className="text-sm font-medium text-text mb-2">Detail — last 30 days</div>
          <div className="divide-y divide-border">

            {/* Workouts */}
            <ExpandableRow
              dotColor="#4ade80"
              label="Workouts"
              value={`${workoutAdherence30.daysHit}/30 days`}
            >
              {/* 30-day dot grid */}
              <div className="flex flex-wrap gap-1 py-1">
                {workoutAdherence30.results.map((r) => (
                  <span
                    key={r.date}
                    className="w-3 h-3 rounded-sm"
                    style={{ background: r.completed ? '#4ade80' : '#2a2a2a' }}
                    title={r.date}
                  />
                ))}
              </div>
            </ExpandableRow>

            {/* Protein */}
            <ExpandableRow
              dotColor="#60a5fa"
              label="Protein"
              value={`${proteinAdherence30.daysHit}/30 days`}
            >
              <div style={{ height: 60 }}>
                <Bar data={buildProteinBars()} options={chartBarOptions} />
              </div>
              <p className="text-[10px] text-text-muted mt-1">Blue = hit target ({proteinMin}g+), amber = missed · last 30 days</p>
            </ExpandableRow>

            {/* Calories */}
            <ExpandableRow
              dotColor={goalConfig.calorieRingColor}
              label={goalConfig.calorieRingLabel}
              value={`${calorieAdherence30.daysHit}/30 days`}
            >
              <div style={{ height: 60 }}>
                <Bar data={buildCalorieBars()} options={chartBarOptions} />
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                {intent === 'cut'
                  ? `Green = under ${calorieTarget.max} kcal, red = over`
                  : intent === 'bulk'
                  ? `Green = over ${calorieTarget.min} kcal, red = under`
                  : `Green = within range, red = outside`}
              </p>
            </ExpandableRow>

            {/* Volume */}
            <ExpandableRow
              dotColor="#c084fc"
              label="Volume load"
              value={thisWeekVol.toLocaleString() + ' kg'}
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
              <p className="text-[10px] text-text-muted mt-1">Weekly volume load (sets × reps × kg). Rising trend = progressive overload.</p>
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

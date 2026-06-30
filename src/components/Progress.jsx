import { useMemo, useState } from 'react';
import { format, subWeeks } from 'date-fns';
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
import CompositionRing from './progress/CompositionRing';
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
  const { logs: workoutLogs, prs } = useWorkoutLogs();

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

  // ── Composition ring ────────────────────────────────────────────────────
  const bfPct = latestBF ?? 0;

  // Goal-adaptive arc metric/value lookup. CompositionRing is fundamentally a
  // 0-100% donut, so metrics without a natural 0-100 percentage (weight,
  // lean mass) fall back to using body-fat % to drive the ring fill — only
  // the arc colours/labels (and the stat rows below) change per intent.
  const heroMetricValue = (metric) =>
    metric === 'bodyfat' ? latestBF
    : metric === 'leanmass' ? latestLean
    : metric === 'weight' ? latestWeight
    : null;
  const heroMetricDisplay = (metric, val) =>
    val == null ? '--'
    : metric === 'bodyfat' ? `${val.toFixed(1)}%`
    : `${val.toFixed(1)} kg`;

  const [primaryArcDef, secondaryArcDef] = goalConfig.heroArcs;

  const centerValue =
    goalConfig.centerLabel === 'bodyfat' ? `${latestBF?.toFixed(1) ?? '--'}%`
    : goalConfig.centerLabel === 'leanmass' ? `${latestLean?.toFixed(1) ?? '--'} kg`
    : `${latestWeight?.toFixed(1) ?? '--'} kg`;

  const centerSublabel =
    goalConfig.centerLabel === 'bodyfat' ? 'body fat'
    : goalConfig.centerLabel === 'leanmass' ? 'lean mass'
    : 'weight';

  function heroStat(arcDef) {
    const series = seriesByMetric[arcDef.metric];
    const val = heroMetricValue(arcDef.metric);
    const firstVal = first(series);
    const unit = arcDef.metric === 'bodyfat' ? '%' : ' kg';
    // Lower is "positive" for body fat (and waist), higher is "positive" for lean mass/weight.
    const lowerIsBetter = arcDef.metric === 'bodyfat';
    return {
      label: arcDef.label,
      value: heroMetricDisplay(arcDef.metric, val),
      change: val != null && firstVal != null
        ? `${(val - firstVal > 0 ? '+' : '')}${(val - firstVal).toFixed(1)}${unit}`
        : null,
      positive: val != null && firstVal != null
        ? (lowerIsBetter ? val <= firstVal : val >= firstVal)
        : false,
    };
  }

  const ringStats = [heroStat(primaryArcDef), heroStat(secondaryArcDef)];

  // ── Forecast ─────────────────────────────────────────────────────────────
  const [primaryMetric, secondaryMetric] = goalConfig.forecastMetrics;
  const primaryTarget = targets[primaryMetric]?.value ?? null;
  const secondaryTarget = targets[secondaryMetric]?.value ?? null;
  const primaryForecast = useMemo(
    () => primaryTarget ? forecastToTarget(seriesByMetric[primaryMetric], primaryTarget) : null,
    [bfSeries, leanSeries, weightSeries, primaryMetric, primaryTarget],
  );
  const secondaryForecast = useMemo(
    () => secondaryTarget ? forecastToTarget(seriesByMetric[secondaryMetric], secondaryTarget) : null,
    [bfSeries, leanSeries, weightSeries, secondaryMetric, secondaryTarget],
  );

  // Project forward using regression slope for 9 weeks
  function buildProjected(series, forecast) {
    if (!forecast || !goalConfig.showForecastProjection) return null;
    const last = series[series.length - 1];
    if (!last) return null;
    const points = [];
    for (let d = 0; d <= 63; d += 7) {
      const date = new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
      const value = last.value + forecast.slope * d;
      points.push({ date, value });
    }
    return points;
  }

  const primaryProjected = buildProjected(seriesByMetric[primaryMetric], primaryForecast);
  const secondaryProjected = buildProjected(seriesByMetric[secondaryMetric], secondaryForecast);

  const forecastPrimary = {
    historical: seriesByMetric[primaryMetric].filter(
      (p) => new Date(p.date) >= new Date(Date.now() - 56 * 86400000),
    ),
    projected: primaryProjected,
    color: METRIC_COLORS[primaryMetric],
    goalValue: primaryTarget,
    interceptDate: primaryForecast?.interceptDate ?? null,
    weeksToGoal: primaryForecast?.weeksAway ?? null,
  };

  const forecastSecondary = secondaryMetric ? {
    historical: seriesByMetric[secondaryMetric].filter(
      (p) => new Date(p.date) >= new Date(Date.now() - 56 * 86400000),
    ),
    projected: secondaryProjected,
    color: METRIC_COLORS[secondaryMetric],
    goalValue: secondaryTarget,
    interceptDate: secondaryForecast?.interceptDate ?? null,
    weeksToGoal: secondaryForecast?.weeksAway ?? null,
  } : undefined;

  const forecastGoalUnit = primaryMetric === 'bodyfat' ? '' : METRIC_UNITS[primaryMetric];
  const forecastGoalLabelText = primaryMetric === 'bodyfat'
    ? METRIC_LABELS[primaryMetric].replace('%', '').trim().toLowerCase()
    : METRIC_LABELS[primaryMetric].toLowerCase();
  const forecastGoalLabel = primaryTarget
    ? `${primaryTarget}${primaryMetric === 'bodyfat' ? '%' : forecastGoalUnit} ${forecastGoalLabelText}`
    : '';

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
    const results = proteinAdherence.results.reverse();
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
    const results = calorieAdherence.results.reverse();
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

      {/* ── Section 1: Outcomes ── */}
      <section>
        <SectionHeading label="Outcomes" infoColor="#60a5fa">
          <strong>Is it working?</strong> This section tracks your body composition over time.
          The ring shows your current lean mass vs body fat split. The forecast projects your
          trend to your goal using linear regression on the last 4 weeks of data.
          Body fat % uses the US Navy formula from your measurement history.
        </SectionHeading>

        {/* Composition ring */}
        <Card className="mb-3">
          <CompositionRing
            primaryArc={{ pct: bfPct, color: primaryArcDef.color, label: primaryArcDef.label }}
            secondaryArc={{ color: secondaryArcDef.color, label: secondaryArcDef.label }}
            centerValue={centerValue}
            centerSublabel={centerSublabel}
            stats={ringStats}
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
              The dashed lines are projections based on your last 4 weeks of data using linear
              regression. The filled circle shows where your trend meets your goal. Needs at least
              4 data points in the last 28 days to project. Solid lines = actual data;
              dashed = projection.
            </InfoToggle>
          </div>
          <ForecastChart
            primarySeries={forecastPrimary}
            secondarySeries={forecastSecondary}
            showProjection={goalConfig.showForecastProjection}
            goalLabel={forecastGoalLabel}
          />
        </Card>

        {/* Sub-metric expandables */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-text">Sub-metrics</span>
            <InfoToggle id="sub-metrics" color="#a1a1aa">
              All weights in kg. Body fat % uses the US Navy formula from waist, neck, and hip
              measurements. Lean mass = weight × (1 − body fat%). Tap any row to see the trend
              for the last 8 weeks.
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
                    note={subMetricNotes[metric]}
                    height={48}
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
          <strong>What's making it happen?</strong> Four metrics that drive your results.
          <br /><br />
          <strong>Workouts:</strong> days you completed a logged session in the last 7 days.<br />
          <strong>Protein:</strong> days you hit your minimum protein target ({proteinMin}g).<br />
          <strong>{goalConfig.calorieRingLabel}:</strong> {
            intent === 'cut' ? `days under your max calorie target (${calorieTarget.max} kcal).`
            : intent === 'bulk' ? `days hitting your calorie minimum (${calorieTarget.min} kcal).`
            : `days within your calorie range (${calorieTarget.min}–${calorieTarget.max} kcal).`
          }<br />
          <strong>Volume:</strong> weekly training volume load (sets × reps × kg) vs last week.
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
          <div className="text-sm font-medium text-text mb-2">Detail — last 7 days</div>
          <div className="divide-y divide-border">

            {/* Workouts */}
            <ExpandableRow
              dotColor="#4ade80"
              label="Workouts"
              value={`${workoutAdherence.daysHit}/7 days`}
            >
              {/* 7-day dot grid */}
              <div className="flex flex-wrap gap-1 py-1">
                {workoutAdherence.results.map((r) => (
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
              value={`${proteinAdherence.daysHit}/7 days`}
            >
              <div style={{ height: 60 }}>
                <Bar data={buildProteinBars()} options={chartBarOptions} />
              </div>
              <p className="text-[10px] text-text-muted mt-1">Blue = hit target ({proteinMin}g+), amber = missed</p>
            </ExpandableRow>

            {/* Calories */}
            <ExpandableRow
              dotColor={goalConfig.calorieRingColor}
              label={goalConfig.calorieRingLabel}
              value={`${calorieAdherence.daysHit}/7 days`}
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

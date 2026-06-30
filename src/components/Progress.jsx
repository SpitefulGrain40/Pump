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
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{label}</h2>
        <InfoToggle id={label} color={infoColor}>{children}</InfoToggle>
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ background: '#1a1a1a' }}>
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
  const [primaryArcDef, secondaryArcDef] = goalConfig.heroArcs;
  const primaryPct =
    primaryArcDef.metric === 'bodyfat' ? latestBF
    : primaryArcDef.metric === 'weight' && latestBF ? latestBF  // for cut: weight arc = lean proportion
    : null;
  // Ring always shows lean/fat split — primary arc is body fat portion regardless of intent
  const bfPct = latestBF ?? 0;

  const centerValue =
    goalConfig.centerLabel === 'bodyfat' ? `${latestBF?.toFixed(1) ?? '--'}%`
    : goalConfig.centerLabel === 'leanmass' ? `${latestLean?.toFixed(1) ?? '--'} kg`
    : `${latestWeight?.toFixed(1) ?? '--'} kg`;

  const centerSublabel =
    goalConfig.centerLabel === 'bodyfat' ? 'body fat'
    : goalConfig.centerLabel === 'leanmass' ? 'lean mass'
    : 'weight';

  const ringStats = [
    {
      label: 'Lean mass',
      value: latestLean ? `${latestLean.toFixed(1)} kg` : '--',
      change: latestLean && first(leanSeries) ? `${(latestLean - first(leanSeries) > 0 ? '+' : '')}${(latestLean - first(leanSeries)).toFixed(1)} kg` : null,
      positive: latestLean && first(leanSeries) ? latestLean >= first(leanSeries) : false,
    },
    {
      label: 'Body fat',
      value: latestBF ? `${latestBF.toFixed(1)}%` : '--',
      change: latestBF && first(bfSeries) ? `${(latestBF - first(bfSeries) > 0 ? '+' : '')}${(latestBF - first(bfSeries)).toFixed(1)}%` : null,
      positive: latestBF && first(bfSeries) ? latestBF <= first(bfSeries) : false,
    },
  ];

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

  const forecastGoalLabel = primaryTarget
    ? `${primaryTarget}${METRIC_UNITS[primaryMetric]} ${METRIC_LABELS[primaryMetric].toLowerCase()}`
    : '';

  // ── Sub-metrics ───────────────────────────────────────────────────────────
  const subMetricNotes = { weight: goalConfig.weightRowNote };

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
            primaryArc={{ pct: bfPct, color: METRIC_COLORS.bodyfat, label: 'Body fat' }}
            secondaryArc={{ color: METRIC_COLORS.leanmass, label: 'Lean mass' }}
            centerValue={centerValue}
            centerSublabel={centerSublabel}
            stats={ringStats}
          />
        </Card>

        {/* Forecast chart */}
        <Card className="mb-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-zinc-300">
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
            <span className="text-sm font-medium text-zinc-300">Sub-metrics</span>
            <InfoToggle id="sub-metrics" color="#a1a1aa">
              All weights in kg. Body fat % uses the US Navy formula from waist, neck, and hip
              measurements. Lean mass = weight × (1 − body fat%). Tap any row to see the trend
              for the last 8 weeks.
            </InfoToggle>
          </div>
          <div className="divide-y divide-zinc-800">
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

      {/* ── Section 2 placeholder — added in Task 7 ── */}
      {/* ── Section 3 placeholder — added in Task 8 ── */}

    </div>
  );
}

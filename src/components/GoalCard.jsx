import { Line } from 'react-chartjs-2';
import { differenceInDays, parseISO, format } from 'date-fns';
import { Target } from 'lucide-react';
import { getMetric } from '../utils/metrics';
import { getGoalProgress } from '../utils/goal';
import { INTENT_LABELS } from '../utils/goal';

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
    y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 10 } } },
  },
};

export default function GoalCard({ profile, data }) {
  const goal = profile.goal || { intent: 'maintain', primaryMetric: 'weight', targets: {} };
  const metric = getMetric(goal.primaryMetric);
  const current = metric.getCurrent(profile, data);
  const series = metric.getSeries(profile, data);
  const target = metric.supportsTarget ? goal.targets?.[goal.primaryMetric] : null;
  const targetValue = target?.value ?? null;
  const targetDate = target?.date ?? null;

  const last = series.slice(-14);
  const delta = last.length >= 2 ? last[last.length - 1].value - last[0].value : null;
  // Is the trend moving the way this goal wants? (bulk wants weight up; cut/recomp
  // and bodyfat/waist want down.) Drives the delta colour so "good" is always green.
  const goodDir = metric.goodDirection ? metric.goodDirection(goal.intent) : 'down';
  const deltaIsGood = delta == null ? null : (goodDir === 'up' ? delta >= 0 : delta <= 0);

  // getGoalProgress is trivial arithmetic — no memoization needed.
  const progress = (!metric.supportsTarget || targetValue == null)
    ? { percent: null }
    : getGoalProgress({ start: series.length ? series[0].value : current, current, target: targetValue });

  const daysLeft = targetDate ? differenceInDays(parseISO(targetDate), new Date()) : null;

  const chartData = {
    labels: last.map(p => format(parseISO(p.date), 'MMM d')),
    datasets: [
      {
        label: metric.label,
        data: last.map(p => p.value),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#22c55e',
      },
      ...(targetValue != null
        ? [{ label: 'Target', data: last.map(() => targetValue), borderColor: '#3b82f6', borderDash: [5, 5], pointRadius: 0 }]
        : []),
    ],
  };

  const fmt = (v) => (v == null ? '—' : `${v}${metric.unit === '%' ? '' : ' '}${metric.unit}`);

  return (
    <div className="bg-surface rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-accent">
          {INTENT_LABELS[goal.intent]} · {metric.label}
        </span>
        {metric.supportsTarget && targetValue != null && (
          <span className="text-xs text-text-muted flex items-center gap-1">
            <Target size={12} /> {fmt(targetValue)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-accent">{fmt(current)}</span>
        {delta != null && (
          <span className={`text-sm ${deltaIsGood ? 'text-accent' : 'text-warning'}`}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 10) / 10)}{metric.unit === '%' ? '' : metric.unit} / 14d
          </span>
        )}
      </div>

      <div className="h-40 mt-3">
        {series.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="h-full flex items-center justify-center text-text-muted text-sm text-center px-4">
            No {metric.label.toLowerCase()} history yet — log some to see your trend.
          </div>
        )}
      </div>

      {metric.supportsTarget && targetValue != null && progress.percent != null && (
        <div className="mt-3">
          <div className="w-full bg-border rounded-full h-2">
            <div className="bg-accent h-2 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-text-muted mt-2">
            <span>{progress.percent}% to goal</span>
            {daysLeft != null && <span>{daysLeft > 0 ? `${daysLeft} days left` : 'target date passed'}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { format, parseISO } from 'date-fns';
import { METRICS, getMetric, alignSeriesWithReference } from '../utils/metrics';

const miniOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 9 } } },
    y: { grid: { color: '#1f1f1f' }, ticks: { color: '#a1a1aa', font: { size: 9 } } },
  },
};

export default function SecondaryMetricStrip({ profile, data }) {
  const goal = profile.goal || { primaryMetric: 'weight' };
  const [expanded, setExpanded] = useState(null);

  const secondaryKeys = Object.keys(METRICS).filter(k => k !== goal.primaryMetric);

  const fmt = (metric, v) => (v == null ? '—' : `${v}${metric.unit === '%' ? '' : ' '}${metric.unit}`);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {secondaryKeys.map(key => {
          const metric = getMetric(key);
          const current = metric.getCurrent(profile, data);
          const isOpen = expanded === key;
          return (
            <button
              key={key}
              onClick={() => setExpanded(isOpen ? null : key)}
              className={`bg-surface rounded-lg p-3 text-center border ${isOpen ? 'border-accent' : 'border-transparent'}`}
            >
              <div className="text-sm font-semibold">{fmt(metric, current)}</div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted">{metric.label}</div>
            </button>
          );
        })}
      </div>

      {expanded && (() => {
        const metric = getMetric(expanded);
        const series = metric.getSeries(profile, data).slice(-14);
        // Manual/DEXA readings (bodyfat only) as markers alongside the Navy
        // trend line — see metrics.js's getManualSeries.
        const manualSeries = metric.getManualSeries ? metric.getManualSeries(profile, data).slice(-14) : [];
        const { dates, seriesData, referenceData } = alignSeriesWithReference(series, manualSeries);
        const chartData = {
          labels: dates.map(d => format(parseISO(d), 'MMM d')),
          datasets: [
            {
              label: metric.label,
              data: seriesData,
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 2,
              spanGaps: true,
            },
            ...(referenceData
              ? [{
                  label: 'DEXA / manual',
                  data: referenceData,
                  borderColor: '#a855f7',
                  backgroundColor: '#a855f7',
                  showLine: false,
                  pointStyle: 'rectRot',
                  pointRadius: 5,
                }]
              : []),
          ],
        };
        return (
          <div className="bg-surface rounded-lg p-3">
            <div className="text-xs text-text-muted mb-2">{metric.label} trend</div>
            <div className="h-32">
              {series.length > 0
                ? <Line data={chartData} options={miniOptions} />
                : <div className="h-full flex items-center justify-center text-text-muted text-xs text-center px-2">No {metric.label.toLowerCase()} history yet.</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

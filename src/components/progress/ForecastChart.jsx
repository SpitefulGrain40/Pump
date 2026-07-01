import { format } from 'date-fns';

const W = 320;
const H = 132;
const PAD = { top: 12, right: 12, bottom: 30, left: 30 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

function toPoints(series, minDate, maxDate, minVal, maxVal) {
  return series
    .filter((p) => p.value != null)
    .map((p) => {
      const t = new Date(p.date).getTime();
      const x = PAD.left + ((t - minDate) / (maxDate - minDate)) * CHART_W;
      const y = PAD.top + (1 - (p.value - minVal) / (maxVal - minVal)) * CHART_H;
      return { x, y };
    });
}

function polyline(pts) {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// unit: '%' or ' kg' — used for axis + goal labels.
// noForecastReason: null when projecting, else a short message to explain why.
export default function ForecastChart({
  primarySeries,
  showProjection,
  goalLabel,
  unit = '',
  noForecastReason,
}) {
  if (!primarySeries?.historical?.length) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        No measurements in the last 8 weeks — log one to start your trend.
      </div>
    );
  }

  const fmt = (v) => (unit === '%' ? `${v.toFixed(1)}%` : `${v.toFixed(1)}${unit}`);

  const now = Date.now();
  const minDate = now - 56 * 86400000;
  const maxDate = now + 63 * 86400000;

  const s = primarySeries;
  const projecting = showProjection && s.projected && s.projected.length > 1;

  const allVals = [
    ...(s.historical || []).map((p) => p.value),
    ...(projecting ? s.projected.map((p) => p.value) : []),
    s.goalValue,
  ].filter((v) => v != null);

  if (allVals.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        Not enough data yet — keep logging.
      </div>
    );
  }

  let minVal = Math.min(...allVals) * 0.97;
  let maxVal = Math.max(...allVals) * 1.03;
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }

  const xNow = PAD.left + ((now - minDate) / (maxDate - minDate)) * CHART_W;
  const yOf = (v) => PAD.top + (1 - (v - minVal) / (maxVal - minVal)) * CHART_H;

  const histPts = toPoints(s.historical, minDate, maxDate, minVal, maxVal);
  const projPts = projecting ? toPoints(s.projected, minDate, maxDate, minVal, maxVal) : [];
  const goalY = s.goalValue != null ? yOf(s.goalValue) : null;
  const interceptX = s.interceptDate
    ? PAD.left + ((s.interceptDate.getTime() - minDate) / (maxDate - minDate)) * CHART_W
    : null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {/* Y-axis labels (top = max, bottom = min) */}
        <text x={PAD.left - 4} y={PAD.top + 4} fill="#71717a" fontSize="8" textAnchor="end">
          {fmt(maxVal)}
        </text>
        <text x={PAD.left - 4} y={PAD.top + CHART_H} fill="#71717a" fontSize="8" textAnchor="end">
          {fmt(minVal)}
        </text>

        {/* Grid lines */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left} y1={PAD.top + f * CHART_H}
            x2={W - PAD.right} y2={PAD.top + f * CHART_H}
            stroke="#2a2a2a" strokeWidth="1"
          />
        ))}

        {/* Today marker */}
        <line
          x1={xNow} y1={PAD.top} x2={xNow} y2={PAD.top + CHART_H}
          stroke="#555" strokeWidth="1" strokeDasharray="3 3"
        />
        <text x={xNow} y={PAD.top + CHART_H + 10} fill="#71717a" fontSize="8" textAnchor="middle">today</text>
        <text x={PAD.left} y={PAD.top + CHART_H + 10} fill="#52525b" fontSize="8" textAnchor="start">8 wks ago</text>
        <text x={W - PAD.right} y={PAD.top + CHART_H + 10} fill="#52525b" fontSize="8" textAnchor="end">+9 wks</text>

        {/* Goal line + label */}
        {goalY != null && (
          <>
            <line
              x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY}
              stroke={s.color} strokeWidth="1" strokeDasharray="4 4" opacity="0.5"
            />
            <text x={W - PAD.right} y={goalY - 3} fill={s.color} fontSize="8" textAnchor="end">
              goal {fmt(s.goalValue)}
            </text>
          </>
        )}

        {/* Historical (solid) */}
        {histPts.length > 1 && (
          <polyline points={polyline(histPts)} fill="none" stroke={s.color} strokeWidth="1.5" />
        )}
        {histPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill={s.color} />
        ))}

        {/* Projected (dashed) */}
        {projPts.length > 1 && (
          <polyline points={polyline(projPts)} fill="none" stroke={s.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        )}

        {/* Goal intercept dot */}
        {interceptX != null && goalY != null && interceptX <= W - PAD.right && (
          <circle cx={interceptX} cy={goalY} r="4" fill={s.color} />
        )}
      </svg>

      {noForecastReason ? (
        <div className="mt-2 px-3 py-2 rounded-lg text-xs text-text-muted" style={{ background: '#141414' }}>
          {noForecastReason}
        </div>
      ) : (
        s.weeksToGoal != null && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#0d2818', color: '#4ade80' }}>
            At this rate you'll reach {goalLabel} in ~{s.weeksToGoal} weeks
            {s.interceptDate && ` — around ${format(s.interceptDate, 'd MMM')}`}
          </div>
        )
      )}
    </div>
  );
}

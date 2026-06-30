import { format } from 'date-fns';

const W = 320;
const H = 120;
const PAD = { top: 12, right: 10, bottom: 28, left: 8 };
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

export default function ForecastChart({
  primarySeries,
  secondarySeries,
  showProjection,
  goalLabel,
}) {
  if (!primarySeries?.historical?.length) {
    return (
      <div className="text-xs text-zinc-600 text-center py-4">
        Not enough data yet — keep logging!
      </div>
    );
  }

  const now = Date.now();
  const weeksAgo8 = now - 56 * 86400000;
  const weeksAhead9 = now + 63 * 86400000;

  const allSeries = [primarySeries, secondarySeries].filter(Boolean);
  const allVals = allSeries.flatMap((s) => [
    ...(s.historical || []).map((p) => p.value),
    ...(s.projected || []).map((p) => p.value),
    s.goalValue,
  ]).filter((v) => v != null);

  const minVal = Math.min(...allVals) * 0.97;
  const maxVal = Math.max(...allVals) * 1.03;
  const minDate = weeksAgo8;
  const maxDate = weeksAhead9;

  const xNow = PAD.left + ((now - minDate) / (maxDate - minDate)) * CHART_W;

  const renderSeries = (s, key) => {
    if (!s) return null;
    const histPts = toPoints(s.historical, minDate, maxDate, minVal, maxVal);
    const projPts = showProjection && s.projected
      ? toPoints(s.projected, minDate, maxDate, minVal, maxVal)
      : [];
    const goalY = s.goalValue != null
      ? PAD.top + (1 - (s.goalValue - minVal) / (maxVal - minVal)) * CHART_H
      : null;
    const interceptX = s.interceptDate
      ? PAD.left + ((s.interceptDate.getTime() - minDate) / (maxDate - minDate)) * CHART_W
      : null;

    return (
      <g key={key}>
        {/* Goal line */}
        {goalY != null && (
          <line
            x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY}
            stroke={s.color} strokeWidth="1" strokeDasharray="4 4" opacity="0.3"
          />
        )}
        {/* Historical line (solid) */}
        {histPts.length > 1 && (
          <polyline points={polyline(histPts)} fill="none" stroke={s.color} strokeWidth="1.5" />
        )}
        {/* Projected line (dashed) */}
        {projPts.length > 1 && (
          <polyline points={polyline(projPts)} fill="none" stroke={s.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        )}
        {/* Goal intercept */}
        {interceptX != null && goalY != null && interceptX <= W - PAD.right && (
          <g>
            <circle cx={interceptX} cy={goalY} r="4" fill={s.color} />
            <line x1={interceptX} y1={goalY + 4} x2={interceptX} y2={goalY + 10} stroke={s.color} strokeWidth="1" />
            {s.interceptDate && (
              <>
                <text x={Math.min(interceptX + 2, W - PAD.right)} y={goalY + 20} fill={s.color} fontSize="8" textAnchor="end">
                  ~{s.weeksToGoal ?? '?'} wks
                </text>
                <text x={Math.min(interceptX + 2, W - PAD.right)} y={goalY + 30} fill="#666" fontSize="8" textAnchor="end">
                  {format(s.interceptDate, 'd MMM')}
                </text>
              </>
            )}
          </g>
        )}
      </g>
    );
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
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
        <text x={xNow + 3} y={PAD.top + 8} fill="#555" fontSize="8">today</text>

        {/* 8 wks ago label */}
        <text x={PAD.left} y={H - 4} fill="#444" fontSize="8">8 wks ago</text>

        {renderSeries(primarySeries, 'primary')}
        {renderSeries(secondarySeries, 'secondary')}
      </svg>

      {/* Goal badge */}
      {showProjection && primarySeries.weeksToGoal != null && (
        <div className="mt-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#0d2818', color: '#4ade80' }}>
          At this rate you'll reach {goalLabel} in ~{primarySeries.weeksToGoal} weeks
          {primarySeries.interceptDate && ` — around ${format(primarySeries.interceptDate, 'd MMM')}`}
        </div>
      )}
      {!showProjection && (
        <div className="mt-2 px-3 py-2 rounded-lg text-xs text-zinc-500" style={{ background: '#1a1a1a' }}>
          {primarySeries.historical.length >= 4
            ? 'Trend only — flat is success on maintain'
            : 'Set a target in Settings to see your forecast'}
        </div>
      )}
    </div>
  );
}

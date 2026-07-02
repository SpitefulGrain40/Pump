import { useState } from 'react';
import { format, parseISO } from 'date-fns';

// SVG line chart for sub-metric expandable rows, with y-axis min/max labels,
// date labels, and tap-a-point tooltips.
// data: [{date:string, value:number}] — sorted ascending.
// goalValue: optional dashed goal line. unit: e.g. '%' or ' kg'. note: caption.
export default function SparklineSVG({ data, color, goalValue, unit = '', note, height = 56 }) {
  const [active, setActive] = useState(null);

  if (!data || data.length < 2) {
    return <div className="text-xs text-text-muted py-2">Not enough data yet — log more to see a trend.</div>;
  }

  const W = 280;
  const H = height;
  const PAD = { top: 6, right: 6, bottom: 6, left: 30 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const vals = data.map((p) => p.value);
  const allVals = goalValue != null ? [...vals, goalValue] : vals;
  let minV = Math.min(...allVals) * 0.97;
  let maxV = Math.max(...allVals) * 1.03;
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }

  const xOf = (i) => PAD.left + (i / (data.length - 1)) * plotW;
  const yOf = (v) => PAD.top + (1 - (v - minV) / (maxV - minV)) * plotH;
  const fmt = (v) => (unit === '%' ? `${v.toFixed(1)}%` : `${v.toFixed(1)}${unit}`);

  const pts = data.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  const goalY = goalValue != null ? yOf(goalValue).toFixed(1) : null;

  const caption = active != null
    ? `${format(parseISO(data[active].date), 'd MMM')} — ${fmt(data[active].value)}`
    : `${format(parseISO(data[0].date), 'd MMM')} – ${format(parseISO(data[data.length - 1].date), 'd MMM')} · tap a point`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
        {/* Y-axis min/max */}
        <text x={PAD.left - 4} y={PAD.top + 4} fill="#71717a" fontSize="8" textAnchor="end">{fmt(maxV)}</text>
        <text x={PAD.left - 4} y={PAD.top + plotH} fill="#71717a" fontSize="8" textAnchor="end">{fmt(minV)}</text>

        {goalY && (
          <>
            <line x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY}
              stroke={color} strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
            <text x={W - PAD.right} y={Number(goalY) - 2} fill={color} fontSize="8" textAnchor="end" opacity="0.7">
              goal {fmt(goalValue)}
            </text>
          </>
        )}

        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

        {/* Tappable points */}
        {data.map((p, i) => (
          <circle
            key={i}
            cx={xOf(i)} cy={yOf(p.value)}
            r={active === i ? 4 : 2.5}
            fill={color}
            style={{ cursor: 'pointer' }}
            onClick={() => setActive(active === i ? null : i)}
          />
        ))}
      </svg>
      <p className="text-[10px] text-text-muted mt-1">{caption}</p>
      {note && <p className="text-[10px] text-text-muted italic">{note}</p>}
    </div>
  );
}

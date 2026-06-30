// Minimal SVG line chart for sub-metric expandable rows.
// data: [{date:string, value:number}]  — already sorted ascending.
// goalValue: optional horizontal goal line (dashed, same color).
// note: optional text rendered below chart.
export default function SparklineSVG({ data, color, goalValue, note, height = 48 }) {
  if (!data || data.length < 2) {
    return <div className="text-xs text-zinc-600 py-2">Not enough data yet</div>;
  }

  const W = 280;
  const H = height;
  const PAD = 4;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const vals = data.map((p) => p.value);
  const allVals = goalValue != null ? [...vals, goalValue] : vals;
  const minV = Math.min(...allVals) * 0.97;
  const maxV = Math.max(...allVals) * 1.03;

  const xOf = (i) => PAD + (i / (data.length - 1)) * plotW;
  const yOf = (v) => PAD + (1 - (v - minV) / (maxV - minV)) * plotH;

  const pts = data.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  const goalY = goalValue != null ? yOf(goalValue).toFixed(1) : null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {goalY && (
          <line x1={PAD} y1={goalY} x2={W - PAD} y2={goalY}
            stroke={color} strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
        )}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Latest value dot */}
        <circle
          cx={xOf(data.length - 1)} cy={yOf(data[data.length - 1].value)} r="3"
          fill={color}
        />
      </svg>
      {note && <p className="text-[10px] text-zinc-600 mt-1 italic">{note}</p>}
    </div>
  );
}

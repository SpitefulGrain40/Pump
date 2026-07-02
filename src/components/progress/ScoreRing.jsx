// Single SVG score ring — value/max arc, centre display, label below.
// value: 0-max. max is the denominator (100 for a percent score).
// displayValue: string shown in centre, e.g. "62%".
// sub: optional small line under the label, e.g. a "▲ 8%" trend delta.
export default function ScoreRing({ value, max = 100, displayValue, label, color, sub, subColor = '#71717a', size = 64 }) {
  const r = (size / 2) - 6;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const arcLen = pct * circumference;
  const offset = circumference * 0.25;  // start at top

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth="6" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={size < 56 ? 9 : 11} fontWeight="600">
          {displayValue}
        </text>
      </svg>
      <span className="text-xs text-zinc-500 text-center leading-tight max-w-[64px]">{label}</span>
      {sub && (
        <span className="text-[10px] font-medium leading-none" style={{ color: subColor }}>
          {sub}
        </span>
      )}
    </div>
  );
}

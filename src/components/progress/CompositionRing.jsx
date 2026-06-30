// Two-arc SVG donut showing body composition split.
// primaryArc.pct is the percentage of the ring taken by the primary metric.
// secondaryArc fills the remainder.
export default function CompositionRing({ primaryArc, secondaryArc, centerValue, centerSublabel, stats = [] }) {
  const r = 52;
  const cx = 64;
  const cy = 64;
  const circumference = 2 * Math.PI * r;
  const primaryLen = (primaryArc.pct / 100) * circumference;
  const secondaryLen = circumference - primaryLen;

  // Start from top (-90 deg = -PI/2). Primary arc first, then secondary.
  // strokeDasharray: [arcLength, gap]. strokeDashoffset shifts the start.
  const primaryOffset = circumference * 0.25;  // start at top
  const secondaryOffset = primaryOffset - primaryLen;  // secondary starts after primary

  return (
    <div className="flex items-center gap-4">
      {/* Ring */}
      <div className="relative flex-shrink-0">
        <svg width="128" height="128" viewBox="0 0 128 128">
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth="14"
          />
          {/* Secondary arc (lean mass / weight — depends on goal) */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={secondaryArc.color}
            strokeWidth="14"
            strokeDasharray={`${secondaryLen} ${primaryLen}`}
            strokeDashoffset={secondaryOffset}
            strokeLinecap="round"
          />
          {/* Primary arc (body fat / lean mass — depends on goal) */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={primaryArc.color}
            strokeWidth="14"
            strokeDasharray={`${primaryLen} ${secondaryLen}`}
            strokeDashoffset={primaryOffset}
            strokeLinecap="round"
          />
          {/* Centre text */}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">
            {centerValue}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="#666" fontSize="10">
            {centerSublabel}
          </text>
        </svg>
      </div>

      {/* Stats beside ring */}
      <div className="flex flex-col gap-3 flex-1">
        {stats.map((stat, i) => (
          <div key={i}>
            <div className="text-xs text-zinc-500 mb-0.5">{stat.label}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-white">{stat.value}</span>
              {stat.change && (
                <span className={`text-xs font-medium ${stat.positive ? 'text-green-400' : 'text-red-400'}`}>
                  {stat.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

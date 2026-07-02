import { useState } from 'react';

// A+B hybrid composition card:
//  - stacked lean/fat mass bar (part-to-whole), tap a segment for exact figures
//  - slim body-fat-vs-goal meter underneath (single ratio against target)
// Replaces the old two-arc donut, which double-displayed body fat.
const LEAN_COLOR = '#22c55e';
const FAT_COLOR = '#f59e0b';
const BF_COLOR = '#60a5fa';

const clamp = (v) => Math.max(0, Math.min(100, v));

export default function CompositionBar({
  weight,
  leanMass,
  bodyFatPct,
  bodyFatGoal,
  leanChange,
  fatChange,
}) {
  const [tapped, setTapped] = useState(null);

  if (weight == null) {
    return (
      <div className="text-xs text-text-muted py-2">
        Log a weigh-in to see your body composition.
      </div>
    );
  }

  const bf = bodyFatPct;
  const lean = leanMass != null ? leanMass : bf != null ? weight * (1 - bf / 100) : null;
  const fat = lean != null ? Math.max(weight - lean, 0) : bf != null ? (weight * bf) / 100 : null;
  const hasSplit = lean != null && fat != null;
  const leanPct = hasSplit ? (lean / weight) * 100 : null;

  // Goal meter domain: a tight window around current + goal so the marker is legible.
  let meter = null;
  if (bf != null && bodyFatGoal != null) {
    const lo = Math.max(0, Math.min(bf, bodyFatGoal) - 4);
    const hi = Math.min(60, Math.max(bf, bodyFatGoal) + 4);
    const span = hi - lo || 1;
    meter = {
      lo,
      hi,
      fillPct: clamp(((bf - lo) / span) * 100),
      goalPct: clamp(((bodyFatGoal - lo) / span) * 100),
    };
  }

  const tip =
    tapped === 'lean' && hasSplit
      ? `${lean.toFixed(1)} kg lean mass · ${leanPct.toFixed(0)}% of body weight`
      : tapped === 'fat' && hasSplit
        ? `${fat.toFixed(1)} kg fat mass${bf != null ? ` · ${bf.toFixed(1)}% body fat` : ''}`
        : 'Tap a segment for exact figures';

  const fatToLose =
    bf != null && bodyFatGoal != null && bf > bodyFatGoal
      ? weight * ((bf - bodyFatGoal) / 100)
      : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-text">Body composition</span>
        <span className="text-xs text-text-muted">{weight.toFixed(1)} kg total</span>
      </div>

      {hasSplit ? (
        <>
          <div className="flex h-7 rounded-lg overflow-hidden gap-0.5">
            <button
              type="button"
              onClick={() => setTapped('lean')}
              className="flex items-center pl-2.5 text-xs font-medium"
              style={{ width: `${leanPct}%`, background: LEAN_COLOR, color: '#052e16' }}
            >
              Lean
            </button>
            <button
              type="button"
              onClick={() => setTapped('fat')}
              className="flex items-center justify-center text-xs font-medium"
              style={{ width: `${100 - leanPct}%`, background: FAT_COLOR, color: '#451a03' }}
            >
              Fat
            </button>
          </div>

          <div
            className={`text-xs text-center mt-2 h-4 ${tapped ? 'text-text' : 'text-text-muted'}`}
          >
            {tip}
          </div>

          <div className="flex items-center justify-between text-xs mt-1">
            <span style={{ color: LEAN_COLOR }}>
              ● {lean.toFixed(1)} kg lean{leanChange ? ` · ${leanChange}` : ''}
            </span>
            <span style={{ color: FAT_COLOR }}>
              {fat.toFixed(1)} kg fat{fatChange ? ` · ${fatChange}` : ''} ●
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs text-text-muted py-1">
          Log a measurement (waist, neck) to see your lean / fat split.
        </div>
      )}

      {meter && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs text-text-muted mb-2">
            <span>
              Body fat <span style={{ color: BF_COLOR }}>{bf.toFixed(1)}%</span> → goal{' '}
              {bodyFatGoal}%
            </span>
            {fatToLose != null && (
              <span style={{ color: LEAN_COLOR }}>{fatToLose.toFixed(1)} kg fat to lose</span>
            )}
          </div>
          <div className="relative h-2 rounded-full" style={{ background: '#2a2a2a' }}>
            <div
              className="absolute left-0 top-0 bottom-0 rounded-full"
              style={{ width: `${meter.fillPct}%`, background: BF_COLOR }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-0.5"
              style={{ left: `${meter.goalPct}%`, background: '#fff' }}
              title={`Goal ${bodyFatGoal}%`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>{meter.lo.toFixed(0)}%</span>
            <span>{meter.hi.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {bf != null && bodyFatGoal == null && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-text-muted">
          Set a body-fat target in Settings to track progress to your goal.
        </div>
      )}
    </div>
  );
}

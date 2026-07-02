# Progress Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat Progress tab with a three-section, goal-adaptive layout (Outcomes / Drivers / Records) featuring SVG composition ring, forecast chart with linear regression, score rings, and expandable sub-metric rows.

**Architecture:** Pure computation lives in `src/utils/progressCalcs.js` (testable, no React). Six focused SVG/React components in `src/components/progress/` handle rendering. `Progress.jsx` is rewritten to wire data from existing hooks into these components via a goal config object returned by `getGoalConfig()`.

**Tech Stack:** React 18, Vite, Tailwind CSS 4, Chart.js + react-chartjs-2 (driver bar/line charts only), date-fns, Lucide React, Vitest (unit tests), pure SVG (composition ring, forecast chart, score rings, sparklines).

## Global Constraints

- All weight values displayed in **kg** throughout — never lbs, never tonnes
- Volume load displayed as `X,XXX kg` using `toLocaleString()` — never as `11.2t`
- OLED dark theme — no white backgrounds; surface = `#1a1a1a`, background = `#0a0a0a`
- All new components in `src/components/progress/` — one file per component
- No backend calls — all data from existing localStorage hooks
- Navy formula body fat from `calculateBodyFatNavy` in `src/utils/calculations.js`
- Forecast regression only runs when ≥4 data points exist in the last 28 days
- Epley 1RM skipped when `reps === 1` (that weight IS the 1RM)
- Bodyweight sets (weight = 0) excluded from volume load calculation
- Info panels are inline toggles — no modals, no fixed/absolute overlays
- Sub-metric order and driver ring semantics change per `profile.goal.intent`
- No Chart.js in new SVG components — only reused for driver bar/line charts

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/progressCalcs.js` | **Create** | All pure computation: regression, forecast, series builders, adherence, volume, 1RM, goal config |
| `src/utils/progressCalcs.test.js` | **Create** | Vitest unit tests for all pure functions |
| `src/components/progress/CompositionRing.jsx` | **Create** | SVG donut ring — two arcs, centre label, stat rows beside ring |
| `src/components/progress/ForecastChart.jsx` | **Create** | SVG forecast chart — historical + projected lines, goal intercept dot, date labels |
| `src/components/progress/ScoreRing.jsx` | **Create** | Single SVG ring — reused ×4 in drivers section |
| `src/components/progress/InfoToggle.jsx` | **Create** | Inline info panel toggle — `i` button + collapsible panel |
| `src/components/progress/ExpandableRow.jsx` | **Create** | Tap-to-expand row with dot, label, value, change badge, chevron |
| `src/components/progress/SparklineSVG.jsx` | **Create** | Mini SVG line chart for sub-metric expandables |
| `src/components/Progress.jsx` | **Rewrite** | Three-section layout; wires hooks → goal config → components |

---

## Task 1: Pure Computation Utils

**Files:**
- Create: `src/utils/progressCalcs.js`
- Create: `src/utils/progressCalcs.test.js`

**Interfaces:**
- Produces (consumed by all later tasks):
  - `linearRegression(points: {x:number,y:number}[]) → {slope:number,intercept:number} | null`
  - `forecastToTarget(series:{date:string,value:number}[], targetValue:number) → {weeksAway:number,interceptDate:Date} | null`
  - `buildBodyFatSeries(measurementEntries, profile) → {date:string,value:number}[]`
  - `buildLeanMassSeries(weightEntries, measurementEntries, profile) → {date:string,value:number}[]`
  - `buildWaistSeries(measurementEntries) → {date:string,value:number}[]`
  - `buildWeightSeries(weightEntries) → {date:string,value:number}[]`
  - `calcWeeklyVolumes(workoutLogs, weeksBack:number) → {weekStart:string,volume:number}[]`
  - `estimateOneRepMax(weight:number, reps:number) → number | null`
  - `calcWorkoutAdherence(workoutLogs, daysBack:number) → {daysHit:number,results:{date:string,completed:boolean}[]}`
  - `calcProteinAdherence(nutritionLogs, proteinMin:number, daysBack:number) → {daysHit:number,results:{date:string,hit:boolean,value:number}[]}`
  - `calcCalorieAdherence(nutritionLogs, calorieTarget:{min:number,max:number}, daysBack:number, intent:string) → {daysHit:number,results:{date:string,hit:boolean,value:number}[]}`
  - `getGoalConfig(intent:string) → GoalConfig`
  - `getExercisePRs(workoutLogs, exerciseLibrary:{name:string,category:string}[]) → {[name]:{weight:number,reps:number,date:string,estimatedOneRM:number|null,category:string}}`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/progressCalcs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  linearRegression,
  forecastToTarget,
  estimateOneRepMax,
  calcWeeklyVolumes,
  calcWorkoutAdherence,
  calcProteinAdherence,
  calcCalorieAdherence,
  getGoalConfig,
  buildWeightSeries,
  buildWaistSeries,
} from './progressCalcs';

describe('linearRegression', () => {
  it('returns correct slope and intercept', () => {
    const r = linearRegression([{x:0,y:0},{x:1,y:2},{x:2,y:4}]);
    expect(r.slope).toBeCloseTo(2);
    expect(r.intercept).toBeCloseTo(0);
  });
  it('returns null for fewer than 2 points', () => {
    expect(linearRegression([{x:0,y:1}])).toBeNull();
    expect(linearRegression([])).toBeNull();
  });
});

describe('forecastToTarget', () => {
  it('returns null when fewer than 4 points in last 28 days', () => {
    const series = [
      {date:'2026-06-01',value:20},
      {date:'2026-06-05',value:19.5},
    ];
    expect(forecastToTarget(series, 18)).toBeNull();
  });
  it('returns null when slope moves away from target (BF rising when target below)', () => {
    const today = new Date();
    const series = Array.from({length:5},(_,i)=>({
      date: new Date(today.getTime() - (20-i*4)*86400000).toISOString().split('T')[0],
      value: 18 + i * 0.3,  // rising
    }));
    expect(forecastToTarget(series, 18)).toBeNull();
  });
  it('returns weeksAway and interceptDate when trending toward target', () => {
    const today = new Date();
    const series = Array.from({length:6},(_,i)=>({
      date: new Date(today.getTime() - (25-i*4)*86400000).toISOString().split('T')[0],
      value: 22 - i * 0.6,  // falling toward 18
    }));
    const result = forecastToTarget(series, 18);
    expect(result).not.toBeNull();
    expect(result.weeksAway).toBeGreaterThan(0);
    expect(result.interceptDate).toBeInstanceOf(Date);
  });
});

describe('estimateOneRepMax', () => {
  it('returns null for reps === 1', () => {
    expect(estimateOneRepMax(100, 1)).toBeNull();
  });
  it('returns null for weight === 0', () => {
    expect(estimateOneRepMax(0, 10)).toBeNull();
  });
  it('applies Epley formula', () => {
    // 100 * (1 + 10/30) = 100 * 1.333... = 133.3
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.3, 0);
  });
});

describe('calcWeeklyVolumes', () => {
  it('sums sets*reps*weight for completed sets, skips bodyweight', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [{
      date: today,
      completedAt: new Date().toISOString(),
      exercises: [{
        name: 'Bench Press',
        actual: {
          sets: [true, true, false],
          reps: [10, 8, 0],
          weight: [80, 80, 80],
        },
      }, {
        name: 'Plank',
        actual: {
          sets: [true],
          reps: [30],
          weight: [0],  // bodyweight — should be skipped
        },
      }],
    }];
    const vols = calcWeeklyVolumes(logs, 1);
    expect(vols).toHaveLength(1);
    // 10*80 + 8*80 = 800 + 640 = 1440
    expect(vols[0].volume).toBe(1440);
  });
  it('ignores non-completed workouts', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [{
      date: today,
      completedAt: null,  // not completed
      exercises: [{name:'Squat', actual:{sets:[true],reps:[5],weight:[100]}}],
    }];
    const vols = calcWeeklyVolumes(logs, 1);
    expect(vols[0].volume).toBe(0);
  });
});

describe('calcWorkoutAdherence', () => {
  it('counts days with at least one completed workout in window', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    const logs = [
      {date: today.toISOString().split('T')[0], completedAt: today.toISOString()},
      {date: yesterday.toISOString().split('T')[0], completedAt: yesterday.toISOString()},
      {date: today.toISOString().split('T')[0], completedAt: null},  // not complete
    ];
    const result = calcWorkoutAdherence(logs, 7);
    expect(result.daysHit).toBe(2);
    expect(result.results).toHaveLength(7);
  });
});

describe('calcProteinAdherence', () => {
  it('counts days where total protein >= proteinMin', () => {
    const today = new Date();
    const d = (offsetDays) => {
      const t = new Date(today.getTime() - offsetDays * 86400000);
      return t.toISOString();
    };
    const logs = [
      {timestamp: d(0), totals: {calories: 2000, protein: 150}},
      {timestamp: d(1), totals: {calories: 1800, protein: 80}},  // miss (min=120)
      {timestamp: d(2), totals: {calories: 2100, protein: 130}},
    ];
    const result = calcProteinAdherence(logs, 120, 7);
    expect(result.daysHit).toBe(2);
  });
});

describe('calcCalorieAdherence', () => {
  it('counts days under max for cut intent', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 1800, protein: 120}},  // hit (under 2200)
      {timestamp: d(1), totals: {calories: 2400, protein: 100}},  // miss (over 2200)
    ];
    const result = calcCalorieAdherence(logs, {min: 1800, max: 2200}, 7, 'cut');
    expect(result.daysHit).toBe(1);
  });
  it('counts days hitting minimum for bulk intent', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 2600, protein: 160}},  // hit (over 2400 min)
      {timestamp: d(1), totals: {calories: 2100, protein: 130}},  // miss (under 2400)
    ];
    const result = calcCalorieAdherence(logs, {min: 2400, max: 2800}, 7, 'bulk');
    expect(result.daysHit).toBe(1);
  });
  it('counts days within range for recomp/maintain', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 2100, protein: 140}},  // in range 2000-2200
      {timestamp: d(1), totals: {calories: 1700, protein: 110}},  // below range
      {timestamp: d(2), totals: {calories: 2400, protein: 150}},  // above range
    ];
    const result = calcCalorieAdherence(logs, {min: 2000, max: 2200}, 7, 'recomp');
    expect(result.daysHit).toBe(1);
  });
});

describe('getGoalConfig', () => {
  it('returns recomp config with BF% first in sub-metric order', () => {
    const cfg = getGoalConfig('recomp');
    expect(cfg.subMetricOrder[0]).toBe('bodyfat');
    expect(cfg.calorieRingLabel).toBe('Calories');
    expect(cfg.showForecastProjection).toBe(true);
  });
  it('returns cut config with weight first in sub-metric order', () => {
    const cfg = getGoalConfig('cut');
    expect(cfg.subMetricOrder[0]).toBe('weight');
    expect(cfg.calorieRingLabel).toBe('Deficit');
  });
  it('returns bulk config with lean mass first', () => {
    const cfg = getGoalConfig('bulk');
    expect(cfg.subMetricOrder[0]).toBe('leanmass');
    expect(cfg.calorieRingLabel).toBe('Surplus');
  });
  it('returns maintain config with no forecast projection', () => {
    const cfg = getGoalConfig('maintain');
    expect(cfg.subMetricOrder[0]).toBe('weight');
    expect(cfg.showForecastProjection).toBe(false);
  });
});

describe('buildWeightSeries', () => {
  it('maps weight entries to {date, value} sorted ascending', () => {
    const entries = [
      {date:'2026-06-10', weight:85},
      {date:'2026-06-05', weight:86},
    ];
    const result = buildWeightSeries(entries);
    expect(result[0]).toEqual({date:'2026-06-05', value:86});
    expect(result[1]).toEqual({date:'2026-06-10', value:85});
  });
});

describe('buildWaistSeries', () => {
  it('maps measurement entries with waist to {date, value}', () => {
    const entries = [
      {date:'2026-06-01', waist:92, neck:40, hip:null},
      {date:'2026-06-15', waist:null, neck:40, hip:null},  // no waist — excluded
    ];
    const result = buildWaistSeries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(92);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:\Users\mikes\Pump
npm test -- progressCalcs
```
Expected: multiple failures with "Cannot find module './progressCalcs'"

- [ ] **Step 3: Implement `src/utils/progressCalcs.js`**

```js
import { calculateBodyFatNavy, calculateLeanMass } from './calculations';
import { format, startOfWeek, subWeeks, parseISO, differenceInDays } from 'date-fns';

// ── Linear regression ──────────────────────────────────────────────────────

export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Forecast to target ─────────────────────────────────────────────────────

export function forecastToTarget(series, targetValue) {
  const cutoff = new Date(Date.now() - 28 * 86400000);
  const recent = series.filter((p) => new Date(p.date) >= cutoff);
  if (recent.length < 4) return null;

  const sorted = [...recent].sort((a, b) => new Date(a.date) - new Date(b.date));
  const base = new Date(sorted[0].date).getTime();
  const points = sorted.map((p) => ({
    x: (new Date(p.date).getTime() - base) / 86400000,
    y: p.value,
  }));

  const reg = linearRegression(points);
  if (!reg || reg.slope === 0) return null;

  const todayOffset = (Date.now() - base) / 86400000;
  const interceptDay = (targetValue - reg.intercept) / reg.slope;
  const daysAway = interceptDay - todayOffset;
  if (daysAway < 0) return null;

  return {
    weeksAway: Math.round(daysAway / 7),
    interceptDate: new Date(Date.now() + daysAway * 86400000),
    slope: reg.slope,
  };
}

// ── Series builders ────────────────────────────────────────────────────────

export function buildWeightSeries(weightEntries) {
  return [...weightEntries]
    .filter((e) => e.weight != null)
    .map((e) => ({ date: e.date, value: e.weight }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildWaistSeries(measurementEntries) {
  return [...measurementEntries]
    .filter((e) => e.waist != null)
    .map((e) => ({ date: e.date, value: e.waist }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildBodyFatSeries(measurementEntries, profile) {
  return [...measurementEntries]
    .map((e) => {
      const bf = calculateBodyFatNavy(
        profile.gender,
        profile.height,
        e.waist ?? profile.waistCircumference,
        e.neck ?? profile.neckCircumference,
        e.hip ?? profile.hipCircumference,
      );
      return bf && bf > 0 && bf < 60 ? { date: e.date, value: bf } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildLeanMassSeries(weightEntries, measurementEntries, profile) {
  const bfByDate = {};
  buildBodyFatSeries(measurementEntries, profile).forEach((p) => {
    bfByDate[p.date] = p.value;
  });

  // Find BF% for a weight entry: use same date, else nearest prior measurement
  const sortedMeas = Object.keys(bfByDate).sort();
  const getBF = (date) => {
    if (bfByDate[date]) return bfByDate[date];
    const prior = sortedMeas.filter((d) => d <= date).pop();
    return prior ? bfByDate[prior] : null;
  };

  return [...weightEntries]
    .filter((e) => e.weight != null)
    .map((e) => {
      const bf = getBF(e.date);
      if (!bf) return null;
      const lean = calculateLeanMass(e.weight, bf);
      return lean ? { date: e.date, value: lean } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ── Volume load ────────────────────────────────────────────────────────────

export function calcWeeklyVolumes(workoutLogs, weeksBack) {
  const result = [];
  for (let w = 0; w < weeksBack; w++) {
    const weekStart = startOfWeek(subWeeks(new Date(), w), { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    const volume = workoutLogs
      .filter((log) => {
        if (!log.completedAt) return false;
        const d = parseISO(log.date);
        return d >= weekStart && d < weekEnd;
      })
      .reduce((total, log) => {
        const exerciseTotal = (log.exercises || []).reduce((exAcc, ex) => {
          const sets = ex.actual?.sets || [];
          const weights = ex.actual?.weight || [];
          const reps = ex.actual?.reps || [];
          const setTotal = sets.reduce((setAcc, done, i) => {
            if (!done) return setAcc;
            const w = Number(weights[i]) || 0;
            const r = Number(reps[i]) || 0;
            if (w === 0) return setAcc;  // bodyweight — skip
            return setAcc + w * r;
          }, 0);
          return exAcc + setTotal;
        }, 0);
        return total + exerciseTotal;
      }, 0);

    result.unshift({ weekStart: weekStartStr, volume });
  }
  return result;
}

// ── Estimated 1RM (Epley) ──────────────────────────────────────────────────

export function estimateOneRepMax(weight, reps) {
  if (!weight || weight <= 0) return null;
  if (!reps || reps <= 1) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// ── Exercise PRs with 1RM ──────────────────────────────────────────────────

export function getExercisePRs(workoutLogs, exerciseLibrary) {
  const categoryMap = {};
  (exerciseLibrary || []).forEach((ex) => {
    categoryMap[ex.name] = ex.category || 'other';
  });

  const bests = {};  // { [name]: { weight, reps, date } }

  workoutLogs
    .filter((log) => log.completedAt)
    .forEach((log) => {
      (log.exercises || []).forEach((ex) => {
        const sets = ex.actual?.sets || [];
        const weights = ex.actual?.weight || [];
        const reps = ex.actual?.reps || [];
        sets.forEach((done, i) => {
          if (!done) return;
          const w = Number(weights[i]) || 0;
          const r = Number(reps[i]) || 0;
          if (w <= 0) return;
          if (!bests[ex.name] || w > bests[ex.name].weight) {
            bests[ex.name] = { weight: w, reps: r, date: log.date };
          }
        });
      });
    });

  const result = {};
  Object.entries(bests).forEach(([name, { weight, reps, date }]) => {
    result[name] = {
      weight,
      reps,
      date,
      estimatedOneRM: estimateOneRepMax(weight, reps),
      category: categoryMap[name] || 'other',
    };
  });
  return result;
}

// ── Adherence calculations ─────────────────────────────────────────────────

function last7Dates(daysBack) {
  const dates = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(Date.now() - i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;  // today first
}

export function calcWorkoutAdherence(workoutLogs, daysBack) {
  const dates = last7Dates(daysBack);
  const completedDates = new Set(
    workoutLogs
      .filter((l) => l.completedAt)
      .map((l) => l.date),
  );
  const results = dates.map((date) => ({ date, completed: completedDates.has(date) }));
  return { daysHit: results.filter((r) => r.completed).length, results };
}

function getDailyNutritionTotals(nutritionLogs, daysBack) {
  const dates = last7Dates(daysBack);
  const byDate = {};
  nutritionLogs.forEach((meal) => {
    const date = meal.timestamp.split('T')[0];
    if (!byDate[date]) byDate[date] = { calories: 0, protein: 0 };
    byDate[date].calories += Number(meal.totals?.calories) || 0;
    byDate[date].protein += Number(meal.totals?.protein) || 0;
  });
  return dates.map((date) => ({
    date,
    calories: byDate[date]?.calories || 0,
    protein: byDate[date]?.protein || 0,
    logged: !!byDate[date],
  }));
}

export function calcProteinAdherence(nutritionLogs, proteinMin, daysBack) {
  const daily = getDailyNutritionTotals(nutritionLogs, daysBack);
  const results = daily
    .filter((d) => d.logged)
    .map((d) => ({ date: d.date, hit: d.protein >= proteinMin, value: d.protein }));
  return { daysHit: results.filter((r) => r.hit).length, total: daily.length, results };
}

export function calcCalorieAdherence(nutritionLogs, calorieTarget, daysBack, intent) {
  const daily = getDailyNutritionTotals(nutritionLogs, daysBack);
  const { min, max } = calorieTarget || {};
  const results = daily
    .filter((d) => d.logged)
    .map((d) => {
      let hit = false;
      if (intent === 'cut') hit = max != null && d.calories <= max;
      else if (intent === 'bulk') hit = min != null && d.calories >= min;
      else hit = min != null && max != null && d.calories >= min && d.calories <= max;
      return { date: d.date, hit, value: d.calories };
    });
  return { daysHit: results.filter((r) => r.hit).length, total: daily.length, results };
}

// ── Goal config ────────────────────────────────────────────────────────────

const GOAL_CONFIGS = {
  recomp: {
    heroArcs: [
      { metric: 'bodyfat', color: '#60a5fa', label: 'Body fat' },
      { metric: 'leanmass', color: '#4ade80', label: 'Lean mass' },
    ],
    centerLabel: 'bodyfat',
    forecastMetrics: ['bodyfat', 'leanmass'],
    subMetricOrder: ['bodyfat', 'leanmass', 'waist', 'weight'],
    calorieRingColor: '#fbbf24',
    calorieRingLabel: 'Calories',
    weightRowNote: 'flat as expected on recomp',
    showForecastProjection: true,
  },
  cut: {
    heroArcs: [
      { metric: 'weight', color: '#a1a1aa', label: 'Weight' },
      { metric: 'bodyfat', color: '#60a5fa', label: 'Body fat' },
    ],
    centerLabel: 'weight',
    forecastMetrics: ['weight', 'bodyfat'],
    subMetricOrder: ['weight', 'bodyfat', 'waist', 'leanmass'],
    calorieRingColor: '#f87171',
    calorieRingLabel: 'Deficit',
    weightRowNote: null,
    showForecastProjection: true,
  },
  bulk: {
    heroArcs: [
      { metric: 'leanmass', color: '#4ade80', label: 'Lean mass' },
      { metric: 'weight', color: '#a1a1aa', label: 'Weight' },
    ],
    centerLabel: 'leanmass',
    forecastMetrics: ['leanmass', 'weight'],
    subMetricOrder: ['leanmass', 'weight', 'bodyfat', 'waist'],
    calorieRingColor: '#4ade80',
    calorieRingLabel: 'Surplus',
    weightRowNote: 'rising as expected on a bulk',
    showForecastProjection: true,
  },
  maintain: {
    heroArcs: [
      { metric: 'weight', color: '#a1a1aa', label: 'Weight' },
      { metric: 'bodyfat', color: '#60a5fa', label: 'Body fat' },
    ],
    centerLabel: 'weight',
    forecastMetrics: ['weight', 'bodyfat'],
    subMetricOrder: ['weight', 'bodyfat', 'leanmass', 'waist'],
    calorieRingColor: '#fbbf24',
    calorieRingLabel: 'Calories',
    weightRowNote: null,
    showForecastProjection: false,
  },
};

export function getGoalConfig(intent) {
  return GOAL_CONFIGS[intent] || GOAL_CONFIGS.recomp;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- progressCalcs
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/progressCalcs.js src/utils/progressCalcs.test.js
git commit -m "feat: add progressCalcs utilities with regression, forecast, series builders, adherence, and goal config"
```

---

## Task 2: CompositionRing Component

**Files:**
- Create: `src/components/progress/CompositionRing.jsx`

**Interfaces:**
- Consumes: nothing from prior tasks (pure props)
- Produces: `<CompositionRing>` component — used in Task 6

Props:
```
primaryArc:  { pct: number, color: string, label: string }
secondaryArc: { color: string, label: string }  // renders (100-pct)%
centerValue: string   — e.g. "18.5%" or "82.5 kg"
centerSublabel: string — e.g. "body fat"
stats: [{ label:string, value:string, change:string, positive:boolean }]
```

- [ ] **Step 1: Create `src/components/progress/CompositionRing.jsx`**

```jsx
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
```

- [ ] **Step 2: Verify the component renders without errors**

Temporarily add `<CompositionRing>` into `Progress.jsx` dev render and run `npm run dev`. Check browser console for errors, then remove the temporary render.

```jsx
// Temporary smoke test in Progress.jsx top of return:
<CompositionRing
  primaryArc={{ pct: 19, color: '#60a5fa', label: 'Body fat' }}
  secondaryArc={{ color: '#4ade80', label: 'Lean mass' }}
  centerValue="19%"
  centerSublabel="body fat"
  stats={[
    { label: 'Lean mass', value: '82.5 kg', change: '+0.4 kg', positive: true },
    { label: 'Body fat', value: '19%', change: '−1.2%', positive: true },
  ]}
/>
```

Expected: SVG donut renders with two coloured arcs and centred text.

- [ ] **Step 3: Commit**

```bash
git add src/components/progress/CompositionRing.jsx
git commit -m "feat: add CompositionRing SVG donut component"
```

---

## Task 3: ForecastChart Component

**Files:**
- Create: `src/components/progress/ForecastChart.jsx`

**Interfaces:**
- Consumes: nothing from prior tasks (pure props)
- Produces: `<ForecastChart>` component — used in Task 6

Props:
```
primarySeries: { historical: {date:string,value:number}[], projected: {date:string,value:number}[]|null, color: string, goalValue: number|null, interceptDate: Date|null, weeksToGoal: number|null }
secondarySeries?: { historical: {date:string,value:number}[], projected: {date:string,value:number}[]|null, color: string, goalValue: number|null, interceptDate: Date|null }
showProjection: boolean
goalLabel?: string   — e.g. "18% body fat"
```

The chart is a 320×120 SVG. X axis spans "8 wks ago" → today → ~9 wks future. Historical lines are solid; projected lines are dashed. No numeric axis labels — three subtle horizontal grid lines for rhythm.

- [ ] **Step 1: Create `src/components/progress/ForecastChart.jsx`**

```jsx
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
```

- [ ] **Step 2: Smoke test in browser**

Add a temporary render in Progress.jsx with static data, check no console errors, then remove.

Expected: SVG chart renders with a solid historical line and a dashed projected line.

- [ ] **Step 3: Commit**

```bash
git add src/components/progress/ForecastChart.jsx
git commit -m "feat: add ForecastChart SVG component with dual-line projection and goal intercept"
```

---

## Task 4: ScoreRing and InfoToggle Components

**Files:**
- Create: `src/components/progress/ScoreRing.jsx`
- Create: `src/components/progress/InfoToggle.jsx`

**Interfaces:**
- Consumes: nothing from prior tasks
- Produces:
  - `<ScoreRing value displayValue label color size?>` — used in Task 7
  - `<InfoToggle id color? children>` — used in Tasks 6, 7, 8

- [ ] **Step 1: Create `src/components/progress/ScoreRing.jsx`**

```jsx
// Single SVG score ring — value/max arc, centre display, label below.
// value: 0-max. max is the denominator (7 for days, 100 for percent).
// displayValue: string shown in centre, e.g. "5/7" or "+12%".
export default function ScoreRing({ value, max = 7, displayValue, label, color, size = 64 }) {
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
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/progress/InfoToggle.jsx`**

```jsx
import { useState } from 'react';
import { Info } from 'lucide-react';

// Inline info toggle — renders a circled "i" button that expands/collapses a panel.
// id: unique string for this toggle. color: left-border accent (default zinc-600).
export default function InfoToggle({ id, color = '#52525b', children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: '#2a2a2a' }}
        aria-expanded={open}
        aria-label="More information"
      >
        <Info size={11} className="text-zinc-400" />
      </button>
      {open && (
        <div
          className="mt-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed text-zinc-400"
          style={{ background: '#141414', borderLeft: `3px solid ${color}` }}
        >
          {children}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Smoke test both in browser**

Expected: clicking `i` button toggles the info panel; ScoreRing renders a partial arc matching value/max.

- [ ] **Step 4: Commit**

```bash
git add src/components/progress/ScoreRing.jsx src/components/progress/InfoToggle.jsx
git commit -m "feat: add ScoreRing and InfoToggle components"
```

---

## Task 5: ExpandableRow and SparklineSVG Components

**Files:**
- Create: `src/components/progress/ExpandableRow.jsx`
- Create: `src/components/progress/SparklineSVG.jsx`

**Interfaces:**
- Consumes: nothing from prior tasks
- Produces:
  - `<ExpandableRow dotColor label value change? changePositive? defaultOpen? children>` — used in Tasks 6, 7
  - `<SparklineSVG data color goalValue? note? height?>` — used in Task 6

- [ ] **Step 1: Create `src/components/progress/ExpandableRow.jsx`**

```jsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Tappable row that expands to reveal children (sparkline chart, detail, etc.)
export default function ExpandableRow({
  dotColor,
  label,
  value,
  change,
  changePositive,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        className="w-full flex items-center gap-3 py-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: dotColor }}
        />
        <span className="flex-1 text-sm text-white">{label}</span>
        {change && (
          <span className={`text-xs font-medium mr-1 ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
            {change}
          </span>
        )}
        <span className="text-sm font-semibold text-white mr-1">{value}</span>
        {open ? (
          <ChevronDown size={14} className="text-zinc-600 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="pb-3 pl-5">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/progress/SparklineSVG.jsx`**

```jsx
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
```

- [ ] **Step 3: Smoke test in browser**

Expected: ExpandableRow shows chevron, clicking expands children. SparklineSVG renders a line graph.

- [ ] **Step 4: Commit**

```bash
git add src/components/progress/ExpandableRow.jsx src/components/progress/SparklineSVG.jsx
git commit -m "feat: add ExpandableRow and SparklineSVG components"
```

---

## Task 6: Progress.jsx — Section 1 (Outcomes)

**Files:**
- Modify: `src/components/Progress.jsx` (full rewrite)

**Interfaces:**
- Consumes from Task 1: `getGoalConfig`, `buildBodyFatSeries`, `buildLeanMassSeries`, `buildWaistSeries`, `buildWeightSeries`, `forecastToTarget`
- Consumes from Task 2: `<CompositionRing>`
- Consumes from Task 3: `<ForecastChart>`
- Consumes from Task 4: `<InfoToggle>`
- Consumes from Task 5: `<ExpandableRow>`, `<SparklineSVG>`

Replace the entire contents of `src/components/Progress.jsx` with the following. Tasks 7 and 8 will add the Drivers and Records sections in later steps — this task renders Section 1 only, with `{/* Section 2 placeholder */}` and `{/* Section 3 placeholder */}` stubs.

- [ ] **Step 1: Rewrite Progress.jsx with Section 1 (Outcomes)**

```jsx
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
  const { weightHistory } = useWeightHistory();
  const { profile } = useUserProfile();
  const { entries: measurementEntries } = useMeasurementHistory();
  const { logs: nutritionLogs } = useNutritionLogs();
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
```

- [ ] **Step 2: Run dev server and verify Section 1 renders**

```bash
npm run dev
```

Open http://localhost:5173, navigate to Progress tab. Verify:
- Composition ring renders with two arcs
- Forecast chart renders (may show "Not enough data" — that's correct)
- Four sub-metric rows are visible and expandable
- No console errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Progress.jsx src/components/progress/
git commit -m "feat: Progress tab Section 1 — Outcomes with composition ring, forecast chart, and sub-metric expandables"
```

---

## Task 7: Progress.jsx — Section 2 (Drivers)

**Files:**
- Modify: `src/components/Progress.jsx`

**Interfaces:**
- Consumes from Task 1: `calcWeeklyVolumes`, `calcWorkoutAdherence`, `calcProteinAdherence`, `calcCalorieAdherence`
- Consumes from Task 4: `<ScoreRing>`, `<InfoToggle>`
- Consumes from Task 5: `<ExpandableRow>`

Replace `{/* ── Section 2 placeholder ── */}` with the full Drivers section.

- [ ] **Step 1: Add driver data computation to Progress.jsx**

Add these computed values inside the `Progress` function body, before the `return`:

```jsx
  // ── Drivers computation ──────────────────────────────────────────────────
  const workoutAdherence = useMemo(
    () => calcWorkoutAdherence(workoutLogs, 7),
    [workoutLogs],
  );

  const proteinMin = profile?.proteinTarget?.min ?? 0;
  const proteinAdherence = useMemo(
    () => calcProteinAdherence(nutritionLogs, proteinMin, 7),
    [nutritionLogs, proteinMin],
  );

  const calorieTarget = profile?.calorieTarget ?? { min: null, max: null };
  const calorieAdherence = useMemo(
    () => calcCalorieAdherence(nutritionLogs, calorieTarget, 7, intent),
    [nutritionLogs, calorieTarget, intent],
  );

  const weeklyVolumes = useMemo(() => calcWeeklyVolumes(workoutLogs, 8), [workoutLogs]);
  const thisWeekVol = weeklyVolumes[weeklyVolumes.length - 1]?.volume ?? 0;
  const lastWeekVol = weeklyVolumes[weeklyVolumes.length - 2]?.volume ?? 0;
  const volumeChangePct = lastWeekVol > 0
    ? Math.round(((thisWeekVol - lastWeekVol) / lastWeekVol) * 100)
    : null;

  // Volume ring: treat % change as a score. +10% = full ring. cap at ±10%.
  const volumeRingValue = Math.max(0, Math.min(10, (volumeChangePct ?? 0) + 5));
  const volumeDisplayVal = volumeChangePct != null
    ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}%`
    : '--';
```

- [ ] **Step 2: Add Chart.js bar data helpers**

Add these helper functions after the computation block (still inside the component or extract above):

```jsx
  const chartBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, beginAtZero: true },
    },
  };

  function buildProteinBars() {
    const results = proteinAdherence.results.slice(-14).reverse();
    return {
      labels: results.map((r) => r.date),
      datasets: [{
        data: results.map((r) => r.value),
        backgroundColor: results.map((r) => r.hit ? '#60a5fa' : '#78350f'),
        borderRadius: 3,
      }],
    };
  }

  function buildCalorieBars() {
    const results = calorieAdherence.results.slice(-14).reverse();
    return {
      labels: results.map((r) => r.date),
      datasets: [{
        data: results.map((r) => r.value),
        backgroundColor: results.map((r) => r.hit ? '#4ade80' : '#7f1d1d'),
        borderRadius: 3,
      }],
    };
  }

  function buildVolumeLineData() {
    return {
      labels: weeklyVolumes.map((w) => w.weekStart),
      datasets: [{
        data: weeklyVolumes.map((w) => w.volume),
        borderColor: '#c084fc',
        backgroundColor: 'rgba(192,132,252,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#c084fc',
      }],
    };
  }
```

- [ ] **Step 3: Replace Section 2 placeholder with Drivers JSX**

Replace `{/* ── Section 2 placeholder — added in Task 7 ── */}` with:

```jsx
      {/* ── Section 2: Drivers ── */}
      <section>
        <SectionHeading label="Drivers" infoColor="#4ade80">
          <strong>What's making it happen?</strong> Four metrics that drive your results.
          <br /><br />
          <strong>Workouts:</strong> days you completed a logged session in the last 7 days.<br />
          <strong>Protein:</strong> days you hit your minimum protein target ({proteinMin}g).<br />
          <strong>{goalConfig.calorieRingLabel}:</strong> {
            intent === 'cut' ? `days under your max calorie target (${calorieTarget.max} kcal).`
            : intent === 'bulk' ? `days hitting your calorie minimum (${calorieTarget.min} kcal).`
            : `days within your calorie range (${calorieTarget.min}–${calorieTarget.max} kcal).`
          }<br />
          <strong>Volume:</strong> weekly training volume load (sets × reps × kg) vs last week.
        </SectionHeading>

        {/* Score rings */}
        <Card className="mb-3">
          <div className="grid grid-cols-4 gap-2">
            <ScoreRing
              value={workoutAdherence.daysHit}
              max={7}
              displayValue={`${workoutAdherence.daysHit}/7`}
              label="Workouts"
              color="#4ade80"
            />
            <ScoreRing
              value={proteinAdherence.daysHit}
              max={7}
              displayValue={`${proteinAdherence.daysHit}/7`}
              label="Protein"
              color="#60a5fa"
            />
            <ScoreRing
              value={calorieAdherence.daysHit}
              max={7}
              displayValue={`${calorieAdherence.daysHit}/7`}
              label={goalConfig.calorieRingLabel}
              color={goalConfig.calorieRingColor}
            />
            <ScoreRing
              value={volumeRingValue}
              max={10}
              displayValue={volumeDisplayVal}
              label="Volume"
              color="#c084fc"
            />
          </div>
        </Card>

        {/* Driver expandables */}
        <Card>
          <div className="text-sm font-medium text-zinc-300 mb-2">Detail — last 14 days</div>
          <div className="divide-y divide-zinc-800">

            {/* Workouts */}
            <ExpandableRow
              dotColor="#4ade80"
              label="Workouts"
              value={`${workoutAdherence.daysHit}/7 days`}
            >
              {/* 30-day dot grid */}
              <div className="flex flex-wrap gap-1 py-1">
                {workoutAdherence.results.map((r) => (
                  <span
                    key={r.date}
                    className="w-3 h-3 rounded-sm"
                    style={{ background: r.completed ? '#4ade80' : '#2a2a2a' }}
                    title={r.date}
                  />
                ))}
              </div>
            </ExpandableRow>

            {/* Protein */}
            <ExpandableRow
              dotColor="#60a5fa"
              label="Protein"
              value={`${proteinAdherence.daysHit}/7 days`}
            >
              <div style={{ height: 60 }}>
                <Bar data={buildProteinBars()} options={chartBarOptions} />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Blue = hit target ({proteinMin}g+), amber = missed</p>
            </ExpandableRow>

            {/* Calories */}
            <ExpandableRow
              dotColor={goalConfig.calorieRingColor}
              label={goalConfig.calorieRingLabel}
              value={`${calorieAdherence.daysHit}/7 days`}
            >
              <div style={{ height: 60 }}>
                <Bar data={buildCalorieBars()} options={chartBarOptions} />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                {intent === 'cut'
                  ? `Green = under ${calorieTarget.max} kcal, red = over`
                  : intent === 'bulk'
                  ? `Green = over ${calorieTarget.min} kcal, red = under`
                  : `Green = within range, red = outside`}
              </p>
            </ExpandableRow>

            {/* Volume */}
            <ExpandableRow
              dotColor="#c084fc"
              label="Volume load"
              value={thisWeekVol.toLocaleString() + ' kg'}
              change={volumeChangePct != null ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}%` : undefined}
              changePositive={volumeChangePct != null ? volumeChangePct > 0 : undefined}
            >
              <div style={{ height: 60 }}>
                <Line
                  data={buildVolumeLineData()}
                  options={{
                    ...chartBarOptions,
                    scales: {
                      x: { display: false },
                      y: { display: false },
                    },
                  }}
                />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Weekly volume load (sets × reps × kg). Rising trend = progressive overload.</p>
            </ExpandableRow>

          </div>
        </Card>
      </section>
```

- [ ] **Step 4: Verify Section 2 renders in browser**

Navigate to Progress tab. Verify:
- Four score rings visible with correct colours
- Workouts, Protein, Calories, Volume rows expandable
- Bar charts render inside driver expandables
- Volume value shows `X,XXX kg` format
- No console errors

- [ ] **Step 5: Commit**

```bash
git add src/components/Progress.jsx
git commit -m "feat: Progress tab Section 2 — Drivers with score rings and driver expandables"
```

---

## Task 8: Progress.jsx — Section 3 (Records)

**Files:**
- Modify: `src/components/Progress.jsx`

**Interfaces:**
- Consumes from Task 1: `getExercisePRs`, `estimateOneRepMax`
- Consumes from Task 4: `<InfoToggle>`

Replace `{/* ── Section 3 placeholder — added in Task 8 ── */}` with the Records section.

- [ ] **Step 1: Add PR computation to Progress.jsx**

Add inside the component function before the `return`:

```jsx
  // ── Records computation ───────────────────────────────────────────────────
  const exercisePRs = useMemo(
    () => getExercisePRs(workoutLogs, EXERCISE_LIBRARY),
    [workoutLogs],
  );

  const CATEGORY_ORDER = ['push', 'pull', 'legs', 'core', 'cardio', 'other'];

  const prsByCategory = useMemo(() => {
    const groups = {};
    Object.entries(exercisePRs).forEach(([name, pr]) => {
      const cat = pr.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ name, ...pr });
    });
    // Sort each category by PR weight descending
    Object.values(groups).forEach((arr) => arr.sort((a, b) => b.weight - a.weight));
    return groups;
  }, [exercisePRs]);
```

- [ ] **Step 2: Replace Section 3 placeholder with Records JSX**

Replace `{/* ── Section 3 placeholder — added in Task 8 ── */}` with:

```jsx
      {/* ── Section 3: Records ── */}
      <section>
        <SectionHeading label="Records" infoColor="#fbbf24">
          <strong>How strong am I?</strong> Personal records from your completed workout logs.
          <br /><br />
          <strong>PR weight:</strong> the heaviest set you've logged for each exercise.<br />
          <strong>Est. 1RM:</strong> estimated one-rep maximum using the Epley formula
          (weight × (1 + reps ÷ 30)). Not shown when the PR was a single rep — that weight
          IS your 1RM.
        </SectionHeading>

        <Card>
          {CATEGORY_ORDER.filter((cat) => prsByCategory[cat]?.length > 0).map((cat) => (
            <div key={cat} className="mb-4 last:mb-0">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 capitalize">
                {cat}
              </div>
              <div className="space-y-2">
                {prsByCategory[cat].map((pr) => (
                  <div key={pr.name} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{pr.name}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-green-400">{pr.weight} kg</span>
                      {pr.estimatedOneRM && (
                        <span className="text-xs text-zinc-500 ml-2">
                          est. 1RM {pr.estimatedOneRM.toFixed(0)} kg
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(prsByCategory).length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-4">
              No records yet — complete a workout to see your PRs here.
            </p>
          )}
        </Card>
      </section>
```

- [ ] **Step 3: Verify full Progress tab in browser**

Navigate to Progress tab. Verify:
- All three sections render without errors
- Records show exercise names with PR weight in green
- Est. 1RM shown in grey beside each exercise where reps > 1
- Empty state shows graceful message when no workouts logged
- Intent change in Settings → `profile.goal.intent` changes ring colours, sub-metric order, calorie ring label
- Sub-metric expandables show sparklines when tapped

- [ ] **Step 4: Commit**

```bash
git add src/components/Progress.jsx
git commit -m "feat: Progress tab Section 3 — Records with Epley estimated 1RM; complete three-section redesign"
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Covered in |
|-----------------|------------|
| Composition ring — two arcs | Task 2, 6 |
| Composition ring — centre label goal-adaptive | Task 6 (centerLabel per goalConfig) |
| Composition ring — stat rows beside ring | Task 2 (stats prop) |
| Forecast chart — historical + projected lines | Task 3, 6 |
| Forecast chart — dual lines for cut (weight + BF%) | Task 6 (secondarySeries) |
| Forecast chart — goal intercept dot + date label | Task 3 |
| Forecast chart — goal badge | Task 3 |
| Forecast chart — maintain shows trend only (no projection) | Task 1 (getGoalConfig), Task 3 (showProjection=false) |
| Sub-metric expandables — colour coded sparklines | Task 5, 6 |
| Sub-metric expandable — BF% has dashed goal line | Task 6 (goalValue on SparklineSVG) |
| Sub-metric — weight note on recomp/bulk | Task 6 (subMetricNotes, weightRowNote in config) |
| Sub-metric order goal-adaptive | Task 1 (getGoalConfig), Task 6 |
| Four score rings — fixed order + colours | Task 4 (ScoreRing), Task 7 |
| Volume ring displays % not fraction | Task 7 (volumeDisplayVal) |
| Volume load skips bodyweight (weight=0) | Task 1 (calcWeeklyVolumes) |
| Calorie ring semantics per intent | Task 1 (calorieRingColor/Label per config), Task 7 |
| Driver expandables — protein bar (hit/miss) | Task 7 |
| Driver expandables — calorie bar (hit/miss) | Task 7 |
| Driver expandables — volume area line | Task 7 |
| Driver expandables — workout dot grid | Task 7 |
| Volume displayed as X,XXX kg with toLocaleString | Task 7 |
| Records — PRs by category | Task 8 |
| Records — Epley 1RM (skip reps=1) | Task 1 (estimateOneRepMax), Task 8 |
| Info tooltips on all sections | Tasks 4, 6, 7, 8 (InfoToggle) |
| Info tooltip — inline toggle, no modal | Task 4 (InfoToggle) |
| Fallback — no target set | Task 3 (showProjection=false branch), Task 6 |
| All weights in kg | Throughout |
| OLED dark theme | Task 6 (Card component, #1a1a1a background) |
| Forecast regression ≥4 points guard | Task 1 (forecastToTarget) |

### 2. Placeholder scan

No "TBD", "TODO", or vague instructions found. All code blocks are complete implementations.

### 3. Type consistency

- `forecastToTarget` returns `{ weeksAway, interceptDate, slope }` — Task 6 uses `primaryForecast?.interceptDate`, `primaryForecast?.weeksAway`, `forecast.slope` ✓
- `getGoalConfig` returns `GoalConfig` with `heroArcs`, `centerLabel`, `forecastMetrics`, `subMetricOrder`, `calorieRingColor`, `calorieRingLabel`, `weightRowNote`, `showForecastProjection` — all used correctly in Task 6 ✓
- `calcWorkoutAdherence` returns `{ daysHit, results: [{date, completed}] }` — Task 7 uses `workoutAdherence.daysHit` and `workoutAdherence.results` ✓
- `getExercisePRs` returns `{ [name]: { weight, reps, date, estimatedOneRM, category } }` — Task 8 uses `pr.weight`, `pr.estimatedOneRM`, `pr.category` ✓
- `ForecastChart` takes `primarySeries: { historical, projected, color, goalValue, interceptDate, weeksToGoal }` — Task 6 builds this shape ✓

---

Plan complete and saved to `docs/superpowers/plans/2026-06-30-progress-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

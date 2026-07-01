import { calculateBodyFatNavy, calculateLeanMass } from './calculations';
import { format, startOfWeek, subWeeks, parseISO } from 'date-fns';

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
  if (recent.length < 3) return null;

  const sorted = [...recent].sort((a, b) => new Date(a.date) - new Date(b.date));
  const base = new Date(sorted[0].date).getTime();
  const points = sorted.map((p) => ({
    x: (new Date(p.date).getTime() - base) / 86400000,
    y: p.value,
  }));

  const reg = linearRegression(points);
  if (!reg || reg.slope === 0) return null;

  const currentValue = recent[recent.length - 1].value;
  const movingToward = reg.slope < 0 ? targetValue < currentValue : targetValue > currentValue;
  if (!movingToward) return null;

  const todayOffset = (Date.now() - base) / 86400000;
  const interceptDay = (targetValue - reg.intercept) / reg.slope;
  const daysAway = interceptDay - todayOffset;
  if (daysAway < 0) return null;

  return {
    weeksAway: Math.ceil(daysAway / 7),
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
      const navy = calculateBodyFatNavy(
        profile.gender,
        profile.height,
        e.waist ?? profile.waistCircumference,
        e.neck ?? profile.neckCircumference,
        e.hip ?? profile.hipCircumference,
      );
      const bf =
        navy && navy > 0 && navy < 60 ? navy
        : e.bodyFatManual && e.bodyFatManual > 0 && e.bodyFatManual < 60 ? e.bodyFatManual
        : null;
      return bf ? { date: e.date, value: bf } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildLeanMassSeries(weightEntries, measurementEntries, profile) {
  const bfByDate = {};
  buildBodyFatSeries(measurementEntries, profile).forEach((p) => {
    bfByDate[p.date] = p.value;
  });

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
            if (w === 0) return setAcc;
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

  const bests = {};

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

function lastNDates(daysBack) {
  const dates = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(Date.now() - i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function calcWorkoutAdherence(workoutLogs, daysBack) {
  const dates = lastNDates(daysBack);
  const completedDates = new Set(
    workoutLogs
      .filter((l) => l.completedAt)
      .map((l) => l.date),
  );
  const results = dates.map((date) => ({ date, completed: completedDates.has(date) }));
  return { daysHit: results.filter((r) => r.completed).length, results };
}

function getDailyNutritionTotals(nutritionLogs, daysBack) {
  const dates = lastNDates(daysBack);
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

// ── Consistency (rolling 7-day, tracked over 30 days) ───────────────────────

function lastNDatesAsc(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 86400000).toISOString().split('T')[0]);
  }
  return dates;
}

// Oldest→newest daily hit series. A day with no logged food counts as a miss.
export function workoutDailyHits(workoutLogs, days) {
  const completed = new Set(workoutLogs.filter((l) => l.completedAt).map((l) => l.date));
  return lastNDatesAsc(days).map((date) => ({ date, hit: completed.has(date) }));
}

function nutritionByDate(nutritionLogs, field) {
  const byDate = {};
  nutritionLogs.forEach((meal) => {
    const date = meal.timestamp.split('T')[0];
    byDate[date] = (byDate[date] || 0) + (Number(meal.totals?.[field]) || 0);
    byDate[date + '_logged'] = true;
  });
  return byDate;
}

export function proteinDailyHits(nutritionLogs, proteinMin, days) {
  const byDate = nutritionByDate(nutritionLogs, 'protein');
  return lastNDatesAsc(days).map((date) => ({
    date,
    hit: !!byDate[date + '_logged'] && (byDate[date] || 0) >= proteinMin,
  }));
}

export function calorieDailyHits(nutritionLogs, calorieTarget, intent, days) {
  const byDate = nutritionByDate(nutritionLogs, 'calories');
  const { min, max } = calorieTarget || {};
  return lastNDatesAsc(days).map((date) => {
    const logged = !!byDate[date + '_logged'];
    const cals = byDate[date] || 0;
    let hit = false;
    if (logged) {
      if (intent === 'cut') hit = max != null && cals <= max;
      else if (intent === 'bulk') hit = min != null && cals >= min;
      else hit = min != null && max != null && cals >= min && cals <= max;
    }
    return { date, hit };
  });
}

// Rolling `window`-day hit rate (0-100%), evaluated across the last `span` days.
// Returns the current score, the change vs `span` days ago, and the rolling
// series (for the detail sparkline). `daily` must be oldest→newest and span at
// least `span + window` days for a trend to be available.
export function rollingConsistency(daily, window = 7, span = 30) {
  const n = daily.length;
  if (n === 0) return { score: 0, trend: null, series: [] };

  const rateAt = (endIdx) => {
    let hits = 0;
    for (let i = endIdx - window + 1; i <= endIdx; i++) {
      if (i >= 0 && daily[i].hit) hits += 1;
    }
    return (hits / window) * 100;
  };

  const series = [];
  const startIdx = Math.max(window - 1, n - span);
  for (let i = startIdx; i < n; i++) {
    series.push({ date: daily[i].date, value: rateAt(i) });
  }

  const score = rateAt(n - 1);
  const priorIdx = n - 1 - span;
  const trend = priorIdx >= window - 1 ? score - rateAt(priorIdx) : null;
  return { score, trend, series };
}

// Percentage of days hit this calendar month vs the previous one. Null until
// two calendar months of data exist.
export function monthlyConsistencyChange(daily) {
  const byMonth = {};
  daily.forEach((d) => {
    const m = d.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { hits: 0, days: 0 };
    byMonth[m].days += 1;
    if (d.hit) byMonth[m].hits += 1;
  });
  const months = Object.keys(byMonth).sort();
  if (months.length < 2) return null;
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const pct = (m) => (byMonth[m].hits / byMonth[m].days) * 100;
  return { month: cur, delta: pct(cur) - pct(prev), currentPct: pct(cur), prevPct: pct(prev) };
}

// Total volume load (sets × reps × kg, bodyweight skipped) in [startTs, endTs).
export function volumeLoadInRange(workoutLogs, startTs, endTs) {
  return workoutLogs
    .filter((l) => l.completedAt)
    .filter((l) => {
      const t = parseISO(l.date).getTime();
      return t >= startTs && t < endTs;
    })
    .reduce((total, log) => {
      const exTotal = (log.exercises || []).reduce((exAcc, ex) => {
        const sets = ex.actual?.sets || [];
        const weights = ex.actual?.weight || [];
        const reps = ex.actual?.reps || [];
        return exAcc + sets.reduce((setAcc, done, i) => {
          if (!done) return setAcc;
          const w = Number(weights[i]) || 0;
          const r = Number(reps[i]) || 0;
          return w === 0 ? setAcc : setAcc + w * r;
        }, 0);
      }, 0);
      return total + exTotal;
    }, 0);
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

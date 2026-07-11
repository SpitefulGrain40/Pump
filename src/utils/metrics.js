import { calculateBodyFatNavy, resolveBodyFat } from './calculations';

const byDateAsc = (a, b) => new Date(a.date) - new Date(b.date);

// --- weight ---
const weight = {
  key: 'weight',
  label: 'Weight',
  unit: 'kg',
  supportsTarget: true,
  getCurrent(_profile, { weightHistory = [] } = {}) {
    if (weightHistory.length === 0) return null;
    return [...weightHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0].weight;
  },
  getSeries(_profile, { weightHistory = [] } = {}) {
    return [...weightHistory].sort(byDateAsc).map(e => ({ date: e.date, value: e.weight }));
  },
  goodDirection(intent) {
    return intent === 'bulk' ? 'up' : 'down';
  },
};

// --- waist ---
const waist = {
  key: 'waist',
  label: 'Waist',
  unit: 'cm',
  supportsTarget: true,
  getCurrent(profile, { measurementHistory = [] } = {}) {
    // Most recent snapshot that actually has a waist value (consistent with
    // getSeries, which filters out null-waist entries). Falls back to the
    // profile's current waist only when no snapshot has one.
    const withWaist = [...measurementHistory]
      .filter(e => e.waist != null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return withWaist[0]?.waist ?? profile?.waistCircumference ?? null;
  },
  getSeries(_profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .filter(e => e.waist != null)
      .sort(byDateAsc)
      .map(e => ({ date: e.date, value: e.waist }));
  },
  goodDirection() {
    return 'down';
  },
};

// Navy body fat for one snapshot. Deliberately Navy-only (ignores any manual
// reading on the same snapshot) — Navy is the consistent trend baseline, so
// blending in an occasional DEXA/manual reading would make an ordinary
// change of measurement method look like a real body-composition jump. See
// bodyfat.getManualSeries below for surfacing manual readings separately.
const navyValueFor = (profile, snap) =>
  calculateBodyFatNavy(profile.gender, profile.height, snap.waist, snap.neck, snap.hip);

// Navy body fat % as of `date`: the most recent snapshot at-or-before it
// that has waist+neck, else the profile's own resolved body fat.
const bodyfatForDate = (profile, measurementHistory, date) => {
  const priorSnaps = [...measurementHistory]
    .filter(s => new Date(s.date) <= new Date(date) && s.waist != null && s.neck != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (priorSnaps.length) {
    const v = navyValueFor(profile, priorSnaps[0]);
    if (v != null) return v;
  }
  return resolveBodyFat(profile, measurementHistory).value;
};

// --- bodyfat (Navy trend; manual/DEXA readings are a separate reference series) ---
const bodyfat = {
  key: 'bodyfat',
  label: 'Body Fat',
  unit: '%',
  supportsTarget: true,
  getCurrent(profile, { measurementHistory = [] } = {}) {
    return resolveBodyFat(profile, measurementHistory).value;
  },
  getSeries(profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .filter(snap => snap.waist != null && snap.neck != null)
      .sort(byDateAsc)
      .map(snap => ({ date: snap.date, value: navyValueFor(profile, snap) }))
      .filter(p => p.value != null && p.value > 0 && p.value < 60);
  },
  // Manual/DEXA readings as their own series, meant to be plotted as markers
  // alongside the Navy trend line (not merged into it) — lets you see the
  // delta between the two methods without disrupting trend consistency.
  getManualSeries(_profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .filter(snap => snap.bodyFatManual != null)
      .sort(byDateAsc)
      .map(snap => ({ date: snap.date, value: snap.bodyFatManual }));
  },
  goodDirection() {
    return 'down';
  },
};

// --- strength (trend-only; top lifts progression) ---
const strength = {
  key: 'strength',
  label: 'Strength',
  unit: 'kg',
  supportsTarget: false,
  // Current = sum of the heaviest 3 PRs (a simple aggregate "strength score").
  getCurrent(_profile, { prs = {} } = {}) {
    const tops = Object.values(prs)
      .map(p => Number(p?.weight))
      .filter(w => Number.isFinite(w) && w > 0)
      .sort((a, b) => b - a)
      .slice(0, 3);
    if (tops.length === 0) return null;
    return tops.reduce((a, b) => a + b, 0);
  },
  // Series = heaviest PR per day (one point per date) so the trend reads as a
  // single upward line rather than a scatter of every lift's PR.
  getSeries(_profile, { prs = {} } = {}) {
    const maxByDate = new Map();
    for (const p of Object.values(prs)) {
      const w = Number(p?.weight);
      if (!p?.date || !Number.isFinite(w)) continue;
      const date = String(p.date).split('T')[0];
      if (!maxByDate.has(date) || w > maxByDate.get(date)) maxByDate.set(date, w);
    }
    return [...maxByDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort(byDateAsc);
  },
  goodDirection() {
    return 'up';
  },
};

// --- lean mass (weight x (1 - bodyfat%)). Needs body fat to be meaningful. ---
const leanmass = {
  key: 'leanmass',
  label: 'Lean Mass',
  unit: 'kg',
  supportsTarget: true,
  getCurrent(profile, { weightHistory = [], measurementHistory = [] } = {}) {
    const latestW = [...weightHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const weight = latestW?.weight ?? profile?.currentWeight ?? null;
    if (weight == null) return null;
    const bf = bodyfatForDate(profile, measurementHistory, latestW?.date ?? new Date().toISOString());
    if (bf == null) return null;
    return Math.round(weight * (1 - bf / 100) * 10) / 10;
  },
  getSeries(profile, { weightHistory = [], measurementHistory = [] } = {}) {
    return [...weightHistory]
      .sort(byDateAsc)
      .map(e => {
        const bf = bodyfatForDate(profile, measurementHistory, e.date);
        if (bf == null) return null;
        return { date: e.date, value: Math.round(e.weight * (1 - bf / 100) * 10) / 10 };
      })
      .filter(Boolean);
  },
  goodDirection() { return 'up'; },
};

export const METRICS = { weight, leanmass, bodyfat, waist, strength };

export function getMetric(key) {
  return METRICS[key] || METRICS.weight;
}

// Aligns a primary series with an optional reference series (e.g. Navy trend
// + DEXA/manual markers) onto one shared, date-sorted label set, so a chart
// can plot both without requiring every date to have both values. Gaps in
// either series become `null` at that index (Chart.js renders no point
// there; use spanGaps on the primary line so it doesn't visually break).
export function alignSeriesWithReference(series, referenceSeries = []) {
  if (!referenceSeries.length) {
    return { dates: series.map(p => p.date), seriesData: series.map(p => p.value), referenceData: null };
  }
  const dates = [...new Set([...series.map(p => p.date), ...referenceSeries.map(p => p.date)])]
    .sort((a, b) => new Date(a) - new Date(b));
  const valueForDate = (points, date) => points.find(p => p.date === date)?.value ?? null;
  return {
    dates,
    seriesData: dates.map(d => valueForDate(series, d)),
    referenceData: dates.map(d => valueForDate(referenceSeries, d)),
  };
}

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

// Body fat for one snapshot: prefer a manual entry, else compute via Navy.
// Module-level (not a `this`-bound method) so descriptor methods stay safe to
// destructure or pass around.
const bodyfatValueFor = (profile, snap) => {
  if (snap.bodyFatManual != null) return snap.bodyFatManual;
  return calculateBodyFatNavy(profile.gender, profile.height, snap.waist, snap.neck, snap.hip);
};

// Body fat % for a given date: the most recent snapshot at-or-before `date`
// that yields a value, else the profile's current resolved body fat.
const bodyfatForDate = (profile, measurementHistory, date) => {
  const priorSnaps = [...measurementHistory]
    .filter(s => new Date(s.date) <= new Date(date))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const snap of priorSnaps) {
    const v = bodyfatValueFor(profile, snap);
    if (v != null) return v;
  }
  return resolveBodyFat(profile).value;
};

// --- bodyfat (Navy per snapshot, manual overrides when present) ---
const bodyfat = {
  key: 'bodyfat',
  label: 'Body Fat',
  unit: '%',
  supportsTarget: true,
  getCurrent(profile, { measurementHistory = [] } = {}) {
    const sorted = [...measurementHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const snap of sorted) {
      const v = bodyfatValueFor(profile, snap);
      if (v != null) return v;
    }
    return null;
  },
  getSeries(profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .sort(byDateAsc)
      .map(snap => ({ date: snap.date, value: bodyfatValueFor(profile, snap) }))
      .filter(p => p.value != null);
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

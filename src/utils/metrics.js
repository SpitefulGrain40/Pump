import { calculateBodyFatNavy } from './calculations';

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
    const latest = [...measurementHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return latest?.waist ?? profile?.waistCircumference ?? null;
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

// --- bodyfat (Navy per snapshot, manual overrides when present) ---
const bodyfat = {
  key: 'bodyfat',
  label: 'Body Fat',
  unit: '%',
  supportsTarget: true,
  _valueFor(profile, snap) {
    if (snap.bodyFatManual != null) return snap.bodyFatManual;
    return calculateBodyFatNavy(profile.gender, profile.height, snap.waist, snap.neck, snap.hip);
  },
  getCurrent(profile, { measurementHistory = [] } = {}) {
    const sorted = [...measurementHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const snap of sorted) {
      const v = this._valueFor(profile, snap);
      if (v != null) return v;
    }
    return null;
  },
  getSeries(profile, { measurementHistory = [] } = {}) {
    return [...measurementHistory]
      .sort(byDateAsc)
      .map(snap => ({ date: snap.date, value: this._valueFor(profile, snap) }))
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
  // Series = the heaviest single PR by date (proxy for "are lifts going up").
  getSeries(_profile, { prs = {} } = {}) {
    return Object.values(prs)
      .filter(p => p?.date && Number.isFinite(Number(p.weight)))
      .map(p => ({ date: String(p.date).split('T')[0], value: Number(p.weight) }))
      .sort(byDateAsc);
  },
  goodDirection() {
    return 'up';
  },
};

export const METRICS = { weight, bodyfat, waist, strength };

export function getMetric(key) {
  return METRICS[key] || METRICS.weight;
}

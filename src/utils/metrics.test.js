import { describe, it, expect } from 'vitest';
import { METRICS, getMetric } from './metrics';

const profile = { gender: 'male', height: 180, waistCircumference: 88, neckCircumference: 40 };

const weightHistory = [
  { date: '2026-01-01', weight: 100 },
  { date: '2026-01-08', weight: 98 },
];

const measurementHistory = [
  { date: '2026-01-01', waist: 90, neck: 40, hip: null, bodyFatManual: null },
  { date: '2026-01-08', waist: 88, neck: 40, hip: null, bodyFatManual: null },
];

describe('weight descriptor', () => {
  it('current = latest weight', () => {
    expect(getMetric('weight').getCurrent(profile, { weightHistory })).toBe(98);
  });
  it('series sorted ascending by date', () => {
    const s = getMetric('weight').getSeries(profile, { weightHistory });
    expect(s.map(p => p.value)).toEqual([100, 98]);
  });
});

describe('waist descriptor', () => {
  it('current = latest waist snapshot', () => {
    expect(getMetric('waist').getCurrent(profile, { measurementHistory })).toBe(88);
  });
});

describe('bodyfat descriptor', () => {
  it('computes a series via Navy from measurement snapshots', () => {
    const s = getMetric('bodyfat').getSeries(profile, { measurementHistory });
    expect(s.length).toBe(2);
    // body fat should fall as waist falls
    expect(s[1].value).toBeLessThan(s[0].value);
  });
});

describe('bodyfat: Navy stays the trend baseline, manual is a separate series', () => {
  it('Navy stays the displayed value even when the same snapshot has a manual reading', () => {
    // Trend-consistency design: blending manual/DEXA into the tracked number
    // would make an ordinary change of measurement method look like a real
    // body-composition jump. See getManualSeries for the separate reference.
    const hist = [{ date: '2026-02-01', waist: 88, neck: 40, hip: null, bodyFatManual: 12.5 }];
    const current = getMetric('bodyfat').getCurrent(profile, { measurementHistory: hist });
    expect(current).not.toBe(12.5);
    expect(current).toBeCloseTo(16.9, 1);
  });

  it('getManualSeries exposes manual/DEXA readings as their own series', () => {
    const hist = [
      { date: '2026-01-01', waist: 90, neck: 40, hip: null, bodyFatManual: null },
      { date: '2026-02-01', waist: 88, neck: 40, hip: null, bodyFatManual: 12.5 },
    ];
    const manual = getMetric('bodyfat').getManualSeries(profile, { measurementHistory: hist });
    expect(manual).toEqual([{ date: '2026-02-01', value: 12.5 }]);
  });
});

describe('strength descriptor', () => {
  const prs = {
    Bench: { weight: 100, date: '2026-01-01' },
    Squat: { weight: 140, date: '2026-01-05' },
    Deadlift: { weight: 180, date: '2026-01-05' },
    Row: { weight: 80, date: '2026-01-10' },
  };
  it('current = sum of the heaviest 3 PRs', () => {
    expect(getMetric('strength').getCurrent(profile, { prs })).toBe(180 + 140 + 100);
  });
  it('current = sum of fewer than 3 when that is all there is', () => {
    expect(getMetric('strength').getCurrent(profile, { prs: { A: { weight: 50, date: '2026-01-01' } } })).toBe(50);
  });
  it('current = null with no PRs', () => {
    expect(getMetric('strength').getCurrent(profile, { prs: {} })).toBeNull();
  });
  it('ignores non-numeric PR weights', () => {
    const bad = { A: { weight: 'x', date: '2026-01-01' }, B: { weight: 60, date: '2026-01-02' } };
    expect(getMetric('strength').getCurrent(profile, { prs: bad })).toBe(60);
  });
  it('series has one max point per date, sorted ascending', () => {
    const s = getMetric('strength').getSeries(profile, { prs });
    expect(s).toEqual([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-05', value: 180 },
      { date: '2026-01-10', value: 80 },
    ]);
  });
});

describe('leanmass descriptor', () => {
  it('current = weight * (1 - bodyfat/100), using Navy (not a same-date manual reading)', () => {
    // Lean mass follows the same trend-consistency rule as bodyfat itself —
    // Navy stays the source throughout, a manual reading on the same
    // snapshot doesn't swap it out mid-calculation.
    const weightHistory = [{ date: '2026-02-01', weight: 100 }];
    const measurementHistory = [{ date: '2026-02-01', waist: 88, neck: 40, hip: null, bodyFatManual: 20 }];
    expect(getMetric('leanmass').getCurrent(profile, { weightHistory, measurementHistory })).toBeCloseTo(83.1, 1);
  });
  it('returns null when no body fat is available', () => {
    const weightHistory = [{ date: '2026-02-01', weight: 100 }];
    expect(getMetric('leanmass').getCurrent({ gender: 'male' }, { weightHistory, measurementHistory: [] })).toBeNull();
  });
  it('supportsTarget is true', () => {
    expect(getMetric('leanmass').supportsTarget).toBe(true);
  });
});

describe('registry', () => {
  it('weight/bodyfat/waist support targets, strength does not', () => {
    expect(getMetric('weight').supportsTarget).toBe(true);
    expect(getMetric('bodyfat').supportsTarget).toBe(true);
    expect(getMetric('waist').supportsTarget).toBe(true);
    expect(getMetric('strength').supportsTarget).toBe(false);
  });
  it('exposes all five metrics', () => {
    expect(Object.keys(METRICS).sort()).toEqual(['bodyfat', 'leanmass', 'strength', 'waist', 'weight']);
  });
});

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

describe('bodyfat manual override', () => {
  it('prefers a snapshot bodyFatManual over the Navy computation', () => {
    const hist = [{ date: '2026-02-01', waist: 88, neck: 40, hip: null, bodyFatManual: 12.5 }];
    expect(getMetric('bodyfat').getCurrent(profile, { measurementHistory: hist })).toBe(12.5);
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

describe('registry', () => {
  it('weight/bodyfat/waist support targets, strength does not', () => {
    expect(getMetric('weight').supportsTarget).toBe(true);
    expect(getMetric('bodyfat').supportsTarget).toBe(true);
    expect(getMetric('waist').supportsTarget).toBe(true);
    expect(getMetric('strength').supportsTarget).toBe(false);
  });
  it('exposes all four metrics', () => {
    expect(Object.keys(METRICS).sort()).toEqual(['bodyfat', 'strength', 'waist', 'weight']);
  });
});

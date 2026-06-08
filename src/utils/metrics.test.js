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

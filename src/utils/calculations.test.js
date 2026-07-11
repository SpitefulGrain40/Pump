import { describe, it, expect } from 'vitest';
import { getNavyBodyFat, resolveBodyFat } from './calculations';

const baseProfile = { gender: 'male', height: 180, waistCircumference: 90, neckCircumference: 40 };

describe('getNavyBodyFat', () => {
  it('computes from the profile fields when there is no measurement history (back-compat)', () => {
    expect(getNavyBodyFat(baseProfile)).toBeCloseTo(18.4, 1);
  });

  it('prefers the most recent history snapshot with waist+neck over the profile fields', () => {
    // Regression: profile.waistCircumference/neckCircumference can go stale
    // (updateProfile silently failing to persist was the root cause) while
    // the measurement history log is the actual source of truth.
    const stale = { ...baseProfile, waistCircumference: 90, neckCircumference: 40 };
    const history = [{ date: '2026-07-10', waist: 88, neck: 39 }];
    expect(getNavyBodyFat(stale, history)).toBeCloseTo(17.6, 1);
    expect(getNavyBodyFat(stale, history)).not.toBeCloseTo(getNavyBodyFat(stale), 1);
  });

  it('searches past a manual-only entry to find the most recent one with waist+neck', () => {
    const history = [
      { date: '2026-07-01', waist: 88, neck: 39 },
      { date: '2026-07-10', bodyFatManual: 25 }, // newest, but no waist/neck
    ];
    expect(getNavyBodyFat(baseProfile, history)).toBeCloseTo(17.6, 1);
  });

  it('falls back to the profile entirely when no history entry has BOTH waist and neck', () => {
    // Requires waist+neck together in one snapshot (how measurements are
    // actually logged) rather than mixing fields from different dates.
    const history = [{ date: '2026-07-10', waist: 88 }]; // no neck this snapshot
    expect(getNavyBodyFat(baseProfile, history)).toBeCloseTo(getNavyBodyFat(baseProfile), 1);
  });

  it('returns null when neither history nor the profile has enough data', () => {
    expect(getNavyBodyFat({ gender: 'male', height: 180 })).toBeNull();
  });
});

describe('resolveBodyFat', () => {
  it('prefers Navy computed from the freshest snapshot over stale profile fields', () => {
    const stale = { ...baseProfile, waistCircumference: 90, neckCircumference: 40 };
    const history = [{ date: '2026-07-10', waist: 88, neck: 39 }];
    const r = resolveBodyFat(stale, history);
    expect(r.source).toBe('navy');
    expect(r.value).toBeCloseTo(17.6, 1);
  });

  it('navy stays the displayed value even when a manual reading is logged more recently', () => {
    // Trend-consistency design: Navy is always the baseline number when
    // computable, so a DEXA scan never silently swaps the primary metric's
    // measurement method mid-trend. DEXA/manual readings surface as a
    // separate reference series instead (metrics.js's getManualSeries).
    const history = [
      { date: '2026-06-27', waist: 90, neck: 40 },
      { date: '2026-07-10', bodyFatManual: 22 }, // fresh DEXA, but Navy still wins
    ];
    const r = resolveBodyFat(baseProfile, history);
    expect(r.source).toBe('navy');
  });

  it('falls back to manual only when Navy genuinely cannot be computed', () => {
    const profile = { gender: 'male' }; // no height/waist/neck at all -> Navy impossible
    const history = [{ date: '2026-07-10', bodyFatManual: 22 }];
    const r = resolveBodyFat(profile, history);
    expect(r).toEqual({ value: 22, source: 'manual' });
  });

  it('prefers a manual bodyFatManual on the profile over the legacy field when Navy is unavailable', () => {
    const profile = { gender: 'male', bodyFatManual: 25, bodyFatPercentage: 30 };
    const r = resolveBodyFat(profile, []);
    expect(r).toEqual({ value: 25, source: 'manual' });
  });

  it('still works with just a profile (no history) for back-compat', () => {
    const r = resolveBodyFat(baseProfile);
    expect(r.source).toBe('navy');
  });
});

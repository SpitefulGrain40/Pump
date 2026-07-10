import { describe, it, expect } from 'vitest';
import { getNavyBodyFat, resolveBodyFat } from './calculations';

const baseProfile = { gender: 'male', height: 180, waistCircumference: 90, neckCircumference: 40 };

describe('getNavyBodyFat', () => {
  it('computes from the profile fields when no measurement snapshot is given (back-compat)', () => {
    expect(getNavyBodyFat(baseProfile)).toBeCloseTo(18.4, 1);
  });

  it('prefers a measurement snapshot over the profile fields', () => {
    // Regression: profile.waistCircumference/neckCircumference can go stale
    // (updateProfile silently failing to persist was the root cause) while
    // the measurement history log is the actual source of truth.
    const stale = { ...baseProfile, waistCircumference: 90, neckCircumference: 40 };
    const freshSnapshot = { waist: 88, neck: 39 };
    const fromProfile = getNavyBodyFat(stale);
    const fromSnapshot = getNavyBodyFat(stale, freshSnapshot);
    expect(fromSnapshot).not.toEqual(fromProfile);
    expect(fromSnapshot).toBeCloseTo(17.6, 1);
  });

  it('falls back to a profile field when the snapshot is missing just that one', () => {
    // Snapshot has waist but not neck — neck should fall back to the profile.
    const r = getNavyBodyFat(baseProfile, { waist: 88 });
    expect(r).toBeCloseTo(getNavyBodyFat({ ...baseProfile, waistCircumference: 88 }), 1);
  });

  it('returns null when neither the snapshot nor the profile has enough data', () => {
    expect(getNavyBodyFat({ gender: 'male', height: 180 })).toBeNull();
  });
});

describe('resolveBodyFat', () => {
  it('prefers Navy computed from a fresh snapshot over stale profile fields', () => {
    const stale = { ...baseProfile, waistCircumference: 90, neckCircumference: 40 };
    const r = resolveBodyFat(stale, { waist: 88, neck: 39 });
    expect(r.source).toBe('navy');
    expect(r.value).toBeCloseTo(17.6, 1);
  });

  it('prefers a manual bodyFatManual on the snapshot over the profile\'s own bodyFatManual', () => {
    const profile = { gender: 'male', bodyFatManual: 25 }; // no height/waist/neck -> Navy unavailable
    const r = resolveBodyFat(profile, { bodyFatManual: 20 });
    expect(r).toEqual({ value: 20, source: 'manual' });
  });

  it('still works with just a profile (no snapshot) for back-compat', () => {
    const r = resolveBodyFat(baseProfile);
    expect(r.source).toBe('navy');
  });
});

import { describe, it, expect } from 'vitest';
import { inferIntent, migrateGoal, getGoalProgress } from './goal';

describe('inferIntent', () => {
  it('returns cut when target below current', () => {
    expect(inferIntent(100, 90)).toBe('cut');
  });
  it('returns bulk when target above current', () => {
    expect(inferIntent(80, 90)).toBe('bulk');
  });
  it('returns maintain when equal or missing', () => {
    expect(inferIntent(90, 90)).toBe('maintain');
    expect(inferIntent(90, null)).toBe('maintain');
  });
});

describe('migrateGoal', () => {
  it('leaves an existing goal untouched', () => {
    const goal = { intent: 'bulk', primaryMetric: 'weight', targets: {} };
    const p = { goal };
    expect(migrateGoal(p)).toBe(goal);
  });
  it('builds a weight goal from legacy targetWeight (cut)', () => {
    const p = { currentWeight: 100, targetWeight: 90, targetDate: '2026-09-01' };
    const g = migrateGoal(p);
    expect(g.intent).toBe('cut');
    expect(g.primaryMetric).toBe('weight');
    expect(g.targets.weight).toEqual({ value: 90, date: '2026-09-01' });
  });
  it('defaults to maintain/weight when no legacy target', () => {
    const g = migrateGoal({ currentWeight: 100 });
    expect(g.intent).toBe('maintain');
    expect(g.primaryMetric).toBe('weight');
    expect(g.targets.weight).toEqual({ value: null, date: null });
  });
});

describe('getGoalProgress', () => {
  it('computes percent toward a downward target', () => {
    const r = getGoalProgress({ start: 100, current: 95, target: 90 });
    expect(r.percent).toBe(50);
  });
  it('computes percent toward an upward target', () => {
    const r = getGoalProgress({ start: 80, current: 85, target: 90 });
    expect(r.percent).toBe(50);
  });
  it('clamps to 0..100', () => {
    expect(getGoalProgress({ start: 100, current: 105, target: 90 }).percent).toBe(0);
    expect(getGoalProgress({ start: 100, current: 85, target: 90 }).percent).toBe(100);
  });
  it('returns null percent when target missing', () => {
    expect(getGoalProgress({ start: 100, current: 95, target: null }).percent).toBeNull();
  });
});

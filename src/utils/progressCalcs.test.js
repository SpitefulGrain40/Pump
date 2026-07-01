import { describe, it, expect } from 'vitest';
import {
  linearRegression,
  forecastToTarget,
  estimateOneRepMax,
  calcWeeklyVolumes,
  calcWorkoutAdherence,
  calcProteinAdherence,
  calcCalorieAdherence,
  getGoalConfig,
  buildWeightSeries,
  buildWaistSeries,
} from './progressCalcs';

describe('linearRegression', () => {
  it('returns correct slope and intercept', () => {
    const r = linearRegression([{x:0,y:0},{x:1,y:2},{x:2,y:4}]);
    expect(r.slope).toBeCloseTo(2);
    expect(r.intercept).toBeCloseTo(0);
  });
  it('returns null for fewer than 2 points', () => {
    expect(linearRegression([{x:0,y:1}])).toBeNull();
    expect(linearRegression([])).toBeNull();
  });
});

describe('forecastToTarget', () => {
  it('returns null when fewer than 3 points in last 28 days', () => {
    const today = new Date();
    const series = [
      { date: new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0], value: 20 },
      { date: new Date(today.getTime() - 5 * 86400000).toISOString().split('T')[0], value: 19.5 },
    ];
    expect(forecastToTarget(series, 18)).toBeNull();
  });
  it('projects from exactly 3 points trending toward target', () => {
    const today = new Date();
    const series = Array.from({ length: 3 }, (_, i) => ({
      date: new Date(today.getTime() - (16 - i * 7) * 86400000).toISOString().split('T')[0],
      value: 21 - i * 0.8,  // falling toward 18
    }));
    const result = forecastToTarget(series, 18);
    expect(result).not.toBeNull();
    expect(result.weeksAway).toBeGreaterThan(0);
  });
  it('returns null when slope moves away from target (BF rising when target below)', () => {
    const today = new Date();
    const series = Array.from({length:5},(_,i)=>({
      date: new Date(today.getTime() - (20-i*4)*86400000).toISOString().split('T')[0],
      value: 18 + i * 0.3,  // rising
    }));
    expect(forecastToTarget(series, 18)).toBeNull();
  });
  it('returns weeksAway and interceptDate when trending toward target', () => {
    const today = new Date();
    const series = Array.from({length:6},(_,i)=>({
      date: new Date(today.getTime() - (25-i*4)*86400000).toISOString().split('T')[0],
      value: 22 - i * 0.6,  // falling toward 18
    }));
    const result = forecastToTarget(series, 18);
    expect(result).not.toBeNull();
    expect(result.weeksAway).toBeGreaterThan(0);
    expect(result.interceptDate).toBeInstanceOf(Date);
  });
});

describe('estimateOneRepMax', () => {
  it('returns null for reps === 1', () => {
    expect(estimateOneRepMax(100, 1)).toBeNull();
  });
  it('returns null for weight === 0', () => {
    expect(estimateOneRepMax(0, 10)).toBeNull();
  });
  it('applies Epley formula', () => {
    // 100 * (1 + 10/30) = 100 * 1.333... = 133.3
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.3, 0);
  });
});

describe('calcWeeklyVolumes', () => {
  it('sums sets*reps*weight for completed sets, skips bodyweight', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [{
      date: today,
      completedAt: new Date().toISOString(),
      exercises: [{
        name: 'Bench Press',
        actual: {
          sets: [true, true, false],
          reps: [10, 8, 0],
          weight: [80, 80, 80],
        },
      }, {
        name: 'Plank',
        actual: {
          sets: [true],
          reps: [30],
          weight: [0],  // bodyweight — should be skipped
        },
      }],
    }];
    const vols = calcWeeklyVolumes(logs, 1);
    expect(vols).toHaveLength(1);
    // 10*80 + 8*80 = 800 + 640 = 1440
    expect(vols[0].volume).toBe(1440);
  });
  it('ignores non-completed workouts', () => {
    const today = new Date().toISOString().split('T')[0];
    const logs = [{
      date: today,
      completedAt: null,  // not completed
      exercises: [{name:'Squat', actual:{sets:[true],reps:[5],weight:[100]}}],
    }];
    const vols = calcWeeklyVolumes(logs, 1);
    expect(vols[0].volume).toBe(0);
  });
});

describe('calcWorkoutAdherence', () => {
  it('counts days with at least one completed workout in window', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    const logs = [
      {date: today.toISOString().split('T')[0], completedAt: today.toISOString()},
      {date: yesterday.toISOString().split('T')[0], completedAt: yesterday.toISOString()},
      {date: today.toISOString().split('T')[0], completedAt: null},  // not complete
    ];
    const result = calcWorkoutAdherence(logs, 7);
    expect(result.daysHit).toBe(2);
    expect(result.results).toHaveLength(7);
  });
});

describe('calcProteinAdherence', () => {
  it('counts days where total protein >= proteinMin', () => {
    const today = new Date();
    const d = (offsetDays) => {
      const t = new Date(today.getTime() - offsetDays * 86400000);
      return t.toISOString();
    };
    const logs = [
      {timestamp: d(0), totals: {calories: 2000, protein: 150}},
      {timestamp: d(1), totals: {calories: 1800, protein: 80}},  // miss (min=120)
      {timestamp: d(2), totals: {calories: 2100, protein: 130}},
    ];
    const result = calcProteinAdherence(logs, 120, 7);
    expect(result.daysHit).toBe(2);
  });
});

describe('calcCalorieAdherence', () => {
  it('counts days under max for cut intent', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 1800, protein: 120}},  // hit (under 2200)
      {timestamp: d(1), totals: {calories: 2400, protein: 100}},  // miss (over 2200)
    ];
    const result = calcCalorieAdherence(logs, {min: 1800, max: 2200}, 7, 'cut');
    expect(result.daysHit).toBe(1);
  });
  it('counts days hitting minimum for bulk intent', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 2600, protein: 160}},  // hit (over 2400 min)
      {timestamp: d(1), totals: {calories: 2100, protein: 130}},  // miss (under 2400)
    ];
    const result = calcCalorieAdherence(logs, {min: 2400, max: 2800}, 7, 'bulk');
    expect(result.daysHit).toBe(1);
  });
  it('counts days within range for recomp/maintain', () => {
    const today = new Date();
    const d = (offsetDays) => new Date(today.getTime() - offsetDays * 86400000).toISOString();
    const logs = [
      {timestamp: d(0), totals: {calories: 2100, protein: 140}},  // in range 2000-2200
      {timestamp: d(1), totals: {calories: 1700, protein: 110}},  // below range
      {timestamp: d(2), totals: {calories: 2400, protein: 150}},  // above range
    ];
    const result = calcCalorieAdherence(logs, {min: 2000, max: 2200}, 7, 'recomp');
    expect(result.daysHit).toBe(1);
  });
});

describe('getGoalConfig', () => {
  it('returns recomp config with BF% first in sub-metric order', () => {
    const cfg = getGoalConfig('recomp');
    expect(cfg.subMetricOrder[0]).toBe('bodyfat');
    expect(cfg.calorieRingLabel).toBe('Calories');
    expect(cfg.showForecastProjection).toBe(true);
  });
  it('returns cut config with weight first in sub-metric order', () => {
    const cfg = getGoalConfig('cut');
    expect(cfg.subMetricOrder[0]).toBe('weight');
    expect(cfg.calorieRingLabel).toBe('Deficit');
  });
  it('returns bulk config with lean mass first', () => {
    const cfg = getGoalConfig('bulk');
    expect(cfg.subMetricOrder[0]).toBe('leanmass');
    expect(cfg.calorieRingLabel).toBe('Surplus');
  });
  it('returns maintain config with no forecast projection', () => {
    const cfg = getGoalConfig('maintain');
    expect(cfg.subMetricOrder[0]).toBe('weight');
    expect(cfg.showForecastProjection).toBe(false);
  });
});

describe('buildWeightSeries', () => {
  it('maps weight entries to {date, value} sorted ascending', () => {
    const entries = [
      {date:'2026-06-10', weight:85},
      {date:'2026-06-05', weight:86},
    ];
    const result = buildWeightSeries(entries);
    expect(result[0]).toEqual({date:'2026-06-05', value:86});
    expect(result[1]).toEqual({date:'2026-06-10', value:85});
  });
});

describe('buildWaistSeries', () => {
  it('maps measurement entries with waist to {date, value}', () => {
    const entries = [
      {date:'2026-06-01', waist:92, neck:40, hip:null},
      {date:'2026-06-15', waist:null, neck:40, hip:null},  // no waist — excluded
    ];
    const result = buildWaistSeries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(92);
  });
});

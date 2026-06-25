import { describe, it, expect } from 'vitest';
import {
  getCyclePosition,
  getPhaseLabelByPosition,
  getPhaseLabel,
  getCycleDay,
  resolveDaySchedule,
  hasCycleTemplate,
} from './schedule';

// 8-day rotor: 4 on ("On"), 4 off ("Off"), cycle starts Mon 2026-06-01.
const rotor = {
  type: 'rotating',
  cycleLength: 8,
  cycleStart: '2026-06-01',
  labels: ['On', 'Off'],
};

// Standard A/B fortnight starting Mon 2026-06-01.
const fortnight = {
  type: 'alternating',
  cycleLength: 14,
  cycleStart: '2026-06-01',
  labels: ['A', 'B'],
};

describe('getCyclePosition', () => {
  it('is 1-based on the cycle start day', () => {
    expect(getCyclePosition(rotor, '2026-06-01')).toBe(1);
  });

  it('wraps after a full cycle', () => {
    expect(getCyclePosition(rotor, '2026-06-09')).toBe(1); // 8 days later
    expect(getCyclePosition(rotor, '2026-06-08')).toBe(8);
  });

  it('handles dates before the cycle start (no negative positions)', () => {
    const pos = getCyclePosition(rotor, '2026-05-31'); // day before start
    expect(pos).toBe(8);
  });

  it('returns null when the pattern is not configured', () => {
    expect(getCyclePosition({}, '2026-06-01')).toBeNull();
  });
});

describe('getPhaseLabelByPosition — the 8-day rotor fix', () => {
  // The old code did Math.floor(position / 7), so an 8-day rotor only ever
  // showed "Off" for a single day. It must now split 4/4.
  it('gives 4 "On" days then 4 "Off" days for an 8-day rotor', () => {
    const labels = [1, 2, 3, 4, 5, 6, 7, 8].map(p => getPhaseLabelByPosition(rotor, p));
    expect(labels).toEqual(['On', 'On', 'On', 'On', 'Off', 'Off', 'Off', 'Off']);
  });

  it('still splits an A/B fortnight 7/7', () => {
    const labels = Array.from({ length: 14 }, (_, i) => getPhaseLabelByPosition(fortnight, i + 1));
    expect(labels.slice(0, 7)).toEqual(Array(7).fill('A'));
    expect(labels.slice(7)).toEqual(Array(7).fill('B'));
  });
});

describe('getPhaseLabel by date', () => {
  it('day 5 of the rotor is the first "Off" day', () => {
    expect(getPhaseLabel(rotor, '2026-06-05')).toBe('Off');
  });
  it('day 4 of the rotor is still "On"', () => {
    expect(getPhaseLabel(rotor, '2026-06-04')).toBe('On');
  });
});

describe('getCycleDay / resolveDaySchedule', () => {
  const profile = {
    schedulePattern: rotor,
    cycleTemplate: {
      1: { lunch: { type: 'push', notes: 'Push A' } },
      5: { lunch: { type: 'rest' } },
    },
  };

  it('generates the cycle day for a date from its position', () => {
    expect(getCycleDay(profile, '2026-06-01')).toEqual({ lunch: { type: 'push', notes: 'Push A' } });
    expect(getCycleDay(profile, '2026-06-05')).toEqual({ lunch: { type: 'rest' } });
  });

  it('returns null for a position with no template entry', () => {
    expect(getCycleDay(profile, '2026-06-02')).toBeNull();
  });

  it('lets an explicit per-date override win over the cycle', () => {
    const schedule = { '2026-06-01': { lunch: { type: 'rest' }, notes: 'Travelling' } };
    expect(resolveDaySchedule(profile, schedule, '2026-06-01')).toEqual({
      lunch: { type: 'rest' },
      notes: 'Travelling',
    });
  });

  it('falls back to the cycle when there is no override', () => {
    expect(resolveDaySchedule(profile, {}, '2026-06-01')).toEqual({ lunch: { type: 'push', notes: 'Push A' } });
  });

  it('returns null when neither override nor cycle covers the day', () => {
    expect(resolveDaySchedule({ schedulePattern: rotor, cycleTemplate: {} }, {}, '2026-06-02')).toBeNull();
  });
});

describe('hasCycleTemplate', () => {
  it('is false for empty/missing templates', () => {
    expect(hasCycleTemplate({ cycleTemplate: {} })).toBe(false);
    expect(hasCycleTemplate({})).toBe(false);
  });
  it('is true once positions exist', () => {
    expect(hasCycleTemplate({ cycleTemplate: { 1: { lunch: { type: 'push' } } } })).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { searchCofid } from './cofid';
import sample from '../data/cofid.sample.json';

describe('searchCofid', () => {
  it('finds a generic food by fuzzy name and maps per-100g macros', () => {
    const res = searchCofid('roast beef', sample);
    expect(res[0]).toMatchObject({ name: 'Beef, roast', calories: 183, protein: 29.2, carbs: 0, fat: 7.3, source: 'cofid' });
    expect(res[0].base).toEqual({ amount: 100, unit: 'g' });
  });
  it('returns [] on no match', () => {
    expect(searchCofid('pizza', sample)).toEqual([]);
  });
});

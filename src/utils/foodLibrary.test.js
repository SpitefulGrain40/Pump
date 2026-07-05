import { describe, it, expect } from 'vitest';
import {
  normalizeUnit, scaleFood, parseFoodInput, parseQuantityWord, parsePortionNote, unitToBaseQuantity, fuzzyMatch, labelToBaseFood, addOrUpdateFood, touchEntry,
} from './foodLibrary';

const chicken = { id: 'food-1', kind: 'food', name: 'Chicken breast', base: { amount: 100, unit: 'g' },
  calories: 165, protein: 31, carbs: 0, fat: 3.6, source: 'cofid', useCount: 0, lastUsed: '2026-01-01T00:00:00Z' };
const egg = { id: 'food-2', kind: 'food', name: 'Egg, boiled', base: { amount: 1, unit: 'egg' },
  calories: 78, protein: 6, carbs: 0.6, fat: 5, source: 'cofid', useCount: 0, lastUsed: '2026-01-01T00:00:00Z' };

describe('scaleFood', () => {
  it('scales a per-100g food by grams', () => {
    expect(scaleFood(chicken, 320)).toEqual({ calories: 528, protein: 99.2, carbs: 0, fat: 11.5 });
  });
  it('scales a per-item food by count', () => {
    expect(scaleFood(egg, 2)).toEqual({ calories: 156, protein: 12, carbs: 1.2, fat: 10 });
  });
});

describe('parseFoodInput', () => {
  it('parses a leading amount+unit', () => {
    expect(parseFoodInput('320g roast beef')).toEqual({ name: 'roast beef', quantity: 320, unit: 'g' });
  });
  it('parses a trailing amount+unit', () => {
    expect(parseFoodInput('roast beef 320 g')).toEqual({ name: 'roast beef', quantity: 320, unit: 'g' });
  });
  it('parses a per-item count and singularises the unit', () => {
    expect(parseFoodInput('2 eggs')).toEqual({ name: 'eggs', quantity: 2, unit: 'egg' });
  });
  it('recognises a trailing unit noun within a multi-word food name', () => {
    expect(parseFoodInput('1 chicken breast')).toEqual({ name: 'chicken breast', quantity: 1, unit: 'breast' });
  });
  it('leaves the unit undefined when no word in the name is a known unit', () => {
    expect(parseFoodInput('1 pizza')).toEqual({ name: 'pizza', quantity: 1, unit: undefined });
  });
  it('returns name only when there is no quantity', () => {
    expect(parseFoodInput('roast beef')).toEqual({ name: 'roast beef' });
  });

  it('parses a leading word-quantity with filler words', () => {
    expect(parseFoodInput('half a portion of chicken breast')).toEqual({ name: 'chicken breast', quantityMultiplier: 0.5 });
  });
  it('parses a bare word-quantity with no filler', () => {
    expect(parseFoodInput('double rice')).toEqual({ name: 'rice', quantityMultiplier: 2 });
  });
  it('parses "a couple of X"', () => {
    expect(parseFoodInput('a couple of eggs')).toEqual({ name: 'eggs', quantityMultiplier: 2 });
  });
  it('parses a leading bare fraction', () => {
    expect(parseFoodInput('3/4 chicken breast')).toEqual({ name: 'chicken breast', quantityMultiplier: 0.75 });
  });
  it('parses an embedded pack size into an absolute quantity', () => {
    expect(parseFoodInput('half a 240g pack 5% fat beef mince')).toEqual({ name: '5% fat beef mince', quantity: 120, unit: 'g' });
  });
  it('parses "quarter of a 400g tin X"', () => {
    expect(parseFoodInput('quarter of a 400g tin beans')).toEqual({ name: 'beans', quantity: 100, unit: 'g' });
  });
});

describe('parsePortionNote', () => {
  const foodA = { base: { amount: 100, unit: 'g' }, packSize: { amount: 240, unit: 'g' } };
  const foodB = { base: { amount: 1, unit: 'scoop' } };

  it('resolves "half a pack" against the product pack size', () => {
    expect(parsePortionNote('half a pack', foodA)).toEqual({ quantity: 120 });
  });
  it('resolves an explicit weight', () => {
    expect(parsePortionNote('120g', foodA)).toEqual({ quantity: 120 });
    expect(parsePortionNote('120', foodA)).toEqual({ quantity: 120 });
  });
  it('resolves a bare word-quantity against the base amount when no pack mentioned', () => {
    expect(parsePortionNote('half', foodA)).toEqual({ quantity: 50 });
  });
  it('resolves counts and words for per-item foods', () => {
    expect(parsePortionNote('2 scoops', foodB)).toEqual({ quantity: 2 });
    expect(parsePortionNote('double', foodB)).toEqual({ quantity: 2 });
  });
  it('flags a vague note for AI estimation', () => {
    expect(parsePortionNote('a big handful', foodA)).toEqual({ estimate: true });
  });
  it('returns null for an empty note', () => {
    expect(parsePortionNote('', foodA)).toBeNull();
  });
});

describe('unitToBaseQuantity', () => {
  const perItemEgg = { base: { amount: 1, unit: 'egg' } };
  const per100g = { base: { amount: 100, unit: 'g' } };

  it('returns the exact quantity when the parsed unit matches the base unit', () => {
    expect(unitToBaseQuantity({ quantity: 2, unit: 'egg' }, perItemEgg)).toEqual({ quantity: 2, exact: true });
  });
  it('returns exact for an explicit weight against a weight base', () => {
    expect(unitToBaseQuantity({ quantity: 120, unit: 'g' }, per100g)).toEqual({ quantity: 120, exact: true });
  });
  it('converts a count of a known item to grams for a per-weight food', () => {
    // 2 eggs × 50g standard = 100g
    expect(unitToBaseQuantity({ quantity: 2, unit: 'egg' }, per100g)).toEqual({ quantity: 100, exact: false });
  });
  it('flags a count of unknown weight for conversion', () => {
    expect(unitToBaseQuantity({ quantity: 1, unit: 'can' }, per100g)).toEqual({ needsConversion: true });
  });
  it('flags a bare quantity with no unit as needing conversion, never assumes grams', () => {
    // Regression: "1 chicken breast" must never be silently read as "1 gram".
    expect(unitToBaseQuantity({ quantity: 1, unit: undefined }, per100g)).toEqual({ needsConversion: true });
  });
  it('returns null when there is no quantity', () => {
    expect(unitToBaseQuantity({ name: 'x' }, per100g)).toBeNull();
  });
});

describe('parseQuantityWord', () => {
  it('maps known words to multipliers', () => {
    expect(parseQuantityWord('half')).toBe(0.5);
    expect(parseQuantityWord('quarter')).toBe(0.25);
    expect(parseQuantityWord('double')).toBe(2);
    expect(parseQuantityWord('triple')).toBe(3);
    expect(parseQuantityWord('couple')).toBe(2);
  });
  it('is case-insensitive', () => {
    expect(parseQuantityWord('Half')).toBe(0.5);
  });
  it('parses bare fractions', () => {
    expect(parseQuantityWord('3/4')).toBe(0.75);
    expect(parseQuantityWord('1/2')).toBe(0.5);
  });
  it('returns null for unrecognised words', () => {
    expect(parseQuantityWord('chicken')).toBeNull();
    expect(parseQuantityWord('')).toBeNull();
  });
});

describe('fuzzyMatch', () => {
  it('finds a food regardless of word order', () => {
    const res = fuzzyMatch('roast beef', [{ name: 'Beef, roast' }, { name: 'Chicken' }]);
    expect(res[0].name).toBe('Beef, roast');
  });
  it('tie-breaks by useCount then lastUsed', () => {
    const a = { name: 'Milk', useCount: 1, lastUsed: '2026-01-01T00:00:00Z' };
    const b = { name: 'Milk', useCount: 5, lastUsed: '2026-01-01T00:00:00Z' };
    expect(fuzzyMatch('milk', [a, b])[0]).toBe(b);
  });
  it('ranks the literal food above a dish that merely starts with the word', () => {
    const res = fuzzyMatch('egg', [{ name: 'Egg Fu Yung' }, { name: 'Eggs, chicken, whole, raw' }]);
    expect(res[0].name).toBe('Eggs, chicken, whole, raw');
  });
  it('matches a singular query to a plural head (egg → Eggs, ...)', () => {
    const res = fuzzyMatch('egg', [{ name: 'Egg fried rice, takeaway' }, { name: 'Eggs, chicken, boiled' }, { name: 'Chicken' }]);
    expect(res[0].name).toBe('Eggs, chicken, boiled');
  });

  it('ranks a plain preparation above ones with an unrequested coating/recipe', () => {
    const res = fuzzyMatch('chicken breast', [
      { name: 'Chicken breast/steak, coated, baked' },
      { name: 'Chicken, breast, strips, stir-fried in corn oil' },
      { name: 'Chicken, breast, grilled without skin, meat only' },
    ]);
    expect(res[0].name).toBe('Chicken, breast, grilled without skin, meat only');
  });

  it('does not penalise a recipe word the user actually asked for', () => {
    const res = fuzzyMatch('chicken kiev', [
      { name: 'Chicken, breast, grilled without skin, meat only' },
      { name: 'Chicken kiev, retail, baked' },
    ]);
    expect(res[0].name).toBe('Chicken kiev, retail, baked');
  });

  it('finds raw chicken breast via the breast -> light meat synonym', () => {
    // Dark-meat-raw listed FIRST so a tie (i.e. the synonym not actually working)
    // would win by array order — this only passes if "breast" genuinely
    // resolves to "light meat" and outscores the non-matching dark-meat entry.
    const res = fuzzyMatch('raw chicken breast', [
      { name: 'Chicken, dark meat, raw' },
      { name: 'Chicken, breast, grilled without skin, meat only' },
      { name: 'Chicken, light meat, raw' },
    ]);
    expect(res[0].name).toBe('Chicken, light meat, raw');
  });

  it('still prefers a literal cooked breast match over the raw synonym when "raw" is not asked for', () => {
    const res = fuzzyMatch('chicken breast', [
      { name: 'Chicken, light meat, raw' },
      { name: 'Chicken, breast, grilled without skin, meat only' },
    ]);
    expect(res[0].name).toBe('Chicken, breast, grilled without skin, meat only');
  });
});

describe('labelToBaseFood', () => {
  it('prefers per-100g as the base', () => {
    const f = labelToBaseFood({ name: 'Beans', source: 'off', barcode: '123',
      per100g: { calories: 78, protein: 4.7, carbs: 13, fat: 0.6 },
      perServing: { calories: 156, protein: 9.4, carbs: 26, fat: 1.2 }, servingSize: { amount: 200, unit: 'g' } });
    expect(f.base).toEqual({ amount: 100, unit: 'g' });
    expect(f.calories).toBe(78);
    expect(f.barcode).toBe('123');
  });
  it('falls back to per-serving when no per-100g', () => {
    const f = labelToBaseFood({ name: 'Bar', source: 'ai',
      perServing: { calories: 200, protein: 10, carbs: 20, fat: 8 }, servingSize: { amount: 1, unit: 'serving' } });
    expect(f.base).toEqual({ amount: 1, unit: 'serving' });
    expect(f.calories).toBe(200);
  });
});

describe('addOrUpdateFood', () => {
  it('dedupes by normalised name + unit, bumping useCount', () => {
    const lib = [chicken];
    const out = addOrUpdateFood(lib, { ...chicken, id: 'food-x', calories: 170, useCount: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].calories).toBe(170);
    expect(out[0].useCount).toBe(1);
  });
  it('appends a genuinely new food', () => {
    expect(addOrUpdateFood([chicken], egg)).toHaveLength(2);
  });
});

describe('touchEntry', () => {
  it('bumps useCount and lastUsed for the matching id', () => {
    const out = touchEntry([chicken], 'food-1');
    expect(out[0].useCount).toBe(1);
    expect(new Date(out[0].lastUsed).getTime()).toBeGreaterThan(new Date(chicken.lastUsed).getTime());
  });
});

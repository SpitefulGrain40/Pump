import { describe, it, expect, vi } from 'vitest';
import { resolveNutrition, resolveFromPhoto, searchSuggestions } from './nutritionResolver';
import { searchCofid } from './cofid';

const mkDeps = (over = {}) => ({
  lookupBarcode: vi.fn().mockResolvedValue(null),
  searchProducts: vi.fn().mockResolvedValue([]),
  searchCofid: vi.fn().mockReturnValue([]),
  cofidData: [],
  ...over,
});
const food = (name, source) => ({ name, base: { amount: 100, unit: 'g' }, calories: 100, protein: 10, carbs: 5, fat: 2, source });

describe('resolveNutrition', () => {
  it('barcode → OFF wins as verified', async () => {
    const deps = mkDeps({ lookupBarcode: vi.fn().mockResolvedValue(food('Beans', 'off')) });
    const r = await resolveNutrition({ barcode: '5000', library: [], deps });
    expect(r).toEqual({ food: expect.objectContaining({ name: 'Beans' }), provenance: 'off', verified: true });
  });
  it('query → library (Tier 3) preferred over DBs', async () => {
    const lib = [food('My Chicken', 'manual')];
    const deps = mkDeps({ searchCofid: vi.fn().mockReturnValue([food('Chicken breast', 'cofid')]) });
    const r = await resolveNutrition({ query: 'chicken', library: lib, deps });
    expect(r.provenance).toBe('manual');
    expect(deps.searchCofid).not.toHaveBeenCalled();
  });
  it('query → CoFID when no library hit', async () => {
    const deps = mkDeps({ searchCofid: vi.fn().mockReturnValue([food('Beef, roast', 'cofid')]) });
    const r = await resolveNutrition({ query: 'roast beef', library: [], deps });
    expect(r.provenance).toBe('cofid');
    expect(r.verified).toBe(true);
  });
  it('query → OFF search when no library or CoFID hit', async () => {
    const deps = mkDeps({ searchProducts: vi.fn().mockResolvedValue([food('Branded Thing', 'off')]) });
    const r = await resolveNutrition({ query: 'branded thing', library: [], deps });
    expect(r.provenance).toBe('off');
  });
  it('returns null when nothing matches', async () => {
    const r = await resolveNutrition({ query: 'zzz', library: [], deps: mkDeps() });
    expect(r).toBeNull();
  });
  it('rejects a weak single-word library match and falls through to CoFID', async () => {
    // Regression: a library food sharing only "vegan" with a much longer
    // query was winning outright and silently mis-logging the wrong product.
    const lib = [food('Vegan Salted Caramel Ice Cream', 'off')];
    const deps = mkDeps({ searchCofid: vi.fn().mockReturnValue([food('Soya protein isolate', 'cofid')]) });
    const r = await resolveNutrition({ query: 'vegan protein 360 protein works black', library: lib, deps });
    expect(r.provenance).toBe('cofid');
  });
  it('rejects a weak CoFID match too and falls through to OFF', async () => {
    // Uses the real searchCofid (not a mock) so its own minCoverage filtering
    // is actually exercised, not just resolveNutrition's pass-through of the option.
    const cofidData = [{ name: 'Vegan sausage roll', kcalPer100g: 250, proteinPer100g: 10, carbsPer100g: 20, fatPer100g: 12 }];
    const deps = mkDeps({
      searchCofid,
      cofidData,
      searchProducts: vi.fn().mockResolvedValue([food('Protein Works Vegan Protein 360', 'off')]),
    });
    const r = await resolveNutrition({ query: 'vegan protein 360 protein works black', library: [], deps });
    expect(r.provenance).toBe('off');
  });
});

describe('searchSuggestions', () => {
  it('combines library and CoFID matches, library first', () => {
    const lib = [food('My Chicken Thing', 'manual')];
    const deps = mkDeps({ searchCofid: vi.fn().mockReturnValue([food('Chicken, breast, grilled', 'cofid')]) });
    const res = searchSuggestions('chicken', { library: lib, deps });
    expect(res.foods[0].name).toBe('My Chicken Thing');
    expect(res.foods[1].name).toBe('Chicken, breast, grilled');
  });
  it('searches saved meals separately from foods', () => {
    const meals = [{ kind: 'meal', name: 'My usual breakfast' }];
    const res = searchSuggestions('breakfast', { library: [], meals, deps: mkDeps() });
    expect(res.meals[0].name).toBe('My usual breakfast');
  });
  it('caps combined foods at the limit, filling remaining slots from CoFID', () => {
    const lib = [food('Chicken A', 'manual'), food('Chicken B', 'manual')];
    const deps = mkDeps({ searchCofid: vi.fn().mockReturnValue([food('Chicken C', 'cofid'), food('Chicken D', 'cofid'), food('Chicken E', 'cofid')]) });
    const res = searchSuggestions('chicken', { library: lib, deps, limit: 3 });
    expect(res.foods).toHaveLength(3);
    expect(res.foods.map((f) => f.name)).toEqual(['Chicken A', 'Chicken B', 'Chicken C']);
  });
  it('never calls the network (OFF) — CoFID and library are synchronous only', () => {
    const deps = mkDeps();
    searchSuggestions('chicken', { library: [], deps });
    expect(deps.searchProducts).not.toHaveBeenCalled();
    expect(deps.lookupBarcode).not.toHaveBeenCalled();
  });
});

describe('resolveFromPhoto', () => {
  it('uses the barcode path when the photo yields a barcode', async () => {
    const deps = mkDeps({ lookupBarcode: vi.fn().mockResolvedValue(food('Scanned', 'off')) });
    const r = await resolveFromPhoto({ type: 'packaged', barcode: '5000' }, { library: [], deps });
    expect(r.verified).toBe(true);
  });
  it('falls back to the transcribed label tagged unverified', async () => {
    const r = await resolveFromPhoto(
      { type: 'label', name: 'Label Food', per100g: { calories: 90, protein: 5, carbs: 12, fat: 1 } },
      { library: [], deps: mkDeps() },
    );
    expect(r.verified).toBe(false);
    expect(r.provenance).toBe('ai');
    expect(r.food.calories).toBe(90);
  });
});

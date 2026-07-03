import { describe, it, expect, vi } from 'vitest';
import { resolveNutrition, resolveFromPhoto } from './nutritionResolver';

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

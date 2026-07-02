import { describe, it, expect } from 'vitest';
import { createLibraryFood, createSavedMeal } from './dataSchemas';

describe('createLibraryFood', () => {
  it('builds a food with four macros, defaults, and generated id', () => {
    const f = createLibraryFood({
      name: 'Chicken breast', base: { amount: 100, unit: 'g' },
      calories: 165, protein: 31, carbs: 0, fat: 3.6, source: 'cofid',
    });
    expect(f.kind).toBe('food');
    expect(f.id).toMatch(/^food-/);
    expect(f).toMatchObject({ name: 'Chicken breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, source: 'cofid' });
    expect(f.base).toEqual({ amount: 100, unit: 'g' });
    expect(f.barcode).toBeNull();
    expect(f.useCount).toBe(0);
    expect(typeof f.createdAt).toBe('string');
  });

  it('defaults missing macros to 0 and source to manual', () => {
    const f = createLibraryFood({ name: 'Mystery', base: { amount: 1, unit: 'serving' }, calories: 200, protein: 10 });
    expect(f.carbs).toBe(0);
    expect(f.fat).toBe(0);
    expect(f.source).toBe('manual');
  });
});

describe('createSavedMeal', () => {
  it('builds a meal snapshotting its components', () => {
    const m = createSavedMeal({ name: 'Breakfast', components: [
      { name: 'Eggs', quantity: 2, unit: 'egg', calories: 156, protein: 12, carbs: 1, fat: 11 },
    ]});
    expect(m.kind).toBe('meal');
    expect(m.id).toMatch(/^savedmeal-/);
    expect(m.components).toHaveLength(1);
    expect(m.useCount).toBe(0);
  });
});

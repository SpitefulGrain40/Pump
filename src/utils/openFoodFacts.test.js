import { describe, it, expect, vi } from 'vitest';
import { lookupBarcode, searchProducts } from './openFoodFacts';

const okProduct = {
  status: 1,
  product: {
    product_name: 'Baked Beans',
    nutriments: { 'energy-kcal_100g': 78, proteins_100g: 4.7, carbohydrates_100g: 13, fat_100g: 0.6 },
  },
};
const mkFetch = (json, ok = true) => vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(json) });

describe('lookupBarcode', () => {
  it('maps per-100g nutriments to a base food', async () => {
    const food = await lookupBarcode('5000', { fetchImpl: mkFetch(okProduct) });
    expect(food).toMatchObject({ name: 'Baked Beans', calories: 78, protein: 4.7, carbs: 13, fat: 0.6, source: 'off', barcode: '5000' });
    expect(food.base).toEqual({ amount: 100, unit: 'g' });
  });
  it('captures pack size from product_quantity', async () => {
    const withPack = { status: 1, product: { ...okProduct.product, product_quantity: 240, product_quantity_unit: 'g' } };
    const food = await lookupBarcode('5000', { fetchImpl: mkFetch(withPack) });
    expect(food.packSize).toEqual({ amount: 240, unit: 'g' });
  });
  it('returns null when product not found', async () => {
    expect(await lookupBarcode('0000', { fetchImpl: mkFetch({ status: 0 }) })).toBeNull();
  });
  it('returns null when nutriments are missing', async () => {
    expect(await lookupBarcode('1', { fetchImpl: mkFetch({ status: 1, product: { product_name: 'X', nutriments: {} } }) })).toBeNull();
  });
  it('returns null on a network error rather than throwing', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await lookupBarcode('1', { fetchImpl: bad })).toBeNull();
  });
});

describe('searchProducts', () => {
  it('maps search hits to foods', async () => {
    const json = { products: [okProduct.product] };
    const res = await searchProducts('beans', { fetchImpl: mkFetch(json), limit: 5 });
    expect(res[0].name).toBe('Baked Beans');
  });
  it('returns [] on error', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await searchProducts('beans', { fetchImpl: bad })).toEqual([]);
  });
});

import { labelToBaseFood } from './foodLibrary';

const BARCODE_URL = (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,code`;
const SEARCH_URL = (q, limit) =>
  `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,nutriments`;

// Browsers cannot set OFF's requested custom User-Agent; reads still work. We
// cache aggressively at the resolver layer and never throw — misses return
// null/[] so a log never hard-fails on a network hiccup.
function toFood(product, barcode = null) {
  const n = product?.nutriments || {};
  const calories = n['energy-kcal_100g'];
  if (product?.product_name == null || calories == null) return null;
  return labelToBaseFood({
    name: product.product_name, source: 'off', barcode,
    per100g: { calories, protein: n.proteins_100g, carbs: n.carbohydrates_100g, fat: n.fat_100g },
  });
}

export async function lookupBarcode(barcode, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(BARCODE_URL(barcode));
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1) return null;
    return toFood(data.product, barcode);
  } catch {
    return null;
  }
}

export async function searchProducts(query, { fetchImpl = fetch, limit = 8 } = {}) {
  try {
    const res = await fetchImpl(SEARCH_URL(query, limit));
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || []).map((p) => toFood(p)).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
}

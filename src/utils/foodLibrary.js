import { createLibraryFood } from './dataSchemas';

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const WEIGHT_UNITS = { g: 'g', gram: 'g', grams: 'g', ml: 'ml', milliliter: 'ml', millilitre: 'ml', kg: 'kg', l: 'l' };

// Countable per-item units we recognise in typed input (stored singular).
const ITEM_UNITS = new Set([
  'egg', 'slice', 'scoop', 'serving', 'piece', 'can', 'cup', 'bar', 'pack', 'packet',
  'handful', 'tbsp', 'tsp', 'clove', 'fillet', 'breast', 'rasher', 'sausage', 'bowl',
]);

// Lowercase; map weight aliases; singularise item words (eggs → egg).
export function normalizeUnit(unit) {
  if (!unit) return unit;
  const u = String(unit).trim().toLowerCase();
  if (WEIGHT_UNITS[u]) return WEIGHT_UNITS[u];
  return u.endsWith('s') && u.length > 1 ? u.slice(0, -1) : u;
}

function isKnownUnit(word) {
  const n = normalizeUnit(word);
  return n === 'g' || n === 'ml' || n === 'kg' || n === 'l' || ITEM_UNITS.has(n);
}

// Word/fraction quantities understood as a multiplier of a food's base amount,
// for when the user doesn't know an exact number ("half a portion of X").
const QUANTITY_WORDS = { half: 0.5, quarter: 0.25, third: 1 / 3, double: 2, triple: 3, couple: 2 };
const FRACTION = /^(\d+)\s*\/\s*(\d+)$/;
// Filler consumed between a quantity word and the food name: "half [a portion of] chicken".
const FILLER_WORDS = new Set(['a', 'an', 'the', 'portion', 'serving', 'of']);

export function parseQuantityWord(word) {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return null;
  if (QUANTITY_WORDS[w] != null) return QUANTITY_WORDS[w];
  const frac = w.match(FRACTION);
  if (frac) {
    const denom = Number(frac[2]);
    return denom ? Number(frac[1]) / denom : null;
  }
  return null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function scaleFood(food, quantity) {
  const factor = (Number(quantity) || 0) / (food.base?.amount || 1);
  return {
    calories: round1(food.calories * factor),
    protein: round1(food.protein * factor),
    carbs: round1(food.carbs * factor),
    fat: round1(food.fat * factor),
  };
}

// "<amount><unit> name"  — an explicit unit followed by the food name.
const LEADING_UNIT = /^(\d+(?:\.\d+)?)\s*([a-z]+)\s+(.+)$/i;
// "name <amount><unit>"  — trailing amount, optional unit.
const TRAILING = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-z]+)?$/i;
// "<amount> name"        — a bare count in front of the food name.
const LEADING_COUNT = /^(\d+(?:\.\d+)?)\s+(.+)$/i;

export function parseFoodInput(text) {
  const t = String(text || '').trim();

  // 0. Leading word/fraction quantity: "half a portion of chicken breast",
  //    "a couple of eggs", "double rice", "3/4 chicken breast". Returns a
  //    multiplier (of the resolved food's base amount) instead of an absolute
  //    quantity, since we don't know the base unit yet at parse time.
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let i = 0;
    if (['a', 'an'].includes(words[0].toLowerCase()) && parseQuantityWord(words[1]) != null) i = 1;
    const qw = parseQuantityWord(words[i]);
    if (qw != null) {
      let j = i + 1;
      while (j < words.length && FILLER_WORDS.has(words[j].toLowerCase())) j++;
      const name = words.slice(j).join(' ').trim();
      if (name) return { name, quantityMultiplier: qw };
    }
  }

  // 1. Explicit unit + name: "320g roast beef", "1 scoop whey".
  let m = t.match(LEADING_UNIT);
  if (m && isKnownUnit(m[2])) {
    return { name: m[3].trim(), quantity: Number(m[1]), unit: normalizeUnit(m[2]) };
  }

  // 2. Trailing amount: "roast beef 320 g", "roast beef 320".
  m = t.match(TRAILING);
  if (m && (!m[3] || isKnownUnit(m[3]))) {
    return { name: m[1].trim(), quantity: Number(m[2]), unit: m[3] ? normalizeUnit(m[3]) : undefined };
  }

  // 3. Bare count + name: "2 eggs" → the name doubles as the unit when it's a
  //    known countable; otherwise it's just a quantity with no unit.
  m = t.match(LEADING_COUNT);
  if (m) {
    const name = m[2].trim();
    const asUnit = normalizeUnit(name);
    return { name, quantity: Number(m[1]), unit: ITEM_UNITS.has(asUnit) ? asUnit : undefined };
  }

  return { name: t };
}

export function fuzzyMatch(query, entries, { limit = 8 } = {}) {
  const q = norm(query);
  const qTokens = q.split(' ').filter(Boolean);
  const scored = entries.map((e) => {
    const name = norm(e.name);
    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 30;
    if (name.includes(q)) score += 15;
    for (const tok of qTokens) if (name.includes(tok)) score += 5;
    return { e, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) =>
    b.score - a.score
    || (b.e.useCount || 0) - (a.e.useCount || 0)
    || new Date(b.e.lastUsed || 0) - new Date(a.e.lastUsed || 0)
  );
  return scored.slice(0, limit).map((x) => x.e);
}

export function labelToBaseFood({ name, source = 'ai', barcode = null, per100g, perServing, servingSize }) {
  const macros = per100g || perServing || {};
  const base = per100g ? { amount: 100, unit: 'g' } : (servingSize || { amount: 1, unit: 'serving' });
  return createLibraryFood({
    name, base, source, barcode,
    calories: macros.calories, protein: macros.protein, carbs: macros.carbs, fat: macros.fat,
  });
}

export function addOrUpdateFood(library, food) {
  const key = (f) => `${norm(f.name)}|${normalizeUnit(f.base?.unit)}`;
  const idx = library.findIndex((f) => key(f) === key(food));
  if (idx === -1) return [...library, food];
  const existing = library[idx];
  const merged = {
    ...existing,
    calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat,
    source: food.source, barcode: food.barcode ?? existing.barcode,
    useCount: (existing.useCount || 0) + 1, lastUsed: new Date().toISOString(),
  };
  return library.map((f, i) => (i === idx ? merged : f));
}

export function touchEntry(library, id) {
  return library.map((f) =>
    f.id === id ? { ...f, useCount: (f.useCount || 0) + 1, lastUsed: new Date().toISOString() } : f
  );
}

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

// Standard weights (grams) for common countable items, used to convert a count
// ("2 eggs") into the base unit of a per-weight food. Container-ish units
// (can/cup/pack/serving/bowl) vary too much by food, so they're left to AI.
const UNIT_GRAMS = {
  egg: 50, slice: 30, rasher: 25, sausage: 45, scoop: 30,
  clove: 5, tbsp: 15, tsp: 5, handful: 30, fillet: 120, breast: 170,
};

// Convert a parsed quantity into the food's base unit.
//  - { quantity, exact: true }  → units match (or a bare weight); use directly
//  - { quantity, exact: false } → converted a count to grams (approximate)
//  - { needsConversion: true }  → a count of unknown weight (needs AI/manual)
//  - null                       → no quantity to convert
export function unitToBaseQuantity(parsed, food) {
  if (parsed?.quantity == null) return null;
  const bUnit = normalizeUnit(food?.base?.unit);
  const pUnit = parsed.unit ? normalizeUnit(parsed.unit) : null;
  if (!pUnit || pUnit === bUnit) return { quantity: parsed.quantity, exact: true };
  if ((bUnit === 'g' || bUnit === 'ml') && UNIT_GRAMS[pUnit] != null) {
    return { quantity: round1(parsed.quantity * UNIT_GRAMS[pUnit]), exact: false };
  }
  return { needsConversion: true };
}

// Word/fraction quantities understood as a multiplier of a food's base amount,
// for when the user doesn't know an exact number ("half a portion of X").
const QUANTITY_WORDS = { half: 0.5, quarter: 0.25, third: 1 / 3, double: 2, triple: 3, couple: 2 };
const FRACTION = /^(\d+)\s*\/\s*(\d+)$/;
// Filler consumed between a quantity word and the food name: "half [a portion of] chicken".
const FILLER_WORDS = new Set(['a', 'an', 'the', 'portion', 'serving', 'of']);
// Container nouns that indicate a pack quantity ("half a pack", "a 240g tin ...").
const PACK_NOUNS = ['pack', 'packet', 'tub', 'tin', 'can', 'bottle', 'bag', 'carton', 'box', 'jar'];
const PACK_NOUNS_SET = new Set(PACK_NOUNS);
const PACK_NOUNS_RE = new RegExp('\\b(' + PACK_NOUNS.join('|') + ')s?\\b');

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

      // Embedded pack size: "half a 240g pack <name>" → an absolute quantity
      // (multiplier × pack amount) rather than a base-relative multiplier.
      const packMatch = words[j] && words[j].match(/^(\d+(?:\.\d+)?)([a-z]+)?$/i);
      const packNoun = words[j + 1] && normalizeUnit(words[j + 1].toLowerCase());
      if (packMatch && packNoun && PACK_NOUNS_SET.has(packNoun)) {
        const n = Number(packMatch[1]);
        const unit = packMatch[2] ? normalizeUnit(packMatch[2]) : undefined;
        let k = j + 2;
        while (k < words.length && FILLER_WORDS.has(words[k].toLowerCase())) k++;
        const packName = words.slice(k).join(' ').trim();
        if (packName && Number.isFinite(n)) return { name: packName, quantity: round1(qw * n), unit };
      }

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

// Resolve a free-text portion note into a quantity of an already-resolved food.
// Returns { quantity } when deterministic, { estimate: true } when it needs an
// AI guess, or null for an empty note. Used for one-shot photo/scan logging where
// the note ("half a pack", "120g", "2 scoops") is the only thing the user types.
export function parsePortionNote(note, food) {
  const t = String(note || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const base = food?.base?.amount || 1;
  const packAmt = food?.packSize?.amount;

  const tokens = lower.split(/\s+/).filter(Boolean);
  let wordMult = parseQuantityWord(tokens[0]);
  if (wordMult == null && ['a', 'an'].includes(tokens[0]) && tokens[1]) wordMult = parseQuantityWord(tokens[1]);

  if (wordMult != null) {
    const usePack = PACK_NOUNS_RE.test(lower) && packAmt;
    return { quantity: round1(wordMult * (usePack ? packAmt : base)) };
  }

  const numMatch = lower.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    const unit = numMatch[2] ? normalizeUnit(numMatch[2]) : null;
    if (Number.isFinite(n) && n > 0 && (!unit || isKnownUnit(unit))) return { quantity: n };
  }

  return { estimate: true };
}

// Light stemmer so singular/plural queries match ("egg" ~ "eggs").
const stem = (t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const stemsOf = (s) => norm(s).split(' ').filter(Boolean).map(stem);

export function fuzzyMatch(query, entries, { limit = 8 } = {}) {
  const qNorm = norm(query);
  if (!qNorm) return [];
  const qTokens = qNorm.split(' ').filter(Boolean);
  const qStems = qTokens.map(stem);
  const qStemKey = qStems.join(' ');

  const scored = entries.map((e) => {
    const nameNorm = norm(e.name);
    const nameTokens = nameNorm.split(' ').filter(Boolean);
    const nameStems = nameTokens.map(stem);
    // "Head" = the part before the first comma (CoFID names its food identity
    // there, e.g. "Eggs, chicken, whole, raw" → "Eggs"). A head that matches the
    // whole query is a much stronger signal than the word appearing mid-name.
    const headStemKey = stemsOf(String(e.name).split(',')[0]).join(' ');

    // A candidate only counts if it actually shares a word (or substring) with
    // the query — otherwise the tie-breaker bonuses below would match everything.
    const wholeWordHits = qStems.filter((qs) => nameStems.includes(qs)).length;
    const hasHit = wholeWordHits > 0 || nameNorm.includes(qNorm);
    if (!hasHit) return { e, score: 0 };

    let score = 0;
    if (nameNorm === qNorm) score += 100;
    if (headStemKey === qStemKey) score += 60;
    if (wholeWordHits === qStems.length) score += 30; // all query tokens present
    score += wholeWordHits * 10;
    if (nameNorm.startsWith(qNorm)) score += 8;
    else if (nameNorm.includes(qNorm)) score += 4;
    // Prefer concise names — fewer extra words than the query means more relevant.
    score += Math.max(0, 5 - Math.max(0, nameTokens.length - qTokens.length));

    return { e, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) =>
    b.score - a.score
    || (b.e.useCount || 0) - (a.e.useCount || 0)
    || new Date(b.e.lastUsed || 0) - new Date(a.e.lastUsed || 0)
  );
  return scored.slice(0, limit).map((x) => x.e);
}

export function labelToBaseFood({ name, source = 'ai', barcode = null, per100g, perServing, servingSize, packSize = null }) {
  const macros = per100g || perServing || {};
  const base = per100g ? { amount: 100, unit: 'g' } : (servingSize || { amount: 1, unit: 'serving' });
  return createLibraryFood({
    name, base, source, barcode, packSize,
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

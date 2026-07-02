# Smart Food Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "AI-guess every time" food logging with a tiered, database-backed system — barcode/Open Food Facts → bundled CoFID → personal saved-food library → AI fallback — with inline quantity parsing and all four macros.

**Architecture:** Pure, unit-tested logic modules (`foodLibrary`, `cofid`, `openFoodFacts`, `nutritionResolver`) sit under thin React wiring. One shared `resolveNutrition` orchestrator feeds three surfaces: the MealLogger text box, the photo pipeline, and a new Coach tool. All persistence stays in `localStorage`; CoFID rides the asset bundle so it works offline.

**Tech Stack:** React 18 + Vite, Vitest (jsdom), date-fns, `xlsx` (dev-only, CoFID build), native `BarcodeDetector` with `@zxing/library` fallback. No backend.

## Global Constraints

- **No backend, ever.** Everything runs client-side in the browser. External calls are direct REST to Open Food Facts only.
- **Never hard-fail a log.** Any network/DB miss falls through to the next tier and ultimately to manual/AI entry.
- **Four macros:** every food/item/meal carries `calories`, `protein`, `carbs`, `fat`. Carbs/fat are captured + shown in the logger only — no targets, dashboard rings, Progress, or Coach `[LOG_MEAL]` carbs/fat in v1.
- **Back-compatible:** existing `pump-nutrition-logs` entries lack `carbs`/`fat`; all totals reducers treat a missing macro as `0`. No data migration.
- **Base units:** `per 100g` (`{amount:100, unit:'g'}`), `per serving`, or per-item (`{amount:1, unit:'egg'|'scoop'|'slice'|'serving'}`). No g↔oz conversion.
- **Rounding:** reuse the existing `round1` convention — `Math.round(n * 10) / 10`.
- **Tests:** `npm test` (vitest, jsdom). No React Testing Library — all logic lives in pure modules; components are verified via `npm run lint` + `npm run build` + manual preview.
- **Model for AI calls:** Haiku (`claude-haiku-4-5-20251001` Anthropic / `anthropic/claude-haiku-4-5-20251001` OpenRouter), matching the current MealLogger.
- **Provenance values:** `source` ∈ `'off' | 'cofid' | 'ai' | 'manual'`.
- **New localStorage key:** `pump-food-library`.
- **Attribution:** CoFID is Open Government Licence v3.0 — attribution line required in Settings/About + USER_GUIDE. Open Food Facts is ODbL — attribution likewise.

---

## Canonical Data Shapes

Referenced by every task. Defined in Task 1.

```js
// Library food entity (kind: 'food')
{ id, kind: 'food', name, base: { amount, unit },
  calories, protein, carbs, fat,           // PER base unit
  source, barcode, createdAt, lastUsed, useCount }

// Saved meal entity (kind: 'meal')
{ id, kind: 'meal', name,
  components: [{ name, quantity, unit, calories, protein, carbs, fat }],
  createdAt, lastUsed, useCount }

// Scaled item (what QuantitySheet / resolver hand to the meal list)
{ name, quantity, unit, calories, protein, carbs, fat, source }

// Resolver return
{ food /* library-food shape */, provenance: source, verified: boolean } | null
```

---

## File Structure

**New**
- `src/utils/foodLibrary.js` (+ `.test.js`) — pure: scaling, parsing, fuzzy match, label normalisation, dedupe.
- `src/utils/openFoodFacts.js` (+ `.test.js`) — OFF barcode + search REST + field mapping.
- `src/utils/cofid.js` (+ `.test.js`) — offline generic-food search over bundled JSON.
- `src/utils/nutritionResolver.js` (+ `.test.js`) — shared tiered resolver + `resolveFromPhoto`.
- `src/hooks/useFoodLibrary.js` — thin `useLocalStorageArray` wrapper.
- `src/components/food/QuantitySheet.jsx` — base-unit quantity entry + live scaled preview.
- `src/components/food/FoodSuggestions.jsx` — fuzzy suggestion dropdown.
- `src/data/cofid.json` — generated dataset (committed).
- `scripts/build-cofid.cjs` — Excel → trimmed JSON (dev-time).

**Modified**
- `src/utils/dataSchemas.js` — `createLibraryFood`, `createSavedMeal`; extend `createMealLog`.
- `src/components/MealLogger.jsx` — text/parse flow, quantity sheet, barcode, photo pipeline, save actions, 4-macro display.
- `src/hooks/useNutritionLogs.js` — totals tolerate `carbs`/`fat`.
- `src/hooks/useSettings.js` — backup/restore/clear include `pump-food-library`.
- `src/services/ai/context.js` + `src/services/ai/providers.js` — `lookup_nutrition` tool.
- `CLAUDE.md`, `USER_GUIDE.md` — flows, tool count, attribution.

---

## Task 1: Food data schemas

**Files:**
- Modify: `src/utils/dataSchemas.js`
- Test: `src/utils/dataSchemas.test.js` (create)

**Interfaces:**
- Produces:
  - `createLibraryFood({ name, base, calories, protein, carbs, fat, source, barcode }) → food`
  - `createSavedMeal({ name, components }) → meal`
  - `createMealLog(items, totals, photoAnalyzed?, date?)` — unchanged signature; `totals` and each item may now carry `carbs`/`fat`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/dataSchemas.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dataSchemas.test.js`
Expected: FAIL — `createLibraryFood is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/dataSchemas.js`:
```js
export const createLibraryFood = ({
  name, base, calories, protein, carbs = 0, fat = 0, source = 'manual', barcode = null,
}) => ({
  id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  kind: 'food',
  name,
  base,
  calories: Number(calories) || 0,
  protein: Number(protein) || 0,
  carbs: Number(carbs) || 0,
  fat: Number(fat) || 0,
  source,
  barcode,
  createdAt: new Date().toISOString(),
  lastUsed: new Date().toISOString(),
  useCount: 0,
});

export const createSavedMeal = ({ name, components }) => ({
  id: `savedmeal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  kind: 'meal',
  name,
  components: components.map((c) => ({
    name: c.name,
    quantity: Number(c.quantity) || 0,
    unit: c.unit || 'serving',
    calories: Number(c.calories) || 0,
    protein: Number(c.protein) || 0,
    carbs: Number(c.carbs) || 0,
    fat: Number(c.fat) || 0,
  })),
  createdAt: new Date().toISOString(),
  lastUsed: new Date().toISOString(),
  useCount: 0,
});
```

Also extend `createMealLog` so item/total carbs+fat persist. Find the existing `createMealLog` and replace with:
```js
export const createMealLog = (items, totals, photoAnalyzed = false, date = null) => ({
  id: `meal-${Date.now()}`,
  timestamp: date ? new Date(date).toISOString() : new Date().toISOString(),
  items: items.map((it) => ({
    ...it,
    carbs: Number(it.carbs) || 0,
    fat: Number(it.fat) || 0,
  })),
  totals: {
    calories: Number(totals.calories) || 0,
    protein: Number(totals.protein) || 0,
    carbs: Number(totals.carbs) || 0,
    fat: Number(totals.fat) || 0,
  },
  photoAnalyzed,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/dataSchemas.test.js`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/utils/dataSchemas.js src/utils/dataSchemas.test.js
git commit -m "feat: food library + saved-meal schemas, 4-macro meal logs"
```

---

## Task 2: `foodLibrary` pure module

**Files:**
- Create: `src/utils/foodLibrary.js`
- Test: `src/utils/foodLibrary.test.js`

**Interfaces:**
- Consumes: `createLibraryFood` (Task 1).
- Produces:
  - `normalizeUnit(unit) → string` (`'grams'→'g'`, `'eggs'→'egg'`, lowercases, strips trailing `s` for item words)
  - `scaleFood(food, quantity) → { calories, protein, carbs, fat }`
  - `parseFoodInput(text) → { name, quantity?, unit? }`
  - `fuzzyMatch(query, entries, { limit = 8 }) → entries[]` (ranked; works on food or meal entries via `.name`)
  - `labelToBaseFood({ name, source, barcode, per100g?, perServing?, servingSize? }) → food`
  - `addOrUpdateFood(library, food) → library[]` (dedupe by normalised name+unit)
  - `touchEntry(library, id) → library[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/foodLibrary.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  normalizeUnit, scaleFood, parseFoodInput, fuzzyMatch, labelToBaseFood, addOrUpdateFood, touchEntry,
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
  it('returns name only when there is no quantity', () => {
    expect(parseFoodInput('roast beef')).toEqual({ name: 'roast beef' });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/foodLibrary.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/foodLibrary.js`:
```js
import { createLibraryFood } from './dataSchemas';

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const WEIGHT_UNITS = { g: 'g', gram: 'g', grams: 'g', ml: 'ml', milliliter: 'ml', millilitre: 'ml' };

// Lowercase; map weight aliases; singularise item words (eggs → egg).
export function normalizeUnit(unit) {
  if (!unit) return unit;
  const u = String(unit).trim().toLowerCase();
  if (WEIGHT_UNITS[u]) return WEIGHT_UNITS[u];
  return u.endsWith('s') && u.length > 1 ? u.slice(0, -1) : u;
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

// Recognises "<amount><unit> name" or "name <amount><unit>". Amount may be decimal.
const AMOUNT_UNIT = '(\\d+(?:\\.\\d+)?)\\s*([a-z]+)?';
const LEADING = new RegExp('^' + AMOUNT_UNIT + '\\s+(.+)$', 'i');
const TRAILING = new RegExp('^(.+?)\\s+' + AMOUNT_UNIT + '$', 'i');

export function parseFoodInput(text) {
  const t = String(text || '').trim();
  let m = t.match(LEADING);
  if (m) return buildParse(m[3], m[1], m[2]);
  m = t.match(TRAILING);
  if (m) return buildParse(m[1], m[2], m[3]);
  return { name: t };
}

function buildParse(name, amount, unitWord) {
  const quantity = Number(amount);
  if (!Number.isFinite(quantity)) return { name: String(name).trim() };
  // No explicit unit word → treat as a bare count (per-item), unit stays undefined here;
  // caller matches against the resolved food's base unit.
  const unit = unitWord ? normalizeUnit(unitWord) : undefined;
  return unit ? { name: String(name).trim(), quantity, unit } : { name: String(name).trim(), quantity, unit: undefined };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/foodLibrary.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/foodLibrary.js src/utils/foodLibrary.test.js
git commit -m "feat: foodLibrary pure module (scale, parse, fuzzy match, dedupe)"
```

---

## Task 3: Open Food Facts adapter

**Files:**
- Create: `src/utils/openFoodFacts.js`
- Test: `src/utils/openFoodFacts.test.js`

**Interfaces:**
- Consumes: `labelToBaseFood` (Task 2).
- Produces:
  - `lookupBarcode(barcode, { fetchImpl }) → food | null`
  - `searchProducts(query, { fetchImpl, limit }) → food[]`

- [ ] **Step 1: Write the failing test**

Create `src/utils/openFoodFacts.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/openFoodFacts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/openFoodFacts.js`:
```js
import { labelToBaseFood } from './foodLibrary';

const BARCODE_URL = (code) => `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,nutriments,code`;
const SEARCH_URL = (q, limit) =>
  `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=product_name,nutriments`;

// Browsers cannot set OFF's requested custom User-Agent; reads still work. We
// cache aggressively at the resolver layer and never throw — misses return null/[].
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/openFoodFacts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/openFoodFacts.js src/utils/openFoodFacts.test.js
git commit -m "feat: Open Food Facts barcode + search adapter"
```

---

## Task 4: CoFID search over bundled JSON

**Files:**
- Create: `src/utils/cofid.js`
- Create: `src/data/cofid.sample.json` (tiny fixture for tests)
- Test: `src/utils/cofid.test.js`

**Interfaces:**
- Consumes: `fuzzyMatch`, `createLibraryFood` (Task 2/1).
- Produces: `searchCofid(query, dataset, { limit }) → food[]` (dataset injected so tests don't load the real file).

CoFID rows are `{ name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, category }`.

- [ ] **Step 1: Write the failing test**

Create `src/data/cofid.sample.json`:
```json
[
  { "name": "Beef, roast", "kcalPer100g": 183, "proteinPer100g": 29.2, "carbsPer100g": 0, "fatPer100g": 7.3, "category": "Meat" },
  { "name": "Chicken breast, grilled", "kcalPer100g": 148, "proteinPer100g": 32, "carbsPer100g": 0, "fatPer100g": 2.2, "category": "Meat" }
]
```

Create `src/utils/cofid.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/cofid.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/cofid.js`:
```js
import { fuzzyMatch, labelToBaseFood } from './foodLibrary';

// dataset defaults to the bundled full file; injected in tests.
export function searchCofid(query, dataset, { limit = 8 } = {}) {
  const matches = fuzzyMatch(query, dataset, { limit });
  return matches.map((row) => labelToBaseFood({
    name: row.name, source: 'cofid',
    per100g: { calories: row.kcalPer100g, protein: row.proteinPer100g, carbs: row.carbsPer100g, fat: row.fatPer100g },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/cofid.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cofid.js src/utils/cofid.test.js src/data/cofid.sample.json
git commit -m "feat: CoFID generic-food search over bundled dataset"
```

---

## Task 5: CoFID build script + real dataset

**Files:**
- Create: `scripts/build-cofid.cjs`
- Create: `src/data/cofid.json` (generated output, committed)
- Modify: `package.json` (dev-dependency `xlsx` + a `build:cofid` script)

**Interfaces:** none consumed by app code directly; produces `src/data/cofid.json` (same row shape as the fixture).

- [ ] **Step 1: Add the tooling dependency**

Run: `npm install -D xlsx`
Expected: `xlsx` appears under `devDependencies`.

- [ ] **Step 2: Download the CoFID workbook**

Download the "Composition of Foods Integrated Dataset (CoFID)" Excel file from the GOV.UK page
(https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) and save it to
`scripts/cofid-source.xlsx`. This file is **git-ignored** (add `scripts/cofid-source.xlsx` to `.gitignore`) — only the trimmed JSON is committed.

- [ ] **Step 3: Inspect sheet + column names**

Run:
```bash
node -e "const XLSX=require('xlsx');const wb=XLSX.readFile('scripts/cofid-source.xlsx');console.log(wb.SheetNames);const s=wb.Sheets[wb.SheetNames[1]];console.log(XLSX.utils.sheet_to_json(s,{header:1})[2]?.slice(0,12))"
```
Expected: prints sheet names (proximates sheet is usually index 1, named like `1.3 Proximates`) and a header row. Note the exact header text for Food Name, Energy (kcal), Protein, Carbohydrate, Fat — the script matches headers case-insensitively but confirm they contain those words.

- [ ] **Step 4: Write the build script**

Create `scripts/build-cofid.cjs`:
```js
#!/usr/bin/env node
/**
 * Converts the CoFID Excel workbook into a trimmed JSON dataset for offline use.
 * Source (OGL v3.0): https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
 * Usage: node scripts/build-cofid.cjs
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'cofid-source.xlsx');
const OUT = path.join(__dirname, '..', 'src', 'data', 'cofid.json');

const wb = XLSX.readFile(SRC);
// The proximates sheet holds kcal/protein/carb/fat. Find it by name.
const sheetName = wb.SheetNames.find((n) => /proximate/i.test(n)) || wb.SheetNames[1];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });

// Locate the header row (the one containing "Food Name").
const headerIdx = rows.findIndex((r) => r.some((c) => /food name/i.test(String(c))));
const header = rows[headerIdx].map((c) => String(c || '').toLowerCase());
const col = (re) => header.findIndex((h) => re.test(h));

const iName = col(/food name/);
const iKcal = col(/energy.*kcal|kcal/);
const iProt = col(/protein/);
const iCarb = col(/carbohydrate/);
const iFat  = col(/^fat|fat \(g\)|fat$/);

const num = (v) => {
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
};

const out = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  const name = r[iName] && String(r[iName]).trim();
  if (!name) continue;
  out.push({
    name,
    kcalPer100g: num(r[iKcal]),
    proteinPer100g: num(r[iProt]),
    carbsPer100g: num(r[iCarb]),
    fatPer100g: num(r[iFat]),
    category: '',
  });
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`✓ wrote ${out.length} foods to ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
```

- [ ] **Step 5: Generate the dataset + wire the npm script**

Add to `package.json` `scripts`: `"build:cofid": "node scripts/build-cofid.cjs"`.
Run: `npm run build:cofid`
Expected: `✓ wrote ~2900 foods to src/data/cofid.json (a few hundred KB)`. Sanity-check: open `src/data/cofid.json`, confirm a known food (e.g. search "Beef") has plausible kcal/protein.

- [ ] **Step 6: Verify the app can import it**

Run: `npm run build`
Expected: build succeeds; `cofid.json` is bundled. If the bundle warns about size, it's acceptable (few hundred KB, gzipped by the host).

- [ ] **Step 7: Commit**

```bash
git add scripts/build-cofid.cjs src/data/cofid.json package.json package-lock.json .gitignore
git commit -m "build: CoFID Excel-to-JSON converter + generated dataset"
```

---

## Task 6: Shared nutrition resolver

**Files:**
- Create: `src/utils/nutritionResolver.js`
- Test: `src/utils/nutritionResolver.test.js`

**Interfaces:**
- Consumes: `fuzzyMatch` (Task 2), `searchCofid` (Task 4), `lookupBarcode`/`searchProducts` (Task 3), bundled `cofid.json`.
- Produces:
  - `resolveNutrition({ barcode, query, library, deps }) → { food, provenance, verified } | null`
  - `resolveFromPhoto(identification, { library, deps }) → { food, provenance, verified } | null`

`deps` is an injectable `{ lookupBarcode, searchProducts, searchCofid, cofidData }` so tests avoid network + the big JSON. In the app, a default `deps` wires the real modules.

- [ ] **Step 1: Write the failing test**

Create `src/utils/nutritionResolver.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/nutritionResolver.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/nutritionResolver.js`:
```js
import { fuzzyMatch, labelToBaseFood } from './foodLibrary';
import { lookupBarcode as offBarcode, searchProducts as offSearch } from './openFoodFacts';
import { searchCofid } from './cofid';
import cofidData from '../data/cofid.json';

const defaultDeps = { lookupBarcode: offBarcode, searchProducts: offSearch, searchCofid, cofidData };

// Tiered: barcode → OFF; query → library → CoFID → OFF. First hit wins.
export async function resolveNutrition({ barcode, query, library = [], deps = defaultDeps }) {
  if (barcode) {
    const food = await deps.lookupBarcode(barcode);
    if (food) return { food, provenance: 'off', verified: true };
  }
  if (query) {
    const libHit = fuzzyMatch(query, library, { limit: 1 })[0];
    if (libHit) return { food: libHit, provenance: libHit.source || 'manual', verified: libHit.source !== 'ai' };

    const cofidHit = deps.searchCofid(query, deps.cofidData, { limit: 1 })[0];
    if (cofidHit) return { food: cofidHit, provenance: 'cofid', verified: true };

    const offHit = (await deps.searchProducts(query, { limit: 1 }))[0];
    if (offHit) return { food: offHit, provenance: 'off', verified: true };
  }
  return null;
}

// Maps the photo prompt output onto resolveNutrition, falling back to the
// AI-transcribed numbers tagged verified:false.
export async function resolveFromPhoto(identification, { library = [], deps = defaultDeps } = {}) {
  const { barcode, brand, productName, name, per100g, perServing, servingSize } = identification;
  if (barcode) {
    const r = await resolveNutrition({ barcode, library, deps });
    if (r) return r;
  }
  const searchName = [brand, productName].filter(Boolean).join(' ') || name;
  if (searchName) {
    const r = await resolveNutrition({ query: searchName, library, deps });
    if (r) return r;
  }
  if (per100g || perServing) {
    const food = labelToBaseFood({ name: name || productName || 'Scanned item', source: 'ai', per100g, perServing, servingSize });
    return { food, provenance: 'ai', verified: false };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/nutritionResolver.test.js`
Expected: PASS. Then run the full suite: `npm test` — all prior tests still green (69 existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/utils/nutritionResolver.js src/utils/nutritionResolver.test.js
git commit -m "feat: shared tiered nutrition resolver + resolveFromPhoto"
```

---

## Task 7: `useFoodLibrary` hook

**Files:**
- Create: `src/hooks/useFoodLibrary.js`

**Interfaces:**
- Consumes: `useLocalStorageArray` (`src/hooks/useLocalStorage.js`), `addOrUpdateFood`/`touchEntry`/`fuzzyMatch` (Task 2), `createSavedMeal` (Task 1).
- Produces: `useFoodLibrary()` → `{ foods, meals, saveFood, saveMeal, removeEntry, touch, search }`.

This is thin wiring over tested pure functions; no unit test (no RTL). Verified via lint + build + manual.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useFoodLibrary.js`:
```js
import { useCallback, useMemo } from 'react';
import { useLocalStorageArray } from './useLocalStorage';
import { addOrUpdateFood, touchEntry, fuzzyMatch } from '../utils/foodLibrary';
import { createSavedMeal } from '../utils/dataSchemas';

export function useFoodLibrary() {
  const { items, setItems, remove } = useLocalStorageArray('pump-food-library', []);

  const foods = useMemo(() => items.filter((e) => e.kind === 'food'), [items]);
  const meals = useMemo(() => items.filter((e) => e.kind === 'meal'), [items]);

  const saveFood = useCallback((food) => setItems((prev) => addOrUpdateFood(prev, food)), [setItems]);
  const saveMeal = useCallback((name, components) =>
    setItems((prev) => [...prev, createSavedMeal({ name, components })]), [setItems]);
  const touch = useCallback((id) => setItems((prev) => touchEntry(prev, id)), [setItems]);

  const search = useCallback((query) => ({
    foods: fuzzyMatch(query, foods, { limit: 6 }),
    meals: fuzzyMatch(query, meals, { limit: 3 }),
  }), [foods, meals]);

  return { foods, meals, saveFood, saveMeal, removeEntry: remove, touch, search };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: no new errors referencing `useFoodLibrary`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFoodLibrary.js
git commit -m "feat: useFoodLibrary hook over pump-food-library"
```

---

## Task 8: QuantitySheet component

**Files:**
- Create: `src/components/food/QuantitySheet.jsx`

**Interfaces:**
- Consumes: `scaleFood` (Task 2).
- Produces: `<QuantitySheet food initialQuantity onConfirm onCancel />`, where `onConfirm(item)` receives a scaled item `{ name, quantity, unit, calories, protein, carbs, fat, source }`.

- [ ] **Step 1: Write the component**

Create `src/components/food/QuantitySheet.jsx`:
```jsx
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { scaleFood } from '../../utils/foodLibrary';

export default function QuantitySheet({ food, initialQuantity, onConfirm, onCancel }) {
  const [qty, setQty] = useState(String(initialQuantity ?? food.base.amount));
  const quantity = parseFloat(qty) || 0;
  const scaled = scaleFood(food, quantity);
  const unitLabel = food.base.unit === 'g' || food.base.unit === 'ml' ? food.base.unit : `× ${food.base.unit}`;

  const confirm = () => {
    if (quantity <= 0) return;
    onConfirm({ name: food.name, quantity, unit: food.base.unit, ...scaled, source: food.source });
  };

  return (
    <div className="bg-bg rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1 truncate" title={food.name}>{food.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{food.source}</span>
        <button onClick={onCancel} className="text-text-muted hover:text-danger"><X size={14} /></button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="decimal" value={qty} autoFocus
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          className="w-24 bg-surface border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
        />
        <span className="text-sm text-text-muted flex-1">{unitLabel}</span>
        <button onClick={confirm} disabled={quantity <= 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-bg disabled:opacity-40 shrink-0">
          <Check size={14} />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {[['kcal', scaled.calories], ['P', `${scaled.protein}g`], ['C', `${scaled.carbs}g`], ['F', `${scaled.fat}g`]].map(([k, v]) => (
          <div key={k} className="bg-surface rounded py-1.5">
            <div className="text-text-muted">{k}</div>
            <div className="font-medium tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint && npm run build`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/food/QuantitySheet.jsx
git commit -m "feat: QuantitySheet base-unit entry with live scaled 4-macro preview"
```

---

## Task 9: Text logging — suggestions, parse, and 4-macro display

**Files:**
- Create: `src/components/food/FoodSuggestions.jsx`
- Modify: `src/components/MealLogger.jsx`

**Interfaces:**
- Consumes: `useFoodLibrary` (Task 7), `parseFoodInput`/`normalizeUnit`/`scaleFood` (Task 2), `resolveNutrition` (Task 6), `QuantitySheet` (Task 8).
- Produces: updated MealLogger where typing resolves via the tiers; `FoodSuggestions` list.

- [ ] **Step 1: Write FoodSuggestions**

Create `src/components/food/FoodSuggestions.jsx`:
```jsx
import { Star, Utensils } from 'lucide-react';

// results: { foods: food[], meals: meal[] }. onPickFood(food), onPickMeal(meal).
export default function FoodSuggestions({ results, onPickFood, onPickMeal }) {
  const { foods = [], meals = [] } = results || {};
  if (foods.length === 0 && meals.length === 0) return null;
  return (
    <div className="bg-bg border border-border rounded-lg divide-y divide-border overflow-hidden">
      {meals.map((m) => (
        <button key={m.id} onClick={() => onPickMeal(m)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-light">
          <Utensils size={13} className="text-accent shrink-0" />
          <span className="text-sm flex-1 truncate">{m.name}</span>
          <span className="text-[10px] uppercase text-text-muted">meal</span>
        </button>
      ))}
      {foods.map((f) => (
        <button key={f.id} onClick={() => onPickFood(f)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-light">
          {f.source === 'manual' && <Star size={13} className="text-accent shrink-0" />}
          <span className="text-sm flex-1 truncate">{f.name}</span>
          <span className="text-xs text-text-muted tabular-nums">{f.calories} / {f.protein}g</span>
          <span className="text-[10px] uppercase text-text-muted">{f.source}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire parse + resolve into MealLogger's text flow**

In `src/components/MealLogger.jsx`:

Add imports at the top:
```jsx
import { useFoodLibrary } from '../hooks/useFoodLibrary';
import { parseFoodInput, normalizeUnit, scaleFood } from '../utils/foodLibrary';
import { resolveNutrition } from '../utils/nutritionResolver';
import FoodSuggestions from './food/FoodSuggestions';
import QuantitySheet from './food/QuantitySheet';
```

Inside the component, add hook + state (near the existing `useState` calls):
```jsx
const { foods, meals, saveFood, saveMeal, touch, search } = useFoodLibrary();
const [quantityFood, setQuantityFood] = useState(null); // { food, initialQuantity } | null
const suggestions = draft.trim().length >= 2 ? search(parseFoodInput(draft).name) : { foods: [], meals: [] };
```

Add a shared helper to append a scaled item:
```jsx
const addScaledItem = (item) => {
  setItems((prev) => [...prev, item]);
  setDraft('');
  setQuantityFood(null);
  draftInputRef.current?.focus();
};
```

Add a pick handler that honours an inline-parsed quantity (this is the `320g roast beef` path):
```jsx
const pickFood = (food) => {
  const parsed = parseFoodInput(draft);
  if (parsed.quantity && (!parsed.unit || normalizeUnit(parsed.unit) === normalizeUnit(food.base.unit))) {
    touch(food.id);
    addScaledItem({ name: food.name, quantity: parsed.quantity, unit: food.base.unit, ...scaleFood(food, parsed.quantity), source: food.source });
  } else {
    setQuantityFood({ food, initialQuantity: parsed.quantity ?? food.base.amount });
  }
};
const pickMeal = (meal) => {
  touch(meal.id);
  setItems((prev) => [...prev, ...meal.components.map((c) => ({ ...c, source: 'manual' }))]);
  setDraft('');
  draftInputRef.current?.focus();
};
```

Replace the existing `handleEstimate` so it tries the resolver first, then falls back to the AI:
```jsx
const handleEstimate = async () => {
  if (!draft.trim() || estimating) return;
  setError(null);
  const parsed = parseFoodInput(draft.trim());
  // Tier 1–3: barcode-less resolve against library → CoFID → OFF.
  const resolved = await resolveNutrition({ query: parsed.name, library: foods });
  if (resolved) { pickFood(resolved.food); return; }
  // Tier 4: existing AI estimate on the whole phrase.
  if (!isConfigured()) { setError('Configure AI provider in Settings first'); return; }
  setEstimating(true);
  try {
    const item = await estimateItem(draft.trim());
    setItems((prev) => [...prev, item]);
    setDraft('');
    draftInputRef.current?.focus();
  } catch (err) {
    setError(err.message || 'Could not estimate — try rephrasing');
  } finally {
    setEstimating(false);
  }
};
```

Render `FoodSuggestions` and `QuantitySheet` just under the description input row (after the hidden file input):
```jsx
{quantityFood ? (
  <QuantitySheet
    food={quantityFood.food}
    initialQuantity={quantityFood.initialQuantity}
    onConfirm={(item) => { touch(quantityFood.food.id); addScaledItem(item); }}
    onCancel={() => setQuantityFood(null)}
  />
) : (
  <FoodSuggestions results={suggestions} onPickFood={pickFood} onPickMeal={pickMeal} />
)}
```

- [ ] **Step 3: Update the confirmed-item rows to show 4 macros**

In the confirmed-items map, replace the two-column kcal/protein layout with a primary row (name · kcal · protein, still tap-to-edit as today) plus a secondary muted line for carbs/fat. Add below the existing protein cell block, inside the item container:
```jsx
<div className="col-span-12 text-[11px] text-text-muted flex gap-3 pl-1">
  <span>C {item.carbs ?? '–'}g</span>
  <span>F {item.fat ?? '–'}g</span>
</div>
```
Keep the existing tap-to-edit buttons for calories and protein unchanged.

- [ ] **Step 4: Update the totals to sum 4 macros**

Replace the `totals` reducer:
```jsx
const totals = items.reduce(
  (acc, item) => ({
    calories: acc.calories + (Number(item.calories) || 0),
    protein: acc.protein + (Number(item.protein) || 0),
    carbs: acc.carbs + (Number(item.carbs) || 0),
    fat: acc.fat + (Number(item.fat) || 0),
  }),
  { calories: 0, protein: 0, carbs: 0, fat: 0 }
);
```
And extend the footer total line to include `· {totals.carbs}g C · {totals.fat}g F`.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: no new errors.
Then start the preview and confirm behaviour manually (Task 13 covers full end-to-end): typing `2` matching foods shows suggestions; typing `320g <saved food>` and picking it fills scaled macros.

- [ ] **Step 6: Commit**

```bash
git add src/components/food/FoodSuggestions.jsx src/components/MealLogger.jsx
git commit -m "feat: library-first text logging with inline quantity parsing + 4-macro display"
```

---

## Task 10: Save-to-library and save-meal actions

**Files:**
- Modify: `src/components/MealLogger.jsx`

**Interfaces:**
- Consumes: `useFoodLibrary.saveFood`/`saveMeal` (Task 7), `createLibraryFood` (Task 1).

- [ ] **Step 1: Add per-item "Save to my foods"**

Add a small save button to each confirmed-item row (next to the trash button). Tapping opens an inline mini-form to pick the base unit/amount the saved macros correspond to (default `{amount: quantity, unit}` from the item, meaning "these macros = this logged amount"):
```jsx
const saveItemToLibrary = (item) => {
  // Interpret the item's macros as the macros for its logged quantity → per-base food.
  const base = { amount: item.quantity || 1, unit: item.unit || 'serving' };
  saveFood(createLibraryFood({
    name: item.name, base, source: item.source === 'ai' ? 'manual' : (item.source || 'manual'),
    calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
  }));
};
```
Wire a `<Bookmark size={14} />` button (import `Bookmark` from lucide-react) calling `saveItemToLibrary(item)`; show a brief "Saved" confirmation via existing error/toast affordance or a transient state.

- [ ] **Step 2: Add footer "Save this meal"**

Add a secondary button beside "Log Meal" in the footer, enabled when `items.length > 0`:
```jsx
const [mealName, setMealName] = useState('');
const [namingMeal, setNamingMeal] = useState(false);
const doSaveMeal = () => {
  if (!mealName.trim()) return;
  saveMeal(mealName.trim(), items);
  setMealName(''); setNamingMeal(false);
};
```
Render a small inline name input when `namingMeal`, with a confirm calling `doSaveMeal`.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/MealLogger.jsx
git commit -m "feat: save individual foods and whole meals to the library"
```

---

## Task 11: Barcode scanning

**Files:**
- Modify: `src/components/MealLogger.jsx`
- Modify: `package.json` (add `@zxing/library`)

**Interfaces:**
- Consumes: `lookupBarcode` (Task 3), `resolveNutrition`/`QuantitySheet` (Tasks 6/8).

- [ ] **Step 1: Add the fallback dependency**

Run: `npm install @zxing/library`
Expected: appears under `dependencies`.

- [ ] **Step 2: Add a scan helper**

Create `src/utils/barcodeScan.js`:
```js
// Uses the native BarcodeDetector when available (Chrome/Android), else zxing.
export async function detectBarcodeFromImage(bitmapSource) {
  if ('BarcodeDetector' in window) {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    const codes = await detector.detect(bitmapSource);
    return codes[0]?.rawValue || null;
  }
  const { BrowserMultiFormatReader } = await import('@zxing/library');
  const reader = new BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageElement(bitmapSource);
    return result?.getText() || null;
  } catch { return null; }
}
```

- [ ] **Step 3: Wire a barcode button in MealLogger**

Add a barcode `<ScanBarcode size={16} />` button (import from lucide-react) next to the camera/gallery buttons. It triggers a photo capture reused from the existing file input, but routes to a barcode handler:
```jsx
import { detectBarcodeFromImage } from '../utils/barcodeScan';
import { lookupBarcode } from '../utils/openFoodFacts';

const handleBarcodePhoto = async (file) => {
  setError(null);
  try {
    const img = await createImageBitmap(file);
    const code = await detectBarcodeFromImage(img);
    if (!code) { setError('No barcode detected — try again or type the food'); return; }
    const food = await lookupBarcode(code);
    if (!food) { setError('Product not in Open Food Facts — type it or snap the label'); return; }
    setQuantityFood({ food, initialQuantity: food.base.amount });
  } catch {
    setError('Barcode scan failed');
  }
};
```
Use a dedicated hidden `<input type="file" accept="image/*" capture="environment">` whose `onChange` calls `handleBarcodePhoto(e.target.files[0])`.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run build`
Expected: no new errors. Manual check on an Android device or Chrome desktop with a barcode image (full E2E in Task 13).

- [ ] **Step 5: Commit**

```bash
git add src/utils/barcodeScan.js src/components/MealLogger.jsx package.json package-lock.json
git commit -m "feat: barcode scan → Open Food Facts lookup in meal logger"
```

---

## Task 12: Photo identification pipeline

**Files:**
- Modify: `src/components/MealLogger.jsx`

**Interfaces:**
- Consumes: `resolveFromPhoto` (Task 6), `QuantitySheet` (Task 8).
- Produces: replaces `analyzePhotoWithPortion` with an identification prompt + DB cross-reference.

- [ ] **Step 1: Replace the photo prompt with an identification prompt**

In `src/components/MealLogger.jsx`, replace the `analyzePhotoWithPortion` helper with `identifyPhoto`, which asks the model to *identify*, not compute:
```js
async function identifyPhoto(base64, note) {
  const { provider, apiKey } = getApiConfig();
  if (provider === 'cli') throw new Error('Photo not supported with CLI proxy — switch to Anthropic or OpenRouter');
  const prompt = `Identify the food in this image. The user adds: "${note}".
Return ONLY JSON, no prose:
{"type":"label|packaged|meal",
 "barcode":"digits if a barcode is clearly legible else null",
 "brand":"brand if visible else null",
 "productName":"product or food name",
 "name":"clean food name",
 "servingSize":{"amount":number,"unit":"g|ml|serving"} or null,
 "per100g":{"calories":n,"protein":n,"carbs":n,"fat":n} or null,   // ONLY if a label shows per-100g values — transcribe, do not calculate
 "perServing":{"calories":n,"protein":n,"carbs":n,"fat":n} or null,
 "mealEstimate":{"calories":n,"protein":n,"carbs":n,"fat":n} or null // ONLY for type:meal, estimate for the stated portion
}`;
  const raw = await callVisionModel(prompt, base64, provider, apiKey); // see Step 2
  return parseIdentification(raw);
}

function parseIdentification(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not read the photo');
  return JSON.parse(match[0]);
}
```

- [ ] **Step 2: Extract the vision call**

Factor the existing OpenRouter/Anthropic multimodal fetch (currently inside `analyzePhotoWithPortion`) into `callVisionModel(prompt, base64, provider, apiKey)` returning the raw text. Keep both provider branches intact (OpenRouter `image_url`, Anthropic `image` with `media_type`/`data`), raising `max_tokens` to `300` for the larger JSON.

- [ ] **Step 3: Cross-reference and route the result**

Replace `confirmPortion` so it identifies, resolves against the DB, then routes to the quantity sheet (label/packaged) or straight to items (meal):
```jsx
import { resolveFromPhoto } from '../utils/nutritionResolver';

const confirmPortion = async (index) => {
  const pending = pendingItems[index];
  if (!pending.note.trim() || confirmingIndex === index) return;
  setConfirmingIndex(index); setError(null);
  try {
    const ident = await identifyPhoto(pending.base64, pending.note.trim());
    if (ident.type === 'meal') {
      const m = ident.mealEstimate || {};
      addScaledItem({ name: ident.name || 'Meal', quantity: 1, unit: 'serving',
        calories: m.calories || 0, protein: m.protein || 0, carbs: m.carbs || 0, fat: m.fat || 0, source: 'ai' });
      setPendingItems((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    const resolved = await resolveFromPhoto(ident, { library: foods });
    if (!resolved) { setError('Could not read that — type the food instead'); return; }
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
    setQuantityFood({ food: resolved.food, initialQuantity: resolved.food.base.amount });
  } catch (err) {
    setError(err.message || 'Failed to analyse photo');
  } finally {
    setConfirmingIndex(null);
  }
};
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run build`
Expected: no new errors. Manual E2E in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/components/MealLogger.jsx
git commit -m "feat: photo becomes DB-cross-referenced identification, not raw estimation"
```

---

## Task 13: Coach `lookup_nutrition` tool, backup/restore, totals, docs

**Files:**
- Modify: `src/services/ai/context.js`, `src/services/ai/providers.js`
- Modify: `src/hooks/useSettings.js`
- Modify: `src/hooks/useNutritionLogs.js`
- Modify: `CLAUDE.md`, `USER_GUIDE.md`

**Interfaces:**
- Consumes: `resolveNutrition` (Task 6).

- [ ] **Step 1: Add carbs/fat tolerance to nutrition totals**

In `src/hooks/useNutritionLogs.js`, the totals reducers already coerce missing values via `Number(...) || 0`; extend `getTodaysTotals`, `getDailyTotals` (and their reducers) to also accumulate `carbs` and `fat` the same way, returning them in the object. Existing kcal/protein keys unchanged. (Displays that read only kcal/protein keep working.)

- [ ] **Step 2: Add `pump-food-library` to backup/restore/clear**

In `src/hooks/useSettings.js`:
- `exportData`: add `foodLibrary: localStorage.getItem('pump-food-library')`.
- import key-map array: add `['foodLibrary', 'pump-food-library']`.
- `clearAllData` `keys` array: add `'pump-food-library'`.

- [ ] **Step 3: Register the Coach tool**

In `src/services/ai/context.js` (tool definitions) add an 8th tool:
```js
{
  name: 'lookup_nutrition',
  description: 'Look up verified calories/protein/carbs/fat per 100g (or per unit) for a food, by name or barcode. Use before logging a meal to ground the numbers instead of guessing.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string' }, barcode: { type: 'string' } },
  },
}
```

- [ ] **Step 4: Implement the tool executor**

In `src/services/ai/providers.js`, where the existing 7 client-side tools are dispatched, add a case for `lookup_nutrition`:
```js
case 'lookup_nutrition': {
  const { resolveNutrition } = await import('../../utils/nutritionResolver');
  const library = JSON.parse(localStorage.getItem('pump-food-library') || '[]').filter((e) => e.kind === 'food');
  const r = await resolveNutrition({ query: input.query, barcode: input.barcode, library });
  return r
    ? JSON.stringify({ found: true, verified: r.verified, provenance: r.provenance, food: r.food })
    : JSON.stringify({ found: false });
}
```
Match the surrounding return-shape convention (the existing tools return a string `tool_result`; mirror exactly how they wrap results).

- [ ] **Step 5: Update docs**

- `CLAUDE.md`: in the Coach client-side tools list, bump "7 tools" → "8 tools" and add `lookup_nutrition`. In "Current State", add a "Smart food logging" bullet (library, tiers, barcode, CoFID+OFF attribution). Add `pump-food-library` to the localStorage keys table.
- `USER_GUIDE.md`: add a short "Saving foods & scanning barcodes" section; include CoFID (OGL v3.0) and Open Food Facts (ODbL) attribution lines.

- [ ] **Step 6: Full test + build**

Run: `npm test`
Expected: all unit tests pass (existing 69 + new suites).
Run: `npm run build`
Expected: clean build.

- [ ] **Step 7: End-to-end manual verification (preview)**

Build + preview (`npm run build && node scripts/deploy.cjs && npm run preview`, or `/pump-test`). Verify, per the spec's acceptance:
1. Type `320g roast beef` (with a CoFID hit) → picks it, macros scale ×3.2, all four populate.
2. Save a food, then type its name → appears in suggestions with a star, picks with your saved macros.
3. Save a whole meal → typing its name inserts all items.
4. Barcode-scan a UK product → verified per-100g macros → quantity sheet.
5. Photo a label → identified + cross-referenced; a plate → estimated. Both land in the item list with 4 macros.
6. Export/import a backup → the food library round-trips.

- [ ] **Step 8: Commit**

```bash
git add src/services/ai/context.js src/services/ai/providers.js src/hooks/useSettings.js src/hooks/useNutritionLogs.js CLAUDE.md USER_GUIDE.md
git commit -m "feat: Coach lookup_nutrition tool, food-library backup, carbs/fat totals, docs"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (T1), pure logic incl. parsing (T2), OFF (T3), CoFID search + build (T4/T5), shared resolver + photo (T6), hook (T7), quantity sheet (T8), text/suggestions/parse/display (T9), save actions (T10), barcode (T11), photo pipeline (T12), Coach tool + backup + totals + docs (T13). All §1–§9 spec sections map to a task.
- **Carbs/fat scope:** captured + shown in logger (T1, T8, T9); explicitly not in targets/dashboard/Progress/Coach LOG_MEAL (Global Constraints + spec §8).
- **Never-hard-fail:** every network path returns null/[]/tagged-fallback (T3, T6, T11, T12).
- **Type consistency:** `scaleFood`→`{calories,protein,carbs,fat}`, resolver→`{food,provenance,verified}`, scaled item shape identical across T8/T9/T12. `source` provenance values consistent.
- **Known real-world risk:** CoFID sheet/column names must be confirmed against the downloaded workbook (T5 Step 3); OFF CORS must hold in-browser (falls through to AI on failure, so non-fatal).

# Smart food logging — personal library + UK nutrition databases

**Date:** 2026-07-02
**Status:** Approved — ready for implementation planning

---

## Overview

Food logging today is a fresh AI guess every time. Two failure modes drive the pain:

1. **Nutrition-label photos throw wild numbers** — the photo path (`analyzePhotoWithPortion`) uses one generic *"this is a food photo"* prompt for both plated meals **and** labels. A label isn't "food shown"; it's per-serving structured data the model must read *and* scale by portion. Haiku frequently botches the scaling.
2. **Protein is often wrong** — text estimates (`estimateItem`) are ungrounded guesses, and repeat foods get re-guessed (re-wrong) every time.

This redesign replaces "guess every time" with a **tiered accuracy model**, where the AI is the *fallback*, not the default:

| Tier | Source | For | Cost |
|------|--------|-----|------|
| 1 | Barcode → Open Food Facts | UK packaged products (exact per-100g) | Network, no key |
| 2 | Text search → CoFID (offline) then OFF | Generic whole foods, then branded | Bundled / network |
| 3 | Personal food library | Anything you've saved/corrected | Local, instant |
| 4 | AI photo/text estimate | Home-cooked / restaurant plates | AI tokens |

The AI only runs when a food is genuinely *not* in a database or your library — exactly when estimation is unavoidable.

**Photos feed the top tiers, not tier 4.** A photo is treated as an *identification* input: Claude reads the barcode digits / brand / product name (or names the foods on a plate), then the app cross-references the database for **verified** macros. Claude's own transcribed numbers are used only as a tagged fallback when nothing matches. So the wild-label-numbers bug is fixed twice over — Claude never does the portion arithmetic, and when the product is in the DB it doesn't supply the numbers at all.

**Why not MCP:** MCP is a protocol for brokering an agent to external tools. Pump is a zero-backend browser PWA; hosting or bundling an MCP server contradicts that principle, only works on the Anthropic provider, and bills tokens to broker what is fundamentally a REST/lookup call. The accuracy comes from the *data source*, which we integrate directly. (Coach still gets a nutrition tool — see §6 — via the existing client-side tool-use mechanism, not MCP.)

**Units:** per-100g / per-serving / per-item base units only. No unit-conversion system (g↔oz) in v1.

---

## 1. Data model — `pump-food-library`

A single localStorage array holding two entity kinds, discriminated by `kind`.

### Library food (`kind: 'food'`)
```js
{
  id: 'food-<ts>',
  kind: 'food',
  name: 'Chicken breast, grilled',
  base: { amount: 100, unit: 'g' },   // or {amount:1, unit:'serving'} / 'scoop' / 'egg' / 'slice'
  calories: 165,                       // PER base unit
  protein: 31,                         // PER base unit
  source: 'off' | 'cofid' | 'ai' | 'manual',  // provenance, for trust/UI
  barcode: '5000000000000' | null,     // when from OFF barcode
  createdAt, lastUsed, useCount
}
```

### Saved meal (`kind: 'meal'`)
```js
{
  id: 'savedmeal-<ts>',
  kind: 'meal',
  name: 'My usual breakfast',
  components: [                         // snapshot of scaled items (deterministic)
    { name, quantity, unit, calories, protein }
  ],
  createdAt, lastUsed, useCount
}
```

Meals **snapshot** their items' final macros — editing a food later does not cascade into previously-saved meals. Simple, predictable.

Both `createLibraryFood` and `createSavedMeal` factories live in `utils/dataSchemas.js` alongside the existing `createMealLog` etc.

Backup/restore (`hooks/useSettings.js`) adds `pump-food-library` to the export object, the import key-map, and the `clearAllData` key list.

---

## 2. Pure logic — `utils/foodLibrary.js` (+ `foodLibrary.test.js`)

Follows the established `progressCalcs.js` pattern: all maths in a pure, unit-tested module.

- `scaleFood(food, quantity)` → `{ calories, protein }` = per-base × (quantity ÷ `base.amount`), rounded (reuse the `round1` convention).
- `parseFoodInput(text)` → `{ name, quantity?, unit? }`. Extracts an explicit amount+unit from either end of the phrase (`320g roast beef`, `roast beef 320g`, `2 eggs`, `1 scoop whey`) and returns the stripped food name; `{ name }` alone when no quantity is present.
- `fuzzyMatch(query, library, { limit })` → ranked matches across foods **and** meals. Normalised (lowercase, trim, strip punctuation) token/substring scoring, no external dependency. Tie-break by `useCount` desc then `lastUsed` desc.
- `labelToBaseFood(labelJson)` → normalises an OFF product or a transcribed label into a `food` entity, **preferring per-100g** as the base, falling back to per-serving.
- `addOrUpdateFood(library, food)` → dedupe by normalised `name` + `unit`; bumps `useCount`/`lastUsed` on re-add.
- `touchEntry(library, id)` → bump usage stats on select.

`hooks/useFoodLibrary.js` wraps `useLocalStorageArray('pump-food-library', [])` and exposes `foods`, `meals`, `addFood`, `addMeal`, `updateEntry`, `removeEntry`, `touch`, and a memoised `search(query)`.

---

## 3. CoFID dataset (Tier 2, offline generics)

- Source: *Composition of Foods Integrated Dataset* (Public Health England), Open Government Licence v3.0 — free to reuse **with attribution**.
- Published as Excel (~4.4 MB). A **build-time script** (`scripts/build-cofid.cjs`) converts it to a trimmed static JSON: `{ name, kcalPer100g, proteinPer100g, category }` per food (~2,900 foods). Keeping only name/kcal/protein yields a few hundred KB, far less gzipped.
- Output committed to `src/data/cofid.json` (or `public/`), loaded lazily on first generic search. It rides the asset bundle behind the service worker → **works fully offline, never touches the 5 MB localStorage quota.**
- `utils/cofid.js` exposes `searchCofid(query, { limit })` reusing the same fuzzy-match core as the library.
- Attribution line added to Settings/About and to the USER_GUIDE.

---

## 4. Open Food Facts (Tiers 1–2, packaged)

- `utils/openFoodFacts.js`:
  - `lookupBarcode(barcode)` → `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`, maps `product.nutriments['energy-kcal_100g']` and `['proteins_100g']` → a per-100g base food. Returns `null` on not-found/no-nutriments.
  - `searchProducts(query)` → OFF text search (Search-a-licious endpoint, since v2 has no server-side full-text). Secondary to CoFID for generics; primary use of OFF is barcode.
- **Constraints (honest):** browsers can't set OFF's requested custom `User-Agent` (forbidden header) — reads still work; we mitigate by caching results into the library on save and respecting ~15 reads/min. Wrap calls with a small in-memory cache + graceful "couldn't reach Open Food Facts" error that falls through to manual/AI entry. CORS must be re-verified during implementation; if a read is blocked, fall through to the AI/manual path (never hard-fail the log).

### Shared resolver — `utils/nutritionResolver.js`

The tiered lookup is used by **three surfaces** (MealLogger text search, the photo pipeline, and Coach's tool), so it lives in one place:

- `resolveNutrition({ barcode?, query? })` → tries, in order: `barcode` → OFF; `query` → library (Tier 3) → CoFID (Tier 2) → OFF search (Tier 2). Returns `{ food, provenance, verified: boolean }` or `null`.
- `resolveFromPhoto(identification)` → maps the photo prompt's output (barcode / brand+name / meal foods) onto `resolveNutrition`, falling back to the AI's transcribed numbers tagged `verified: false`.

This is the single orchestrator; the pure `foodLibrary.js` stays network-free, and `nutritionResolver.js` composes it with `cofid.js` + `openFoodFacts.js`.

---

## 5. MealLogger UI changes

`MealLogger.jsx` is already ~290 lines. Extract focused components rather than bloat it:

- **Inline quantity parsing** — the typed phrase is parsed for an explicit amount+unit before matching, so `320g roast beef`, `roast beef 320g`, `2 eggs`, `1 scoop whey` resolve in **one shot**: parse → strip to the food name → resolve → auto-scale → populate kcal/protein. This is the default happy path — deterministic, no AI, no second tap.
  - `parseFoodInput(text)` (pure, in `foodLibrary.js`) → `{ name, quantity, unit }` or `{ name }` when no quantity is present. Handles amount at either end, common units (`g`, `ml`, and per-item words → count).
  - **Scaling applies only when the parsed unit matches the resolved food's base unit** (explicit weights, or per-item foods). On a mismatch (e.g. `2 slices` vs a per-100g food), fall through to `QuantitySheet` rather than guess a slice weight.
- **`components/food/FoodSuggestions.jsx`** — as the user types, a dropdown of fuzzy matches from **library foods + saved meals** (Tier 3) and, on demand, CoFID/OFF results (Tiers 1–2). Each row shows name, base unit, resolved macros, and a small provenance tag. When several DB entries match one name (e.g. `roast beef` → multiple CoFID cuts), the **best match is applied but any row can be tapped to swap** — never a silent arbitrary pick.
  - No quantity parsed, tap a **food** → opens `QuantitySheet` with the base amount pre-filled.
  - Tap a **saved meal** → inserts all its component items at once.
  - Name resolves but not found in any tier → the whole typed phrase goes to the Tier-4 AI estimate (today's `✓` behaviour).
- **`components/food/QuantitySheet.jsx`** — base-unit quantity entry (pre-filled with `base.amount`) with a **live scaled preview** of kcal/protein. Confirm → adds the scaled item. No AI call, no guessing.
- **Barcode button** — new control alongside camera/gallery. Uses the native `BarcodeDetector` API (Chrome/Android — the real target), with `@zxing/library` as a fallback for unsupported browsers. On scan → `lookupBarcode` → `QuantitySheet` (base 100g) → add item, with one-tap **Save to my foods**.
- **Photo flow (identify → cross-reference DB → fallback)** — `analyzePhotoWithPortion` is replaced by an **identification-first** pipeline. The photo is an input for *identifying the product*, not the source of the numbers; the database is the source of truth. One combined prompt returns:
  - `type: 'label' | 'packaged' | 'meal'`
  - For `label`/`packaged`: `barcode` (the digits, if legible in the shot), `brand`, `productName`, plus a transcribed `servingSize` + `per_serving`/`per_100g` as **fallback only**.
  - For `meal`: a list of identified foods + a stated/estimated portion.

  The app then **cross-references** (`resolveFromPhoto`, reusing the §2/§4 resolver):
  1. `barcode` legible → `lookupBarcode(barcode)` (OFF) → **verified** base food.
  2. else `brand` + `productName` → `searchProducts` (OFF) → confident hit → **verified**.
  3. `meal` foods → match each against library/CoFID for verified generics.
  4. **No DB hit** → fall back to the AI's transcribed label numbers (labels) or portion estimate (meals), **clearly tagged as an estimate** vs. a verified DB result.

  The resolved food opens `QuantitySheet` (base unit) → scales locally → adds. This makes the photo a *lookup key* rather than a calculator — **the direct fix for the wild-label-numbers bug**, since Claude never does the portion arithmetic and, when the product is in the DB, never supplies the numbers at all. "Save to my foods" stores the resolved macros + barcode for instant Tier-3 reuse.
- **Per-item "Save to my foods"** — captures any confirmed item (AI, label, or manual) into the library as a base-unit food (user sets base amount/unit if not already known).
- **Footer "Save this meal"** — snapshots the current item list as a `saved meal` with a name prompt.

Existing manual-edit-of-macros behaviour is preserved throughout.

---

## 6. Coach `lookup_nutrition` tool

Add an 8th client-side tool to Coach's existing tool-use loop (`services/ai/`), Anthropic provider only (consistent with the current 7-tool pattern and its documented limitation).

- Tool `lookup_nutrition({ query?, barcode? })` → calls the shared `resolveNutrition` (§4). Returns per-100g (or per-base) macros + provenance + `verified` flag as a `tool_result`.
- Lets Coach ground `[LOG_MEAL]` in verified data instead of guessing. Same accuracy tiers, conversational surface.
- Documented in CLAUDE.md's AI-tools section and the tool count updated (7 → 8).

---

## 7. Testing

- `utils/foodLibrary.test.js` — `scaleFood` maths (100g and per-item bases, fractional quantities), `parseFoodInput` (amount at either end, per-item counts, no-quantity, junk input), `fuzzyMatch` ranking + tie-breaks, `labelToBaseFood` normalisation (per-100g preferred, per-serving fallback), `addOrUpdateFood` dedupe.
- `utils/cofid.test.js` — search against a small fixture; kcal/protein mapping.
- `utils/openFoodFacts.test.js` — nutriment field mapping and null-handling with mocked fetch (no live network in tests).
- All added to the existing Vitest suite (`npm test`).

---

## 8. Out of scope (v1)

- Unit conversion (g↔oz, ml↔g density). Base unit is fixed per food.
- Barcode → OFF *write-back* (contributing missing products upstream).
- Fat/carbs tracking — Pump tracks kcal + protein only; databases expose more but we map just those two for now.
- Meal-photo *multi-item* segmentation (one photo → many items). Still one estimate per photo.

---

## 9. Files touched

**New**
- `src/utils/foodLibrary.js` + `.test.js`
- `src/utils/cofid.js` + `.test.js`
- `src/utils/openFoodFacts.js` + `.test.js`
- `src/utils/nutritionResolver.js` + `.test.js` (shared tiered resolver + `resolveFromPhoto`)
- `src/hooks/useFoodLibrary.js`
- `src/components/food/FoodSuggestions.jsx`
- `src/components/food/QuantitySheet.jsx`
- `src/data/cofid.json` (generated)
- `scripts/build-cofid.cjs`

**Edited**
- `src/components/MealLogger.jsx` — suggestions, quantity sheet, barcode button, photo auto-detect branch, save actions
- `src/utils/dataSchemas.js` — `createLibraryFood`, `createSavedMeal`
- `src/hooks/useSettings.js` — backup/restore + clear include `pump-food-library`
- `src/services/ai/*` — `lookup_nutrition` tool
- `CLAUDE.md`, `USER_GUIDE.md` — new flows, tool count, CoFID/OFF attribution

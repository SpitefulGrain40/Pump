import { fuzzyMatch, labelToBaseFood } from './foodLibrary';
import { lookupBarcode as offBarcode, searchProducts as offSearch } from './openFoodFacts';
import { searchCofid } from './cofid';
import cofidData from '../data/cofid.json';

const defaultDeps = { lookupBarcode: offBarcode, searchProducts: offSearch, searchCofid, cofidData };

// Committing resolution — never guesses on your behalf. Only trusts a
// verified barcode-ID lookup or an Open Food Facts text match. Library and
// CoFID are deliberately NOT tried here: those are only ever committed via an
// explicit tap on the live suggestions dropdown (searchSuggestions below),
// where you can see the candidate before it's used. A name typed or read off
// a photo never silently fuzzy-matches a library/CoFID entry — that's how a
// weak, coincidental match (e.g. "Cumberland Sausage" landing on CoFID's
// "Liver sausage") used to get logged without you ever seeing it.
export async function resolveNutrition({ barcode, query, deps = defaultDeps }) {
  if (barcode) {
    const food = await deps.lookupBarcode(barcode);
    if (food) return { food, provenance: 'off', verified: true };
  }
  if (query) {
    const offHit = (await deps.searchProducts(query, { limit: 1 }))[0];
    if (offHit) return { food: offHit, provenance: 'off', verified: true };
  }
  return null;
}

// Live-typing suggestions: personal library + bundled CoFID, both synchronous
// and network-free, so this is safe to call on every keystroke with no
// debounce. Library matches are prioritised, CoFID fills the remaining slots.
// Open Food Facts is intentionally excluded — it's network/rate-limited and
// only used via barcode scan or on explicit submit (resolveNutrition).
export function searchSuggestions(query, { library = [], meals = [], deps = defaultDeps, limit = 6 } = {}) {
  const libFoods = fuzzyMatch(query, library, { limit });
  const cofidFoods = deps.searchCofid(query, deps.cofidData, { limit });
  return {
    foods: [...libFoods, ...cofidFoods].slice(0, limit),
    meals: fuzzyMatch(query, meals, { limit: 3 }),
  };
}

// Maps the photo prompt output onto resolveNutrition, falling back to the
// AI-transcribed numbers tagged verified:false. Same principle as
// resolveNutrition throughout: a name Claude reads off a label/product photo
// never fuzzy-matches library/CoFID (no dropdown exists in the photo flow for
// you to catch a bad match before it commits) — only a scanned barcode or
// Open Food Facts' own text search are trusted.
export async function resolveFromPhoto(identification, { deps = defaultDeps } = {}) {
  const { barcode, brand, productName, name, per100g, perServing, servingSize } = identification;
  if (barcode) {
    const r = await resolveNutrition({ barcode, deps });
    if (r) return r;
  }
  const searchName = [brand, productName].filter(Boolean).join(' ') || name;
  if (searchName) {
    const r = await resolveNutrition({ query: searchName, deps });
    if (r) return r;
  }
  if (per100g || perServing) {
    const food = labelToBaseFood({ name: name || productName || 'Scanned item', source: 'ai', per100g, perServing, servingSize });
    return { food, provenance: 'ai', verified: false };
  }
  return null;
}

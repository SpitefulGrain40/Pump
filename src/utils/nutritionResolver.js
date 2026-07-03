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

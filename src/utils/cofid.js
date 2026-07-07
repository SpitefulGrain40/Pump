import { fuzzyMatch, labelToBaseFood } from './foodLibrary';

// CoFID rows: { name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, category }.
// dataset is injected (real bundle in the app, fixture in tests).
export function searchCofid(query, dataset, { limit = 8 } = {}) {
  const matches = fuzzyMatch(query, dataset, { limit });
  return matches.map((row) => labelToBaseFood({
    name: row.name, source: 'cofid',
    per100g: { calories: row.kcalPer100g, protein: row.proteinPer100g, carbs: row.carbsPer100g, fat: row.fatPer100g },
  }));
}

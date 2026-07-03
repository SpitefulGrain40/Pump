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

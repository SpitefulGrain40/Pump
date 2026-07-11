import { useCallback, useMemo } from 'react';
import { useLocalStorageArray } from './useLocalStorage';
import { addOrUpdateFood, touchEntry } from '../utils/foodLibrary';
import { createSavedMeal } from '../utils/dataSchemas';

export function useFoodLibrary() {
  const { items, setItems } = useLocalStorageArray('pump-food-library', []);

  const foods = useMemo(() => items.filter((e) => e.kind === 'food'), [items]);
  const meals = useMemo(() => items.filter((e) => e.kind === 'meal'), [items]);

  const saveFood = useCallback((food) => setItems((prev) => addOrUpdateFood(prev, food)), [setItems]);
  const saveMeal = useCallback((name, components) =>
    setItems((prev) => [...prev, createSavedMeal({ name, components })]), [setItems]);
  const touch = useCallback((id) => setItems((prev) => touchEntry(prev, id)), [setItems]);

  return { foods, meals, saveFood, saveMeal, touch };
}

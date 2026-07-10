import { useLocalStorageArray } from './useLocalStorage';
import { createWeightEntry } from '../utils/dataSchemas';

const STORAGE_UPDATE_EVENT = 'local-storage-update';
const KEY = 'pump-weight-history';

export function useWeightHistory() {
  const { items: entries, add, setItems, clear } = useLocalStorageArray(KEY, []);

  const logWeight = (weight, date = null) => {
    const entry = createWeightEntry(weight, date);
    const existingIndex = entries.findIndex((e) => e.date === entry.date);

    if (existingIndex >= 0) {
      // Read fresh from localStorage (not the closure's `entries`) and write
      // synchronously, same pattern as useLocalStorageArray.add() — a plain
      // setItems() call alone only persists via a useEffect, which never
      // fires if the calling component unmounts in the same event handler
      // (e.g. WeightModal closing itself right after logWeight()).
      const current = JSON.parse(localStorage.getItem(KEY) || '[]');
      const idx = current.findIndex((e) => e.date === entry.date);
      const updated = idx >= 0
        ? current.map((e, i) => (i === idx ? entry : e))
        : [...current, entry];
      localStorage.setItem(KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key: KEY } }));
      setItems(updated);
      return entry;
    }
    add(entry);
    return entry;
  };

  const getLatestWeight = () => {
    if (entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0];
  };

  const getWeightOnDate = (date) => {
    return entries.find((e) => e.date === date);
  };

  const getWeightTrend = (days = 7) => {
    const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = sorted.slice(0, days);

    if (recent.length < 2) return 0;

    const oldest = recent[recent.length - 1].weight;
    const newest = recent[0].weight;
    return newest - oldest;
  };

  const getEntriesForRange = (startDate, endDate) => {
    return entries.filter((e) => {
      const date = new Date(e.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
  };

  return {
    entries,
    logWeight,
    getLatestWeight,
    getWeightOnDate,
    getWeightTrend,
    getEntriesForRange,
    clear,
  };
}

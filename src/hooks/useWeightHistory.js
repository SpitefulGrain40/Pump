import { useLocalStorageArray } from './useLocalStorage';
import { createWeightEntry } from '../utils/dataSchemas';

export function useWeightHistory() {
  const { items: entries, add, clear } = useLocalStorageArray('pump-weight-history', []);

  const logWeight = (weight, date = null) => {
    const entry = createWeightEntry(weight, date);
    const existingIndex = entries.findIndex((e) => e.date === entry.date);

    if (existingIndex >= 0) {
      const updated = [...entries];
      updated[existingIndex] = entry;
      return updated;
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

import { useLocalStorageArray } from './useLocalStorage';
import { createMeasurementEntry } from '../utils/dataSchemas';

export function useMeasurementHistory() {
  const { items: entries, add, clear } = useLocalStorageArray('pump-measurement-history', []);

  // Log a snapshot. If one already exists for the same date, replace it.
  const logMeasurement = (fields, date = null) => {
    const entry = createMeasurementEntry(fields, date);
    const existingIndex = entries.findIndex((e) => e.date === entry.date);
    if (existingIndex >= 0) {
      const updated = [...entries];
      updated[existingIndex] = { ...updated[existingIndex], ...entry };
      localStorage.setItem('pump-measurement-history', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('local-storage-update', { detail: { key: 'pump-measurement-history' } }));
      return entry;
    }
    add(entry);
    return entry;
  };

  const getLatest = () => {
    if (entries.length === 0) return null;
    return [...entries].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  };

  return { entries, logMeasurement, getLatest, clear };
}

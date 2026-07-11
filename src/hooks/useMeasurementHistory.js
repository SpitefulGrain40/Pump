import { useLocalStorageArray } from './useLocalStorage';
import { createMeasurementEntry } from '../utils/dataSchemas';

const STORAGE_UPDATE_EVENT = 'local-storage-update';
const KEY = 'pump-measurement-history';

export function useMeasurementHistory() {
  const { items: entries, setItems, clear } = useLocalStorageArray(KEY, []);

  // Log a snapshot. If one already exists for the same date, merge into it.
  const logMeasurement = (fields, date = null) => {
    const entry = createMeasurementEntry(fields, date);
    // Read fresh from localStorage (not the closure's `entries`) and write
    // synchronously — same pattern as useWeightHistory.logWeight. A plain
    // read of the `entries` state closure goes stale between rapid successive
    // calls (e.g. Settings syncing several fields), so two writes could each
    // build from the same old array and the second would clobber the first.
    const current = JSON.parse(localStorage.getItem(KEY) || '[]');
    const idx = current.findIndex((e) => e.date === entry.date);
    const updated = idx >= 0
      ? current.map((e, i) => (i === idx ? { ...e, ...entry } : e))
      : [...current, entry];
    localStorage.setItem(KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key: KEY } }));
    setItems(updated);
    return entry;
  };

  return { entries, logMeasurement, clear };
}

import { useState, useEffect, useCallback, useRef } from 'react';

// Custom event for same-tab localStorage updates
const STORAGE_UPDATE_EVENT = 'local-storage-update';

// Track which keys are currently being updated to prevent loops
const updatingKeys = new Set();

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Save to localStorage when value changes
  useEffect(() => {
    // Mark this key as updating
    updatingKeys.add(key);

    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Dispatch custom event for same-tab sync
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key } }));
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage:`, e);
    }

    // Clear the updating flag after this event loop cycle
    queueMicrotask(() => updatingKeys.delete(key));
  }, [key, value]);

  // Listen for updates from other components in the same tab
  useEffect(() => {
    const handleStorageUpdate = (e) => {
      // Skip if we're the one updating this key
      if (updatingKeys.has(key)) return;

      if (e.detail?.key === key) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            // Only update if value actually changed
            setValue(prev => {
              const prevStr = JSON.stringify(prev);
              const newStr = JSON.stringify(parsed);
              return prevStr === newStr ? prev : parsed;
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    };

    window.addEventListener(STORAGE_UPDATE_EVENT, handleStorageUpdate);
    return () => window.removeEventListener(STORAGE_UPDATE_EVENT, handleStorageUpdate);
  }, [key]);

  const reset = useCallback(() => setValue(defaultValue), [defaultValue]);

  return [value, setValue, reset];
}

export function useLocalStorageArray(key, defaultValue = []) {
  const [items, setItems] = useLocalStorage(key, defaultValue);

  const add = useCallback((item) => {
    // Write directly to localStorage to ensure it persists even if component unmounts
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [...current, item];
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key } }));
    setItems(updated);
  }, [key, setItems]);

  const update = useCallback((id, updates) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, [setItems]);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, [setItems]);

  const clear = useCallback(() => setItems([]), [setItems]);

  return { items, setItems, add, update, remove, clear };
}

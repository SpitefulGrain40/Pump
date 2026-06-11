import { useState, useEffect, useCallback, useRef } from 'react';

// Custom event for same-tab localStorage updates
const STORAGE_UPDATE_EVENT = 'local-storage-update';

// Monotonic id so each hook instance can recognise (and ignore) its OWN writes
// while still receiving writes from every other instance of the same key.
let nextInstanceId = 0;

export function useLocalStorage(key, defaultValue) {
  // Stable per-instance identity. Previously a single shared "updatingKeys" set
  // was used to avoid write loops, but it also suppressed cross-component
  // updates (e.g. App not seeing onboardingComplete flip until a reload).
  const instanceId = useRef(++nextInstanceId);
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
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Dispatch custom event for same-tab sync, tagged with our instance id so
      // we don't react to our own write (other instances still will).
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: { key, sender: instanceId.current } }));
    } catch (e) {
      console.error(`Failed to save ${key} to localStorage:`, e);
    }
  }, [key, value]);

  // Listen for updates from other components in the same tab
  useEffect(() => {
    const handleStorageUpdate = (e) => {
      // Skip our own writes; process everyone else's. The JSON-equality check
      // below prevents any update loop between instances.
      if (e.detail?.sender === instanceId.current) return;

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

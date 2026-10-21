'use client';

import { useEffect, useState } from 'react';
import { load, save } from './storage';

const PREFIX = 'bytebox:size:';
const RESET_EVENT = 'bytebox:layout-reset';

// A panel size in pixels, remembered per browser, between min and max
export function useStoredSize(name: string, initial: number, min: number, max: number) {
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  const [size, setSize] = useState(initial);

  useEffect(() => {
    const saved = Number(load(PREFIX + name));
    if (saved) setSize(clamp(saved));
    const reset = () => setSize(initial);
    window.addEventListener(RESET_EVENT, reset);
    return () => window.removeEventListener(RESET_EVENT, reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return {
    size,
    // Drag handles report how far they moved
    resize(delta: number) {
      setSize((current) => {
        const next = clamp(current + delta);
        save(PREFIX + name, String(next));
        return next;
      });
    },
    reset() {
      setSize(initial);
      save(PREFIX + name, '');
    },
  };
}

// "Reset layout": every panel back to its first size
export function resetStoredSizes() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage blocked: the sizes still reset for this page
  }
  window.dispatchEvent(new Event(RESET_EVENT));
}

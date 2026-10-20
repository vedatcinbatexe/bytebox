// Panel sizes in pixels, remembered per browser
import { load, save } from './storage';

export interface PanelSizes {
  explorer: number;
  aside: number;
  terminal: number;
}

export const DEFAULT_SIZES: PanelSizes = { explorer: 224, aside: 440, terminal: 288 };

const LIMITS: Record<keyof PanelSizes, [number, number]> = {
  explorer: [160, 480],
  aside: [260, 900],
  terminal: [120, 640],
};

const STORAGE_KEY = 'bytebox:layout';

export function clampSize(panel: keyof PanelSizes, size: number): number {
  const [min, max] = LIMITS[panel];
  return Math.round(Math.min(max, Math.max(min, size)));
}

export function loadSizes(): PanelSizes {
  try {
    const saved = JSON.parse(load(STORAGE_KEY) ?? '{}') as Partial<PanelSizes>;
    return {
      explorer: clampSize('explorer', saved.explorer ?? DEFAULT_SIZES.explorer),
      aside: clampSize('aside', saved.aside ?? DEFAULT_SIZES.aside),
      terminal: clampSize('terminal', saved.terminal ?? DEFAULT_SIZES.terminal),
    };
  } catch {
    return DEFAULT_SIZES;
  }
}

export function saveSizes(sizes: PanelSizes) {
  save(STORAGE_KEY, JSON.stringify(sizes));
}

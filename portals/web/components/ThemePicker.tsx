'use client';

import { useEffect, useRef, useState } from 'react';
import { THEMES, setTheme, useTheme } from '@/lib/theme';

// Header button to switch between Dark, Synthwave, Blue, Purple and Light
export function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const active = THEMES.find((item) => item.id === theme) ?? THEMES[0];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change theme"
        className="flex items-center gap-2 rounded border border-line-strong px-2.5 py-1.5 text-sm text-fg hover:bg-raised"
      >
        <Swatch colors={active.swatch} />
        <span className="hidden sm:inline">{active.name}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-panel py-1 text-sm shadow-xl"
        >
          {THEMES.map((item) => (
            <button
              key={item.id}
              role="menuitemradio"
              aria-checked={item.id === theme}
              onClick={() => {
                setTheme(item.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-fg hover:bg-raised"
            >
              <Swatch colors={item.swatch} />
              <span className="flex-1">{item.name}</span>
              {item.id === theme && <span className="text-accent">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Swatch({ colors: [background, accent] }: { colors: [string, string] }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-line-strong"
      style={{ background: `linear-gradient(135deg, ${background} 50%, ${accent} 50%)` }}
      aria-hidden="true"
    />
  );
}

'use client';

import { useEffect } from 'react';
import { DEFAULT_EDITOR_SETTINGS, FONT_SIZES, type EditorSettings } from '@/lib/editorSettings';

interface Props {
  settings: EditorSettings;
  onChange: (settings: EditorSettings) => void;
  onClose: () => void;
}

const TOGGLES: { key: 'wordWrap' | 'minimap' | 'lineNumbers'; label: string }[] = [
  { key: 'wordWrap', label: 'Wrap long lines' },
  { key: 'minimap', label: 'Minimap' },
  { key: 'lineNumbers', label: 'Line numbers' },
];

// Font size, tab size and a few view options; changes apply right away
export function EditorSettingsDialog({ settings, onChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const SELECT = 'rounded border border-line-strong bg-raised px-2 py-1 text-sm text-fg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-settings-title"
        className="w-full max-w-sm rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h2 id="editor-settings-title" className="mr-auto text-lg font-semibold">
            ⚙ Editor settings
          </h2>
          <button onClick={onClose} title="Close (Esc)" className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg">
            ✕
          </button>
        </div>
        <div className="divide-y divide-line text-sm">
          <label className="flex items-center justify-between py-2">
            <span className="text-muted">Font size</span>
            <select
              value={settings.fontSize}
              onChange={(event) => onChange({ ...settings, fontSize: Number(event.target.value) })}
              className={SELECT}
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between py-2">
            <span className="text-muted">Tab size</span>
            <select
              value={settings.tabSize}
              onChange={(event) => onChange({ ...settings, tabSize: Number(event.target.value) as 2 | 4 })}
              className={SELECT}
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
            </select>
          </label>
          {TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center justify-between py-2">
              <span className="text-muted">{toggle.label}</span>
              <input
                type="checkbox"
                checked={settings[toggle.key]}
                onChange={(event) => onChange({ ...settings, [toggle.key]: event.target.checked })}
              />
            </label>
          ))}
        </div>
        <button
          onClick={() => onChange(DEFAULT_EDITOR_SETTINGS)}
          className="mt-4 text-xs text-subtle hover:text-fg"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

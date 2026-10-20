'use client';

import { useRef } from 'react';

interface Props {
  direction: 'x' | 'y'; // x: drag left/right (between columns), y: drag up/down
  onResize: (delta: number) => void; // pixels moved since the last call
  onReset: () => void; // double-click
  label: string;
}

// A thin bar that can be dragged to resize the panels next to it (desktop only)
export function ResizeHandle({ direction, onResize, onReset, label }: Props) {
  const last = useRef<number | null>(null);

  return (
    <div
      role="separator"
      aria-orientation={direction === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={`${label} (double-click to reset)`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        last.current = direction === 'x' ? event.clientX : event.clientY;
      }}
      onPointerMove={(event) => {
        if (last.current === null) return;
        const position = direction === 'x' ? event.clientX : event.clientY;
        onResize(position - last.current);
        last.current = position;
      }}
      onPointerUp={() => (last.current = null)}
      onDoubleClick={onReset}
      className={`group hidden shrink-0 touch-none md:block ${
        direction === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      } bg-line transition-colors hover:bg-accent active:bg-accent`}
    />
  );
}

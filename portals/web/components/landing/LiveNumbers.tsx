'use client';

import { useEffect, useState } from 'react';
import { fetchStats } from '@/lib/projects';

// Counts up from 0 to the real numbers from /stats; shows nothing if the API isn't reachable
export function LiveNumbers() {
  const [target, setTarget] = useState<{ label: string; value: number }[] | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchStats()
      .then((stats) =>
        setTarget([
          { label: 'programs run', value: stats.totalRuns },
          { label: 'projects', value: stats.projects },
          { label: 'developers', value: stats.users },
          { label: 'languages', value: stats.languages.length || 7 },
        ]),
      )
      .catch(() => setTarget(null));
  }, []);

  // Ease the numbers up over about a second
  useEffect(() => {
    if (!target) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setProgress(1);
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!target) return null;

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {target.map((item) => (
        <div key={item.label} className="rounded-xl border border-line bg-panel/60 p-5 text-center">
          <dt className="sr-only">{item.label}</dt>
          <dd className="text-3xl font-bold text-fg tabular-nums">{Math.round(item.value * progress).toLocaleString()}</dd>
          <dd className="mt-1 text-sm text-muted">{item.label}</dd>
        </div>
      ))}
    </dl>
  );
}

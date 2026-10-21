'use client';

import { useEffect, useState } from 'react';

// A pretend editor for the landing page: it types a program, runs it and shows the output,
// then moves on to the next language
interface Scene {
  file: string;
  language: string;
  code: string;
  output: string[];
  timeMs: number;
}

const SCENES: Scene[] = [
  {
    file: 'main.py',
    language: 'Python',
    code: `def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

for n in range(1, 8):
    print(n, fib(n))`,
    output: ['1 1', '2 1', '3 2', '4 3', '5 5', '6 8', '7 13'],
    timeMs: 41,
  },
  {
    file: 'main.js',
    language: 'JavaScript',
    code: `const words = ['run', 'share', 'fork', 'embed'];

for (const word of words) {
  console.log(\`You can \${word} it 🚀\`);
}`,
    output: ['You can run it 🚀', 'You can share it 🚀', 'You can fork it 🚀', 'You can embed it 🚀'],
    timeMs: 62,
  },
  {
    file: 'main.rs',
    language: 'Rust',
    code: `fn main() {
    let langs = ["Python", "Go", "Rust", "Java"];
    for (i, lang) in langs.iter().enumerate() {
        println!("{}. {lang}", i + 1);
    }
}`,
    output: ['1. Python', '2. Go', '3. Rust', '4. Java'],
    timeMs: 388,
  },
];

const KEYWORDS =
  /\b(def|for|in|range|return|const|of|let|fn|print|println|console|log|if|else|import|while|true|false)\b/;
const TOKENS = /(#.*|\/\/.*)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d+\b)|(\b[A-Za-z_]+\b)/g;

// A tiny highlighter: keywords, strings, numbers and comments get theme colors
function highlight(line: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKENS)) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const [text, comment, string, number, word] = match;
    const className = comment
      ? 'text-subtle italic'
      : string
        ? 'text-success'
        : number
          ? 'text-warning'
          : word && KEYWORDS.test(word)
            ? 'text-accent'
            : undefined;
    parts.push(
      <span key={match.index} className={className}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }
  parts.push(line.slice(last));
  return parts;
}

type Phase = 'typing' | 'running' | 'output' | 'done';

export function HeroDemo() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');
  const [shownLines, setShownLines] = useState(0);
  const scene = SCENES[sceneIndex];

  // People who prefer less motion see each program finished
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(scene.code.length);
      setShownLines(scene.output.length);
      setPhase('done');
    }
  }, [scene]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (phase === 'typing') {
      if (typed < scene.code.length) {
        // Faster through spaces, like a person typing
        const next = scene.code[typed];
        timer = setTimeout(() => setTyped(typed + 1), next === ' ' ? 12 : 32);
      } else {
        timer = setTimeout(() => setPhase('running'), 500);
      }
    } else if (phase === 'running') {
      timer = setTimeout(() => setPhase('output'), 700);
    } else if (phase === 'output') {
      if (shownLines < scene.output.length) timer = setTimeout(() => setShownLines(shownLines + 1), 120);
      else setPhase('done');
    } else {
      timer = setTimeout(() => {
        setSceneIndex((index) => (index + 1) % SCENES.length);
        setTyped(0);
        setShownLines(0);
        setPhase('typing');
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [phase, typed, shownLines, scene]);

  const visibleCode = scene.code.slice(0, typed).split('\n');
  const finished = phase === 'done';

  return (
    <div className="overflow-hidden rounded-xl border border-line-strong bg-panel text-left shadow-2xl" aria-hidden="true">
      {/* Window bar */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="h-3 w-3 rounded-full bg-danger/70" />
        <span className="h-3 w-3 rounded-full bg-warning/70" />
        <span className="h-3 w-3 rounded-full bg-success/70" />
        <span className="ml-2 rounded bg-raised px-2 py-0.5 font-mono text-xs text-fg">{scene.file}</span>
        <span className="text-xs text-subtle">{scene.language}</span>
        <span
          className={`ml-auto rounded px-2.5 py-1 text-xs font-semibold text-accent-fg transition ${
            phase === 'running' ? 'scale-95 bg-accent-hover ring-4 ring-accent/30' : 'bg-accent'
          }`}
        >
          ▶ Run
        </span>
      </div>

      <div className="grid sm:grid-cols-[1fr_0.8fr]">
        {/* Code */}
        <pre className="min-h-56 overflow-hidden p-4 font-mono text-[13px] leading-6 text-fg">
          {visibleCode.map((line, index) => (
            <div key={index} className="flex">
              <span className="mr-4 w-4 shrink-0 text-right text-subtle select-none">{index + 1}</span>
              <span className="whitespace-pre">
                {highlight(line)}
                {index === visibleCode.length - 1 && phase === 'typing' && (
                  <span className="landing-caret ml-px inline-block h-4 w-0.5 translate-y-0.5 bg-accent" />
                )}
              </span>
            </div>
          ))}
        </pre>

        {/* Output */}
        <div className="flex min-h-40 flex-col border-t border-line bg-app sm:border-t-0 sm:border-l">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-muted">
            <span className="font-semibold tracking-wide uppercase">Output</span>
            {phase === 'running' && <span className="animate-pulse rounded bg-info/15 px-1.5 text-info">Running…</span>}
            {finished && (
              <span className="rounded bg-success/15 px-1.5 text-success">Completed · {scene.timeMs} ms</span>
            )}
          </div>
          <pre className="flex-1 p-3 font-mono text-[13px] leading-6 text-fg">
            {phase === 'typing' && <span className="text-subtle">Press Run to see output.</span>}
            {scene.output.slice(0, shownLines).map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

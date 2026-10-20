'use client';

import { useState } from 'react';
import { runToCompletion, type ProjectFile } from '@/lib/runs';
import { MAX_TESTS, outputsMatch, type TestCase } from '@/lib/tests';

type Result =
  | { state: 'running' }
  | { state: 'pass'; timeMs: number }
  | { state: 'fail'; actual: string; stderr: string; status: string }
  | { state: 'error'; message: string };

interface Props {
  tests: TestCase[];
  onChange: (tests: TestCase[]) => void;
  entryFile: string | null; // the open file, if it can be run
  getFiles: () => ProjectFile[];
  canChange: () => boolean; // asks guests to log in
  readOnly: boolean;
}

const ICONS = { running: '⏳', pass: '✅', fail: '❌', error: '⚠️' };

// Input → expected output checks for the open file
export function TestsPanel({ tests, onChange, entryFile, getFiles, canChange, readOnly }: Props) {
  const [results, setResults] = useState<Record<number, Result>>({});
  const [running, setRunning] = useState(false);

  function edit(index: number, changes: Partial<TestCase>) {
    onChange(tests.map((test, i) => (i === index ? { ...test, ...changes } : test)));
    setResults((current) => {
      const next = { ...current };
      delete next[index]; // an edited test needs to run again
      return next;
    });
  }

  function add() {
    if (!canChange() || tests.length >= MAX_TESTS) return;
    onChange([...tests, { name: `Test ${tests.length + 1}`, stdin: '', expected: '' }]);
  }

  function remove(index: number) {
    if (!canChange()) return;
    onChange(tests.filter((_, i) => i !== index));
    setResults({});
  }

  // One after another: fair-use limits allow only a couple of runs at the same time
  async function runAll() {
    if (!entryFile || running || !canChange()) return;
    setRunning(true);
    setResults({});
    const files = getFiles();
    for (const [index, test] of tests.entries()) {
      setResults((current) => ({ ...current, [index]: { state: 'running' } }));
      let result: Result;
      try {
        const run = await runToCompletion(files, entryFile, test.stdin);
        result =
          run.status === 'COMPLETED' && run.exitCode === 0 && outputsMatch(test.expected, run.stdout)
            ? { state: 'pass', timeMs: run.timeMs }
            : { state: 'fail', actual: run.stdout, stderr: run.stderr, status: run.status };
      } catch (error) {
        result = { state: 'error', message: (error as Error).message };
      }
      setResults((current) => ({ ...current, [index]: result }));
    }
    setRunning(false);
  }

  const finished = Object.values(results).filter((result) => result.state !== 'running');
  const passed = finished.filter((result) => result.state === 'pass').length;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs">
        <span className="text-muted">
          {entryFile ? (
            <>
              Runs <span className="font-mono text-fg">{entryFile}</span>
            </>
          ) : (
            'Open a .py, .js, .ts, .java, .cpp, .go or .rs file to test it'
          )}
        </span>
        {finished.length > 0 && !running && (
          <span className={passed === tests.length ? 'text-success' : 'text-danger'}>
            {passed}/{tests.length} passed
          </span>
        )}
        <button
          onClick={runAll}
          disabled={!entryFile || running || tests.length === 0}
          className="ml-auto rounded bg-accent px-2.5 py-1 font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? 'Running…' : '▶ Run all tests'}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {tests.length === 0 && (
          <p className="px-1 text-sm text-subtle">
            No tests yet. A test gives your program some input and checks its output.
          </p>
        )}
        {tests.map((test, index) => {
          const result = results[index];
          return (
            <div key={index} className="rounded-lg border border-line bg-app p-3">
              <div className="mb-2 flex items-center gap-2">
                <span aria-label={result?.state ?? 'not run'} className="w-5 text-center">
                  {result ? ICONS[result.state] : '○'}
                </span>
                <input
                  value={test.name}
                  onChange={(event) => edit(index, { name: event.target.value })}
                  readOnly={readOnly}
                  onClick={() => readOnly && canChange()}
                  aria-label="Test name"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
                {result?.state === 'pass' && <span className="text-xs text-subtle">{result.timeMs} ms</span>}
                <button
                  onClick={() => remove(index)}
                  title="Delete this test"
                  className="rounded px-1.5 text-subtle hover:bg-raised hover:text-danger"
                >
                  ✕
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Input
                  <textarea
                    value={test.stdin}
                    onChange={(event) => edit(index, { stdin: event.target.value })}
                    readOnly={readOnly}
                    onClick={() => readOnly && canChange()}
                    rows={2}
                    spellCheck={false}
                    className="mt-1 w-full resize-y rounded border border-line bg-panel px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent"
                  />
                </label>
                <label className="text-xs text-muted">
                  Expected output
                  <textarea
                    value={test.expected}
                    onChange={(event) => edit(index, { expected: event.target.value })}
                    readOnly={readOnly}
                    onClick={() => readOnly && canChange()}
                    rows={2}
                    spellCheck={false}
                    className="mt-1 w-full resize-y rounded border border-line bg-panel px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent"
                  />
                </label>
              </div>
              {result?.state === 'fail' && (
                <div className="mt-2 text-xs">
                  <p className="mb-1 text-danger">
                    {result.status === 'COMPLETED' ? 'Got a different output:' : `The program ${result.status.toLowerCase().replace('_', ' ')}:`}
                  </p>
                  <pre className="rounded bg-danger/10 px-2 py-1 font-mono whitespace-pre-wrap text-fg">
                    {result.actual || '(no output)'}
                  </pre>
                  {result.stderr && (
                    <pre className="mt-1 rounded bg-danger/10 px-2 py-1 font-mono whitespace-pre-wrap text-danger">
                      {result.stderr}
                    </pre>
                  )}
                </div>
              )}
              {result?.state === 'error' && <p className="mt-2 text-xs text-danger">{result.message}</p>}
            </div>
          );
        })}
        {tests.length < MAX_TESTS && (
          <button
            onClick={add}
            className="w-full rounded-lg border border-dashed border-line-strong py-2 text-sm text-muted hover:border-accent hover:text-fg"
          >
            + Add test
          </button>
        )}
      </div>
    </section>
  );
}

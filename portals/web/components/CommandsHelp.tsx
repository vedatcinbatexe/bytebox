'use client';

import { useEffect } from 'react';

interface Command {
  command: string;
  description: string;
}

const SECTIONS: { title: string; commands: Command[] }[] = [
  {
    title: 'Getting around',
    commands: [
      { command: 'ls', description: 'List files in the current folder' },
      { command: 'ls -la', description: 'List all files with details (size, date, hidden files)' },
      { command: 'cd utils', description: 'Go into the utils folder' },
      { command: 'cd ..', description: 'Go up one folder' },
      { command: 'cd ~', description: 'Go back to the project folder (/workspace)' },
      { command: 'pwd', description: 'Show which folder you are in' },
      { command: 'clear', description: 'Clear the screen' },
    ],
  },
  {
    title: 'Files and folders',
    commands: [
      { command: 'mkdir notes', description: 'Create a folder' },
      { command: 'mkdir -p src/lib', description: 'Create nested folders in one go' },
      { command: 'touch app.py', description: 'Create an empty file' },
      { command: 'cp main.py backup.py', description: 'Copy a file' },
      { command: 'mv old.py new.py', description: 'Rename or move a file or folder' },
      { command: 'rm notes.txt', description: 'Delete a file' },
      { command: 'rm -r notes', description: 'Delete a folder and everything in it' },
      { command: 'find .', description: 'List every file and folder in the project' },
    ],
  },
  {
    title: 'Reading and writing text',
    commands: [
      { command: 'cat main.py', description: 'Print a file' },
      { command: 'head -n 5 main.py', description: 'Show the first 5 lines (tail shows the last)' },
      { command: 'less main.py', description: 'Scroll through a long file (q to quit)' },
      { command: 'echo "hello" > notes.txt', description: 'Write text to a file (replaces it)' },
      { command: 'echo "more" >> notes.txt', description: 'Add a line to the end of a file' },
      { command: 'nano notes.txt', description: 'Edit a file: Ctrl+O then Enter to save, Ctrl+X to exit' },
    ],
  },
  {
    title: 'Running code',
    commands: [
      { command: 'python3 main.py', description: 'Run a Python file' },
      { command: 'python3', description: 'Interactive Python (type exit() to leave)' },
      { command: 'node hello.js', description: 'Run a JavaScript file' },
      { command: 'node', description: 'Interactive JavaScript (type .exit to leave)' },
      { command: 'g++ hello.cpp -o hello && ./hello', description: 'Compile and run C++' },
      { command: 'echo "Bytebox" | python3 main.py', description: 'Run a program with input' },
      { command: 'python3 main.py > out.txt', description: 'Save the output to a file' },
    ],
  },
  {
    title: 'Searching and text tools',
    commands: [
      { command: 'grep -n "def" main.py', description: 'Find lines containing a word, with line numbers' },
      { command: 'grep -rn "greet" .', description: 'Search every file in the project' },
      { command: 'wc -l main.py', description: 'Count lines in a file' },
      { command: 'sort names.txt', description: 'Sort lines (add | uniq to remove duplicates)' },
      { command: 'diff a.py b.py', description: 'Show the differences between two files' },
    ],
  },
  {
    title: 'Handy keys',
    commands: [
      { command: 'Ctrl + C', description: 'Stop the running program' },
      { command: 'Tab', description: 'Complete a file or folder name' },
      { command: '↑ / ↓', description: 'Go through previous commands' },
      { command: 'Ctrl + L', description: 'Clear the screen' },
      { command: 'exit', description: 'End the terminal session' },
    ],
  },
];

interface Props {
  onClose: () => void;
}

export function CommandsHelp({ onClose }: Props) {
  // Close with Escape
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commands-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 id="commands-title" className="mr-auto text-lg font-semibold">
            Terminal commands
          </h2>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-muted">
            Open the terminal with <span className="text-fg">&gt;_ Terminal</span>. You start in
            your project folder, and files you create, change or delete there show up in the file tree
            automatically.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  {section.title}
                </h3>
                <dl className="space-y-2">
                  {section.commands.map((item) => (
                    <div key={item.command}>
                      <dt>
                        <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-sm text-success">
                          {item.command}
                        </code>
                      </dt>
                      <dd className="mt-0.5 text-sm text-muted">{item.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <div className="mt-6 rounded border border-line bg-raised/50 p-3 text-sm text-muted">
            <p className="mb-1 font-semibold text-fg">Good to know</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>No internet access, so pip install and npm install don&apos;t work.</li>
              <li>Only your project folder and /tmp can be written to.</li>
              <li>A session closes after 15 minutes without typing, or after 1 hour. Click Restart for a new one.</li>
              <li>One terminal at a time: opening it in another tab or browser closes the old one.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

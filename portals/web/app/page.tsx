import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroDemo } from '@/components/landing/HeroDemo';
import { LandingNav } from '@/components/landing/LandingNav';
import { LiveNumbers } from '@/components/landing/LiveNumbers';
import { Reveal } from '@/components/landing/Reveal';

export const metadata: Metadata = {
  title: 'Bytebox · Write, run and share code in your browser',
  description:
    'An online code playground: multi-file projects in Python, JavaScript, TypeScript, Java, C++, Go and Rust, a live terminal, HTML preview, tests and sharing.',
};

const LANGUAGES = ['🐍 Python', '🟨 JavaScript', '🔷 TypeScript', '☕ Java', '⚙️ C++', '🐹 Go', '🦀 Rust', '🌐 HTML/CSS/JS', '⚛️ React'];

const FEATURES = [
  { icon: '📁', title: 'Real projects', text: 'Files and folders, drag and drop, imports between files. Not just one snippet.' },
  { icon: '▶️', title: 'Run in a sandbox', text: 'Every run gets a fresh, locked-down container: no network, time and memory limits.' },
  { icon: '📡', title: 'Live output', text: 'See output while the program runs, with colors, stdin and command-line arguments.' },
  { icon: '>_', title: 'Real terminal', text: 'A Linux shell next to your code, synced with your files both ways.' },
  { icon: '👁', title: 'Live web preview', text: 'HTML, CSS and JavaScript render as you type, with the console underneath.' },
  { icon: '🧪', title: 'Tests', text: 'Input → expected output checks for your program, run with one click.' },
  { icon: '🐞', title: 'Helpful errors', text: 'Click an error to jump to the line, squiggles in the editor and tips for beginners.' },
  { icon: '🔗', title: 'Share & fork', text: 'One link to share. Others can run it, fork it, star it and comment on it.' },
  { icon: '🧩', title: 'Embed anywhere', text: 'Put a project on your blog or docs with a single iframe.' },
  { icon: '🕘', title: 'History', text: 'Autosave plus a version history with a diff against your current code.' },
  { icon: '⌘', title: 'Fast editor', text: 'VS Code’s editor, command palette, find & replace, Prettier and focus mode.' },
  { icon: '🎨', title: 'Your style', text: 'Five themes, font size, word wrap and a layout you can resize.' },
];

const PIPELINE = [
  { name: 'Web', tech: 'Next.js' },
  { name: 'Gateway', tech: 'Node · GraphQL' },
  { name: 'Execution', tech: '.NET · gRPC' },
  { name: 'Queue', tech: 'RabbitMQ' },
  { name: 'Runner', tech: 'Python · Docker' },
];

const STEPS = [
  { title: 'Sign in', text: 'Use your GitHub or Google account. Your first sign-in creates your Bytebox account.' },
  { title: 'Start a workspace', text: 'Pick a template (Python, Node, C++, Go, Rust, Java or a web page) or start blank.' },
  { title: 'Run and share', text: 'Press Run (⌘/Ctrl + Enter), then share the link, make it public or embed it.' },
];

const PRIMARY = 'rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-fg shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-hover';
const SECONDARY = 'rounded-lg border border-line-strong px-5 py-2.5 font-semibold text-fg transition hover:-translate-y-0.5 hover:bg-raised';

// The home page: what Bytebox is, what you can do with it and how to start
export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <LandingNav />

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-16 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div aria-hidden="true" className="landing-glow pointer-events-none absolute -top-10 left-1/4 -z-10 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
          <div>
            <p className="mb-4 inline-block rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
              ⚡ 7 languages · no installs · free
            </p>
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
              Write, run and share code <span className="text-accent">right in your browser</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Bytebox is an online code playground. Build multi-file projects, run them in a safe sandbox, use a real
              terminal and share them with one link.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/playground" className={PRIMARY}>
                Start coding →
              </Link>
              <Link href="/explore" className={SECONDARY}>
                Explore projects
              </Link>
            </div>
            <p className="mt-4 text-xs text-subtle">Browse without an account · sign in with GitHub or Google to run code</p>
          </div>
          <div className="landing-float">
            <HeroDemo />
          </div>
        </section>

        {/* Languages */}
        <section aria-label="Supported languages" className="border-y border-line bg-panel/50 py-4">
          <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            {/* The list is there twice so the scroll can loop without a gap */}
            <ul className="landing-marquee flex shrink-0 gap-3 pr-3">
              {[...LANGUAGES, ...LANGUAGES].map((language, index) => (
                <li
                  key={index}
                  aria-hidden={index >= LANGUAGES.length}
                  className="rounded-full border border-line bg-app px-4 py-1.5 text-sm whitespace-nowrap text-fg"
                >
                  {language}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <h2 className="text-center text-3xl font-bold">Everything you need to code online</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
              From a first <code className="rounded bg-raised px-1">print(&quot;hello&quot;)</code> to a small multi-file
              project, Bytebox has the tools of a real IDE.
            </p>
          </Reveal>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <li key={feature.title}>
                <Reveal delayMs={(index % 4) * 90} className="h-full">
                  <div className="group h-full rounded-xl border border-line bg-panel p-5 transition hover:-translate-y-1 hover:border-accent/60 hover:shadow-lg">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 font-mono text-lg text-accent transition group-hover:scale-110">
                      {feature.icon}
                    </div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted">{feature.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        {/* How a run works */}
        <section className="border-y border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <Reveal>
              <h2 className="text-center text-3xl font-bold">What happens when you press Run</h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
                Bytebox is built from small services. Your code travels through them in milliseconds and runs in its own
                container that is thrown away afterwards.
              </p>
            </Reveal>
            <Reveal delayMs={150}>
              <div className="relative mt-12">
                {/* The track with requests moving along it (wide screens) */}
                <div aria-hidden="true" className="absolute top-1/2 right-[10%] left-[10%] hidden h-0.5 -translate-y-1/2 bg-line md:block">
                  {[0, 1.3, 2.6].map((delay) => (
                    <span
                      key={delay}
                      className="landing-packet absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </div>
                <ol className="relative grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                  {PIPELINE.map((step, index) => (
                    <li key={step.name} className="rounded-xl border border-line-strong bg-app p-4 text-center shadow">
                      <p className="text-xs text-subtle">{index + 1}</p>
                      <p className="font-semibold">{step.name}</p>
                      <p className="mt-1 text-xs text-muted">{step.tech}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="mt-6 text-center text-sm text-muted">
                Plus a project service (FastAPI · MongoDB), identity (.NET · OAuth) and a terminal service (Node ·
                WebSocket), with PostgreSQL and Redis.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Live numbers */}
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <Reveal>
            <LiveNumbers />
          </Reveal>
        </section>

        {/* Getting started */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <h2 className="text-center text-3xl font-bold">Start in under a minute</h2>
          </Reveal>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delayMs={index * 120} className="h-full">
                  <div className="relative h-full rounded-xl border border-line bg-panel p-6">
                    <span className="absolute -top-4 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-accent font-bold text-accent-fg">
                      {index + 1}
                    </span>
                    <h3 className="mt-2 font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted">{step.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>

          <Reveal>
            <div className="mt-16 rounded-2xl border border-accent/40 bg-accent/10 px-6 py-10 text-center">
              <h2 className="text-2xl font-bold">Ready to build something?</h2>
              <p className="mt-2 text-muted">Open the playground, or sign in to save and share your projects.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/playground" className={PRIMARY}>
                  Open the playground
                </Link>
                <Link href="/login?returnTo=%2Fprojects" className={SECONDARY}>
                  Log in / Sign up
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <span className="mr-auto font-semibold text-fg">📦 Bytebox</span>
          <Link href="/playground" className="hover:text-fg">
            Playground
          </Link>
          <Link href="/explore" className="hover:text-fg">
            Explore
          </Link>
          <Link href="/stats" className="hover:text-fg">
            Stats
          </Link>
        </div>
      </footer>
    </div>
  );
}

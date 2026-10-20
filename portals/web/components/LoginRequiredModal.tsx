'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { loginPageUrl } from '@/lib/auth';

interface Props {
  onClose: () => void;
}

// Shown when a signed-out visitor tries to run code or change something
export function LoginRequiredModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-required-title"
        className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 text-3xl">🔒</div>
        <h2 id="login-required-title" className="mb-2 text-lg font-semibold">
          Login or sign up before making changes
        </h2>
        <p className="mb-5 text-sm text-zinc-400">
          You can look around freely. To run code, edit files, use the terminal or save projects, sign in
          with your GitHub account. It&apos;s free, and your first sign-in creates your account.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={loginPageUrl()}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Log in or sign up
          </Link>
          <button onClick={onClose} className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-900">
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { ThemePicker } from '@/components/ThemePicker';
import { UserMenu } from '@/components/UserMenu';
import { useMe } from '@/lib/auth';

// Top bar of the landing page: links, theme and the user (or Log in)
export function LandingNav() {
  const { user, loading } = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-app/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4">
        <Link href="/" className="mr-auto text-lg font-bold whitespace-nowrap">
          📦 Bytebox
        </Link>
        <Link href="/explore" className="hidden text-sm text-muted hover:text-fg sm:inline">
          Explore
        </Link>
        <Link href="/stats" className="hidden text-sm text-muted hover:text-fg sm:inline">
          Stats
        </Link>
        <ThemePicker />
        <UserMenu user={user} loading={loading} />
      </nav>
    </header>
  );
}

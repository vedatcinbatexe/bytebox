'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { loginPageUrl, logoutUrl, type User } from '@/lib/auth';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';

interface Props {
  user: User | null;
  loading: boolean;
}

function Avatar({ user, size }: { user: User; size: number }) {
  const style = { width: size, height: size };
  // Dev-login users have no GitHub picture
  if (!user.avatarUrl) {
    return (
      <span style={style} className="flex items-center justify-center rounded-full bg-accent text-xs font-bold">
        {user.login.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  // no-referrer: Google profile pictures may refuse requests coming from other sites
  return <img src={user.avatarUrl} alt="" style={style} className="rounded-full" referrerPolicy="no-referrer" />;
}

// Profile section in the header: who is signed in, with My projects and Sign out
export function UserMenu({ user, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading) return <span className="h-8 w-8 animate-pulse rounded-full bg-raised" aria-label="Loading" />;

  if (!user) {
    return (
      <Link
        href={loginPageUrl()}
        className="rounded border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-raised"
      >
        Log in
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-line-strong py-0.5 pr-3 pl-0.5 text-sm hover:bg-raised"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Signed in as ${user.login}`}
      >
        <Avatar user={user} size={28} />
        <span className="max-w-32 truncate">{user.login}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-panel text-sm shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-line p-3">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">@{user.login} · signed in</p>
            </div>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
            className="block w-full px-3 py-2 text-left text-success hover:bg-raised"
          >
            ＋ Create workspace
          </button>
          <Link href="/projects" role="menuitem" className="block px-3 py-2 hover:bg-raised">
            📁 My projects
          </Link>
          <Link href="/" role="menuitem" className="block px-3 py-2 hover:bg-raised">
            ✏️ Workspace
          </Link>
          <a
            href={logoutUrl('/')}
            role="menuitem"
            className="block border-t border-line px-3 py-2 text-danger hover:bg-raised"
          >
            Sign out
          </a>
        </div>
      )}
      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

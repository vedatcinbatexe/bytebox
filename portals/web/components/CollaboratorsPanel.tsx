'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CollabStatus, Person } from '@/lib/useCollab';
import type { Collaborator } from '@/lib/projects';

interface Props {
  slug: string;
  status: CollabStatus;
  people: Person[]; // online now
  ownerLogin: string | null;
  collaborators: Collaborator[];
  isOwner: boolean;
  myUserId: string | null;
  inviteToken: string | null;
  onCreateInvite: () => Promise<void>;
  onStopInvites: () => Promise<void>;
  onRemove: (collaborator: Collaborator) => Promise<void>;
  onOpenFile: (path: string) => void;
}

const STATUS_TEXT: Record<CollabStatus, { text: string; className: string }> = {
  off: { text: 'Not connected', className: 'bg-raised text-muted' },
  connecting: { text: 'Connecting…', className: 'animate-pulse bg-info/15 text-info' },
  live: { text: '● Live', className: 'bg-success/15 text-success' },
  offline: { text: 'Offline, reconnecting…', className: 'bg-warning/15 text-warning' },
};

function Avatar({ person }: { person: Person }) {
  const { user } = person.presence;
  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: user.color, boxShadow: `0 0 0 2px ${user.color}55` }}
    >
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full border-2" style={{ borderColor: user.color }} />
      ) : (
        user.login.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

// The 👥 Collaborators tab: who is here right now, who is on the project, and the invite link
export function CollaboratorsPanel(props: Props) {
  const { slug, status, people, ownerLogin, collaborators, isOwner, myUserId, inviteToken } = props;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const inviteUrl = inviteToken ? `${window.location.origin}/p/${slug}?invite=${inviteToken}` : null;
  const state = STATUS_TEXT[status];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 text-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Online now</h2>
          <span className={`rounded px-2 py-0.5 text-xs ${state.className}`}>{state.text}</span>
        </div>
        {people.length === 0 && <p className="text-subtle">Nobody is connected yet.</p>}
        <ul className="space-y-2">
          {people.map((person) => {
            const { user } = person.presence;
            const file = person.presence.file ?? person.presence.cursor?.path;
            return (
              <li key={person.clientId} className="flex items-center gap-3 rounded-lg border border-line bg-app px-3 py-2">
                <Avatar person={person} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {user.name || user.login}
                    {person.isMe && <span className="text-muted"> (you)</span>}
                    {person.tabs > 1 && <span className="text-xs text-subtle"> · {person.tabs} tabs</span>}
                  </p>
                  {file ? (
                    <button
                      onClick={() => props.onOpenFile(file)}
                      className="truncate font-mono text-xs text-muted hover:text-accent"
                      title="Open this file"
                    >
                      ✎ {file}
                    </button>
                  ) : (
                    <p className="text-xs text-subtle">@{user.login}</p>
                  )}
                </div>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: user.color }} title="Their cursor color" />
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Members</h2>
        <ul className="divide-y divide-line rounded-lg border border-line">
          <li className="flex items-center gap-2 px-3 py-2">
            {ownerLogin ? (
              <Link href={`/u/${encodeURIComponent(ownerLogin)}`} className="hover:text-accent">
                @{ownerLogin}
              </Link>
            ) : (
              <span>Owner</span>
            )}
            <span className="ml-auto rounded bg-accent/15 px-1.5 text-xs text-accent">owner</span>
          </li>
          {collaborators.map((collaborator) => {
            const isMe = collaborator.userId === myUserId;
            return (
              <li key={collaborator.userId} className="flex items-center gap-2 px-3 py-2">
                <span className="truncate">@{collaborator.login ?? 'someone'}</span>
                {isMe && <span className="text-xs text-muted">(you)</span>}
                {(isOwner || isMe) && (
                  <button
                    onClick={() => {
                      const question = isMe ? 'Leave this project? You can join again with an invite link.' : `Remove @${collaborator.login}?`;
                      if (window.confirm(question)) void run(() => props.onRemove(collaborator));
                    }}
                    disabled={busy}
                    className="ml-auto text-xs text-subtle hover:text-danger"
                  >
                    {isMe ? 'Leave' : 'Remove'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {collaborators.length === 0 && <p className="mt-2 text-xs text-subtle">No collaborators yet.</p>}
      </div>

      {isOwner && (
        <div>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Invite people</h2>
          <p className="mb-2 text-xs text-muted">
            Anyone signed in who opens this link can edit the project with you, live.
          </p>
          {inviteUrl ? (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(event) => event.target.select()}
                  aria-label="Invite link"
                  className="min-w-0 flex-1 rounded border border-line-strong bg-app px-2 py-1 font-mono text-xs"
                />
                <button onClick={copy} className="rounded bg-accent px-3 py-1 text-xs font-semibold text-accent-fg hover:bg-accent-hover">
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={() => void run(props.onCreateInvite)} disabled={busy} className="text-muted hover:text-fg">
                  ↻ New link
                </button>
                <button onClick={() => void run(props.onStopInvites)} disabled={busy} className="text-muted hover:text-danger">
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => void run(props.onCreateInvite)}
              disabled={busy}
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              Create invite link
            </button>
          )}
        </div>
      )}
    </section>
  );
}

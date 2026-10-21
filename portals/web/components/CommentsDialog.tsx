'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { addComment, deleteComment, fetchComments, type Comment } from '@/lib/projects';

interface Props {
  slug: string;
  signedIn: boolean;
  onLoginNeeded: () => void;
  onCountChange: (count: number) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const date = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString();
}

// Comments on a project: read them, write one, delete your own (owners can delete any)
export function CommentsDialog({ slug, signedIn, onLoginNeeded, onCountChange, onClose }: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchComments(slug)
      .then(setComments)
      .catch((loadError: Error) => setError(loadError.message));
  }, [slug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function update(next: Comment[]) {
    setComments(next);
    onCountChange(next.length);
  }

  async function post() {
    if (!signedIn) return onLoginNeeded();
    if (!text.trim() || !comments) return;
    setPosting(true);
    setError(null);
    try {
      const added = await addComment(slug, text);
      update([...comments, added]);
      setText('');
    } catch (postError) {
      setError((postError as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function remove(comment: Comment) {
    if (!comments || !window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(slug, comment.id);
      update(comments.filter((other) => other.id !== comment.id));
    } catch (deleteError) {
      setError((deleteError as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-title"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-line bg-panel p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h2 id="comments-title" className="mr-auto text-lg font-semibold">
            💬 Comments {comments && `(${comments.length})`}
          </h2>
          <button onClick={onClose} title="Close (Esc)" className="rounded px-2 py-1 text-muted hover:bg-raised hover:text-fg">
            ✕
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {!comments && !error && <li className="text-sm text-subtle">Loading…</li>}
          {comments?.length === 0 && <li className="text-sm text-subtle">No comments yet. Be the first!</li>}
          {comments?.map((comment) => (
            <li key={comment.id} className="rounded border border-line bg-app px-3 py-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                {comment.authorLogin ? (
                  <Link href={`/u/${encodeURIComponent(comment.authorLogin)}`} className="font-semibold hover:text-accent">
                    @{comment.authorLogin}
                  </Link>
                ) : (
                  <span>someone</span>
                )}
                <span className="text-subtle">{timeAgo(comment.createdAt)}</span>
                {comment.canDelete && (
                  <button onClick={() => remove(comment)} className="ml-auto text-subtle hover:text-danger" title="Delete">
                    🗑
                  </button>
                )}
              </div>
              <p className="text-sm break-words whitespace-pre-wrap text-fg">{comment.text}</p>
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void post();
            }}
            onFocus={() => !signedIn && onLoginNeeded()}
            maxLength={1000}
            rows={3}
            placeholder={signedIn ? 'Write a comment… (⌘/Ctrl + Enter to post)' : 'Log in to comment'}
            aria-label="Write a comment"
            className="resize-none rounded border border-line-strong bg-app px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={post}
            disabled={posting || (signedIn && !text.trim())}
            className="self-end rounded bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

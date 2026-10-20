'use client';

import { useState } from 'react';
import Link from 'next/link';

const MAX_TAGS = 5;

interface Props {
  tags: string[];
  // Only for the owner: save the new list of tags
  onChange?: (tags: string[]) => void;
}

// Tag chips next to the project title; each links to Explore filtered by that tag
export function ProjectTags({ tags, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  function add() {
    const tag = draft.trim().toLowerCase().replace(/\s+/g, '-');
    setDraft('');
    setAdding(false);
    if (tag && !tags.includes(tag)) onChange?.([...tags, tag]);
  }

  if (tags.length === 0 && !onChange) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center rounded-full bg-accent/15 text-xs text-accent">
          <Link href={`/explore?tag=${encodeURIComponent(tag)}`} className="py-0.5 pl-2 hover:underline" title={`Public projects tagged ${tag}`}>
            #{tag}
          </Link>
          {onChange ? (
            <button
              onClick={() => onChange(tags.filter((other) => other !== tag))}
              className="px-1.5 py-0.5 hover:text-fg"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          ) : (
            <span className="pr-2" />
          )}
        </span>
      ))}
      {onChange &&
        tags.length < MAX_TAGS &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
              if (event.key === 'Escape') setAdding(false);
            }}
            onBlur={add}
            maxLength={20}
            placeholder="tag"
            aria-label="New tag"
            className="w-24 rounded-full border border-line-strong bg-app px-2 py-0.5 text-xs outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs whitespace-nowrap text-muted hover:text-fg"
            title="Add a tag so people can find this project on Explore"
          >
            + tag
          </button>
        ))}
    </div>
  );
}

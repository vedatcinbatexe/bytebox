'use client';

import { useEffect, useState } from 'react';
import { ICON_BASE, fileIcon, folderIcon, loadIconLookup, type IconLookup } from '@/lib/fileIcons';
import { editorLanguage } from '@/lib/project';

// Material file/folder icon (an emoji until the icon table has loaded)
export function FileIcon({ path, folder, open = false }: { path: string; folder?: boolean; open?: boolean }) {
  const [lookup, setLookup] = useState<IconLookup | null>(null);
  useEffect(() => {
    void loadIconLookup().then(setLookup);
  }, []);

  if (!lookup) return <span className="w-4 shrink-0 text-center text-xs">{folder ? '📁' : '📄'}</span>;
  const icon = folder ? folderIcon(lookup, path, open) : fileIcon(lookup, path, editorLanguage(path));
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${ICON_BASE}${icon}`} alt="" width={16} height={16} className="h-4 w-4 shrink-0" draggable={false} />;
}

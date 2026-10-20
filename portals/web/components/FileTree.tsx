'use client';

import { useState } from 'react';
import type { TreeNode } from '@/lib/project';

// Drag data type for moving files and folders inside the tree
export const DRAG_TYPE = 'application/x-bytebox-path';

interface Props {
  nodes: TreeNode[];
  activePath: string | null;
  selectedFolder: string;
  onOpenFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onMove: (from: string, toFolder: string) => void;
}

export function FileTree(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function toggle(path: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNodes(nodes: TreeNode[], depth: number) {
    return nodes.map((node) => {
      const isFolder = node.type === 'folder';
      const isOpen = !collapsed.has(node.path);
      const isActive = isFolder ? props.selectedFolder === node.path : props.activePath === node.path;

      return (
        <li key={node.path}>
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, node.path);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (!isFolder || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
              event.preventDefault(); // allow dropping here
              event.stopPropagation();
              setDropTarget(node.path);
            }}
            onDragLeave={() => setDropTarget((current) => (current === node.path ? null : current))}
            onDrop={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              event.stopPropagation();
              setDropTarget(null);
              const from = event.dataTransfer.getData(DRAG_TYPE);
              if (from) props.onMove(from, node.path);
            }}
            onDragEnd={() => setDropTarget(null)}
            className={`group flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm ${
              dropTarget === node.path
                ? 'bg-accent/20 text-fg ring-1 ring-accent ring-inset'
                : isActive
                  ? 'bg-raised text-fg'
                  : 'text-fg hover:bg-raised'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              if (isFolder) {
                toggle(node.path);
                props.onSelectFolder(node.path);
              } else {
                props.onOpenFile(node.path);
              }
            }}
          >
            <span className="w-4 shrink-0 text-xs text-subtle">
              {isFolder ? (isOpen ? '▾' : '▸') : ''}
            </span>
            <span className="shrink-0">{isFolder ? '📁' : '📄'}</span>
            <span className="truncate">{node.name}</span>
            <span className="ml-auto hidden shrink-0 gap-1 group-hover:flex">
              <button
                title="Rename"
                className="rounded px-1 text-muted hover:bg-line hover:text-fg"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onRename(node.path);
                }}
              >
                ✎
              </button>
              <button
                title="Delete"
                className="rounded px-1 text-muted hover:bg-line hover:text-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onDelete(node.path);
                }}
              >
                ✕
              </button>
            </span>
          </div>
          {isFolder && isOpen && node.children.length > 0 && (
            <ul>{renderNodes(node.children, depth + 1)}</ul>
          )}
        </li>
      );
    });
  }

  return <ul className="py-1">{renderNodes(props.nodes, 0)}</ul>;
}

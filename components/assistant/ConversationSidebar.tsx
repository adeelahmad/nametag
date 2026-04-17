'use client';

import { useState } from 'react';
import type { ConversationSummary } from './types';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

export default function ConversationSidebar(props: Props) {
  const {
    conversations,
    activeId,
    onSelect,
    onNew,
    onDelete,
    onRename,
    mobileOpen,
    onCloseMobile,
  } = props;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = (c: ConversationSummary) => {
    setRenamingId(c.id);
    setRenameValue(c.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <aside
      className={`${
        mobileOpen ? 'block' : 'hidden'
      } md:block w-full md:w-72 border-r border-border bg-surface md:bg-transparent flex-shrink-0 flex flex-col min-h-0`}
    >
      <div className="p-3 flex items-center gap-2 border-b border-border">
        <button
          onClick={onNew}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
        <button
          onClick={onCloseMobile}
          className="md:hidden p-2 rounded text-muted hover:bg-surface-elevated"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-xs text-muted px-3 py-6 text-center">
            No conversations yet. Start a new chat.
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                }`}
              >
                {renamingId === c.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 bg-surface-elevated border border-border rounded px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => onSelect(c.id)}
                    className="flex-1 text-left truncate"
                    title={c.title}
                  >
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-[10px] text-muted">
                      {formatRelative(c.updatedAt)} · {c.messageCount} msg
                    </div>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(c);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-foreground"
                  aria-label="Rename"
                  title="Rename"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this conversation?')) onDelete(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-red-500"
                  aria-label="Delete"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}

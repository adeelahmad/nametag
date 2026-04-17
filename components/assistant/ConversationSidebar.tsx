'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConversationSummary, SearchHit } from './types';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onOpenImport: () => void;
  onOpenCommandPalette: () => void;
  showArchived: boolean;
  onToggleShowArchived: () => void;
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

function formatTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

export default function ConversationSidebar(props: Props) {
  const {
    conversations,
    activeId,
    onSelect,
    onNew,
    onDelete,
    onRename,
    onPin,
    onArchive,
    onOpenImport,
    onOpenCommandPalette,
    showArchived,
    onToggleShowArchived,
    mobileOpen,
    onCloseMobile,
  } = props;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/assistant/search?q=${encodeURIComponent(q)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

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
      } md:block w-full md:w-80 border-r border-border bg-surface md:bg-transparent flex-shrink-0 flex flex-col min-h-0`}
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
          onClick={onOpenCommandPalette}
          className="p-2 rounded text-muted hover:bg-surface-elevated hover:text-foreground"
          aria-label="Command palette"
          title="Command palette (Ctrl/Cmd+K)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8m-8 5h8m-8 5h5M4 4h16v16H4z" />
          </svg>
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

      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="relative">
          <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted">
          <button
            onClick={onOpenImport}
            className="hover:text-foreground"
            type="button"
          >
            Import transcript
          </button>
          <button
            onClick={onToggleShowArchived}
            className="hover:text-foreground"
            type="button"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {hits !== null ? (
          <SearchResults
            hits={hits}
            searching={searching}
            onSelect={(id) => {
              onSelect(id);
              setQuery('');
            }}
          />
        ) : conversations.length === 0 ? (
          <div className="text-xs text-muted px-3 py-6 text-center">
            No conversations yet. Start a new chat.
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeId;
            const isArchived = !!c.archivedAt;
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                } ${isArchived ? 'opacity-60' : ''}`}
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
                    className="flex-1 text-left truncate min-w-0"
                    title={c.title}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      {c.pinned ? (
                        <span aria-label="Pinned" title="Pinned" className="text-primary">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" />
                          </svg>
                        </span>
                      ) : null}
                      {c.forkedFromId ? (
                        <span aria-label="Forked" title="Forked from another conversation" className="text-muted">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v6a5 5 0 005 5m5-11v6a5 5 0 01-5 5m-5 0v3m5-3v3" />
                          </svg>
                        </span>
                      ) : null}
                      <span className="truncate font-medium">{c.title}</span>
                    </div>
                    <div className="text-[10px] text-muted flex gap-2">
                      <span>{formatRelative(c.updatedAt)}</span>
                      <span>· {c.messageCount} msg</span>
                      {c.tokenCount > 0 ? (
                        <span>· {formatTokens(c.tokenCount)} tok</span>
                      ) : null}
                    </div>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(c.id, !c.pinned);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-foreground"
                  aria-label={c.pinned ? 'Unpin' : 'Pin'}
                  title={c.pinned ? 'Unpin' : 'Pin'}
                >
                  <svg className="w-3.5 h-3.5" fill={c.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5l7 7m0 0l7 7M12 12l7-7m-7 7l-7 7" />
                  </svg>
                </button>
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
                    onArchive(c.id, !isArchived);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-foreground"
                  aria-label={isArchived ? 'Unarchive' : 'Archive'}
                  title={isArchived ? 'Unarchive' : 'Archive'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7M10 11h4" />
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

function SearchResults({
  hits,
  searching,
  onSelect,
}: {
  hits: SearchHit[];
  searching: boolean;
  onSelect: (id: string) => void;
}) {
  if (searching && hits.length === 0) {
    return <div className="text-xs text-muted px-3 py-4 text-center">Searching…</div>;
  }
  if (hits.length === 0) {
    return <div className="text-xs text-muted px-3 py-4 text-center">No results</div>;
  }
  return (
    <>
      {hits.map((h) => (
        <button
          key={h.conversationId}
          onClick={() => onSelect(h.conversationId)}
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-elevated"
        >
          <div className="text-sm font-medium truncate">{h.title}</div>
          <div className="text-[11px] text-muted line-clamp-2">{h.snippet}</div>
        </button>
      ))}
    </>
  );
}

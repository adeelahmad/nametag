'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationSummary, SearchHit } from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  onSelect: (id: string) => void;
  onNew: () => void;
}

interface Item {
  kind: 'action' | 'conversation' | 'hit';
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  conversations,
  onSelect,
  onNew,
}: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setHits([]);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/assistant/search?q=${encodeURIComponent(q)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
      } catch {
        setHits([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  const items: Item[] = (() => {
    const out: Item[] = [];
    const q = query.trim().toLowerCase();

    out.push({
      kind: 'action',
      id: 'new',
      label: 'New conversation',
      run: () => {
        onNew();
        onClose();
      },
    });

    const convos = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 8)
      : conversations.slice(0, 8);
    for (const c of convos) {
      out.push({
        kind: 'conversation',
        id: c.id,
        label: c.title,
        hint: `${c.messageCount} msg`,
        run: () => {
          onSelect(c.id);
          onClose();
        },
      });
    }
    for (const h of hits) {
      out.push({
        kind: 'hit',
        id: `hit-${h.conversationId}`,
        label: h.title,
        hint: h.snippet,
        run: () => {
          onSelect(h.conversationId);
          onClose();
        },
      });
    }
    return out;
  })();

  const pick = useCallback(
    (idx: number) => {
      const item = items[idx];
      if (item) item.run();
    },
    [items],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-surface border border-border shadow-2xl overflow-hidden"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(active);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Search conversations or type a command…"
          className="w-full px-4 py-3 text-sm bg-transparent outline-none border-b border-border"
        />
        <ul className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted text-center">No matches</li>
          ) : (
            items.map((it, idx) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => pick(idx)}
                  onMouseEnter={() => setActive(idx)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 ${
                    idx === active ? 'bg-primary/10' : ''
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      it.kind === 'action'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-elevated text-muted'
                    }`}
                  >
                    {it.kind === 'action' ? 'cmd' : it.kind === 'hit' ? 'msg' : 'chat'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{it.label}</span>
                    {it.hint ? (
                      <span className="block text-[11px] text-muted truncate">{it.hint}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

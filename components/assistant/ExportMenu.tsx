'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  conversationId: string | null;
}

export default function ExportMenu({ conversationId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!conversationId) return null;

  const url = (format: 'md' | 'json') =>
    `/api/assistant/conversations/${conversationId}/export?format=${format}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-elevated"
      >
        Export
      </button>
      {open ? (
        <div className="absolute right-0 mt-1 w-44 rounded-md border border-border bg-surface shadow-lg z-10 py-1">
          <a
            href={url('md')}
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs hover:bg-surface-elevated"
          >
            Download Markdown
          </a>
          <a
            href={url('json')}
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs hover:bg-surface-elevated"
          >
            Download JSON
          </a>
        </div>
      ) : null}
    </div>
  );
}

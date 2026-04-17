'use client';

import { useState } from 'react';

interface Props {
  kind: 'call' | 'result';
  toolName?: string;
  content: string;
  isError?: boolean;
}

export default function ToolBlock({ kind, toolName, content, isError }: Props) {
  const [open, setOpen] = useState(false);
  const label =
    kind === 'call'
      ? `Tool call: ${toolName ?? 'unknown'}`
      : `Tool result${isError ? ' (error)' : ''}`;

  return (
    <div
      className={`rounded-md border text-xs ${
        isError
          ? 'border-red-400/50 bg-red-500/5'
          : 'border-border bg-surface-elevated'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-1.5 flex items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {label}
        </span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open ? (
        <pre className="px-3 pb-2 pt-0 overflow-x-auto text-[11px] leading-snug whitespace-pre-wrap break-all">
          {content}
        </pre>
      ) : null}
    </div>
  );
}

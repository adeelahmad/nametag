'use client';

import type { AttachmentView } from './types';

interface Props {
  attachment: AttachmentView;
  onRemove?: (id: string) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindIcon(kind: AttachmentView['kind']) {
  if (kind === 'IMAGE') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4-4 4 4 4-4 4 4M4 6h16v12H4z" />
      </svg>
    );
  }
  if (kind === 'PDF') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h6l6 6v10a2 2 0 01-2 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h3m-5 4h10a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function AttachmentChip({ attachment, onRemove }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-surface-elevated text-[11px]">
      <span className="text-muted">{kindIcon(attachment.kind)}</span>
      <span className="font-medium max-w-[140px] truncate" title={attachment.filename}>
        {attachment.filename}
      </span>
      <span className="text-muted">{formatBytes(attachment.byteSize)}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          className="text-muted hover:text-red-500"
          aria-label="Remove attachment"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

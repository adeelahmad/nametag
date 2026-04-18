'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import AttachmentChip from './AttachmentChip';
import type { AttachmentView } from './types';

interface Props {
  conversationId: string | null;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function Composer({
  conversationId,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [uploading, setUploading] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading((n) => n + list.length);
      for (const file of list) {
        try {
          const body = new FormData();
          body.append('file', file);
          if (conversationId) body.append('conversationId', conversationId);
          const res = await fetch('/api/assistant/attachments', {
            method: 'POST',
            body,
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `Upload failed (${res.status})`);
          }
          const data = (await res.json()) as { attachment: AttachmentView };
          setAttachments((prev) => [...prev, data.attachment]);
        } catch (err) {
          toast.error(`${file.name}: ${(err as Error).message}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [conversationId],
  );

  const removeAttachment = useCallback(async (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/assistant/attachments/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const submit = () => {
    const value = text.trim();
    if ((!value && attachments.length === 0) || isStreaming || disabled) return;
    onSend(value, attachments.map((a) => a.id));
    setText('');
    setAttachments([]);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!e.clipboardData.files?.length) return;
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  };

  return (
    <div
      className={`border-t border-border bg-surface ${isDragging ? 'ring-2 ring-primary/60' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <div className="max-w-3xl mx-auto px-4 py-3">
        {attachments.length > 0 || uploading > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} onRemove={removeAttachment} />
            ))}
            {uploading > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted">
                <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                Uploading {uploading}…
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background focus-within:border-primary px-3 py-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
            aria-label="Attach file"
            title="Attach file"
            disabled={disabled || isStreaming}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 10-5.656-5.656l-6.75 6.75a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={isDragging ? 'Drop to attach…' : 'Message your assistant…'}
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 leading-relaxed disabled:opacity-50"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="p-2 rounded-lg bg-red-500/90 text-white hover:bg-red-500"
              aria-label="Stop"
              title="Stop"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <rect x="5" y="5" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={(!text.trim() && attachments.length === 0) || disabled}
              className="p-2 rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
              title="Send"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l14-7-7 14-2-5-5-2z" />
              </svg>
            </button>
          )}
        </div>
        <div className="text-[10px] text-muted mt-1.5 text-center">
          Enter to send · Shift+Enter for newline · Drop files to attach
        </div>
      </div>
    </div>
  );
}

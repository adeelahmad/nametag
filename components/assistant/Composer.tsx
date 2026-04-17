'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export default function Composer({ onSend, onStop, isStreaming }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, []);

  useEffect(() => {
    resize();
  }, [text, resize]);

  const submit = () => {
    const value = text.trim();
    if (!value || isStreaming) return;
    onSend(value);
    setText('');
  };

  return (
    <div className="border-t border-border bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background focus-within:border-primary px-3 py-2">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message your assistant…"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 leading-relaxed"
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
              disabled={!text.trim()}
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
          Enter to send · Shift+Enter for a newline
        </div>
      </div>
    </div>
  );
}

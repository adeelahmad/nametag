'use client';

import { useEffect, useRef, useState } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ToolBlock from './ToolBlock';
import type { ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
  readOnly?: boolean;
  onRegenerate?: () => void;
  onBranch?: (messageId: string, newContent: string) => void;
  streaming?: boolean;
}

export default function MessageList({
  messages,
  readOnly = false,
  onRegenerate,
  onBranch,
  streaming = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const visible = messages.filter(
    (m) => !(m.role === 'ASSISTANT' && m.content === '' && !m.toolCalls),
  );

  const lastAssistantId = (() => {
    for (let i = visible.length - 1; i >= 0; i--) {
      const m = visible[i];
      if (m.role === 'ASSISTANT' && m.content) return m.id;
    }
    return null;
  })();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          visible.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              readOnly={readOnly}
              isLastAssistant={m.id === lastAssistantId}
              streaming={streaming}
              onRegenerate={onRegenerate}
              onBranch={onBranch}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 space-y-3">
      <h2 className="text-2xl font-semibold">Ask your assistant</h2>
      <p className="text-muted text-sm max-w-md mx-auto">
        Query your contacts, create journal entries, look up upcoming events,
        and update notes. The assistant has tools to read and write to your
        Nametag data on your behalf.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  readOnly,
  isLastAssistant,
  streaming,
  onRegenerate,
  onBranch,
}: {
  message: ChatMessage;
  readOnly: boolean;
  isLastAssistant: boolean;
  streaming: boolean;
  onRegenerate?: () => void;
  onBranch?: (messageId: string, newContent: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (message.role === 'USER') {
    if (editing) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] w-full space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(2, Math.min(12, draft.split('\n').length))}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                }}
                className="px-3 py-1.5 text-xs rounded-md text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft.trim() || draft.trim() === message.content}
                onClick={() => {
                  if (!onBranch) return;
                  onBranch(message.id, draft.trim());
                  setEditing(false);
                }}
                className="px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-40"
              >
                Send as new branch
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-end group">
        <div className="max-w-[85%] flex flex-col items-end">
          <div className="rounded-2xl rounded-br-sm bg-primary/10 px-4 py-3 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
          {!readOnly && onBranch ? (
            <div className="opacity-0 group-hover:opacity-100 transition mt-1 flex gap-2 text-[10px] text-muted">
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                className="hover:text-foreground"
                title="Edit and branch"
              >
                Edit & branch
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (message.role === 'TOOL') {
    if (readOnly) return null;
    return (
      <ToolBlock
        kind="result"
        content={message.content}
        isError={message.metadata?.isError === true}
      />
    );
  }

  if (message.toolCalls && message.toolCalls.length > 0 && !message.content) {
    if (readOnly) return null;
    return (
      <div className="space-y-2">
        {message.toolCalls.map((tc) => (
          <ToolBlock
            key={tc.id}
            kind="call"
            toolName={tc.name}
            content={JSON.stringify(tc.arguments, null, 2)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex group">
      <div className="max-w-[95%] w-full">
        <div className="text-xs uppercase tracking-wide text-muted mb-1 flex items-center gap-2">
          <span>Assistant</span>
          {message.streaming ? (
            <span className="inline-block align-middle">
              <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
            </span>
          ) : null}
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={message.content || ' '} />
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && !readOnly ? (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolBlock
                key={tc.id}
                kind="call"
                toolName={tc.name}
                content={JSON.stringify(tc.arguments, null, 2)}
              />
            ))}
          </div>
        ) : null}
        {!readOnly && isLastAssistant && !streaming && onRegenerate ? (
          <div className="opacity-0 group-hover:opacity-100 transition mt-2 flex gap-3 text-[10px] text-muted">
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex items-center gap-1 hover:text-foreground"
              title="Regenerate this reply"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M20 9A9 9 0 005.64 5.64M4 15a9 9 0 0014.36 3.36" />
              </svg>
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(message.content).catch(() => {});
              }}
              className="inline-flex items-center gap-1 hover:text-foreground"
              title="Copy"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M10 8h8a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-8a2 2 0 012-2z" />
              </svg>
              Copy
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ToolBlock from './ToolBlock';
import type { ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Auto-scroll unless the user has manually scrolled up.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Fold the tool_call + tool_result pair into a single visual block attached
  // to the preceding assistant message.
  const visible = messages.filter(
    (m) => !(m.role === 'ASSISTANT' && m.content === '' && !m.toolCalls),
  );

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          visible.map((m) => <MessageBubble key={m.id} message={m} />)
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

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'USER') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-3 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'TOOL') {
    return (
      <ToolBlock
        kind="result"
        content={message.content}
        isError={message.metadata?.isError === true}
      />
    );
  }

  // ASSISTANT (or SYSTEM)
  if (message.toolCalls && message.toolCalls.length > 0 && !message.content) {
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
    <div className="flex">
      <div className="max-w-[95%] w-full">
        <div className="text-xs uppercase tracking-wide text-muted mb-1">
          Assistant
          {message.streaming ? (
            <span className="inline-block ml-2 align-middle">
              <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
            </span>
          ) : null}
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={message.content || ' '} />
        </div>
        {message.toolCalls && message.toolCalls.length > 0 ? (
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
      </div>
    </div>
  );
}

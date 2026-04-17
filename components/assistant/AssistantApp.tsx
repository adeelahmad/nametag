'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import ConversationSidebar from './ConversationSidebar';
import MessageList from './MessageList';
import Composer from './Composer';
import type { ChatMessage, ConversationSummary, SettingsView } from './types';

interface AssistantAppProps {
  settingsView: SettingsView;
}

export default function AssistantApp({ settingsView }: AssistantAppProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasApiKey = settingsView.hasApiKey;

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/assistant/conversations', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: ConversationSummary[] };
    setConversations(data.conversations);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setMessages([]);
    const res = await fetch(`/api/assistant/conversations/${id}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      toast.error('Failed to load conversation');
      return;
    }
    const data = (await res.json()) as { messages: ChatMessage[] };
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      if (!hasApiKey) {
        toast.error('Configure an LLM API key in settings first.');
        return;
      }

      const now = new Date().toISOString();
      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-asst-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempUserId, role: 'USER', content: text, createdAt: now },
        {
          id: tempAssistantId,
          role: 'ASSISTANT',
          content: '',
          createdAt: now,
          streaming: true,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      let finalConversationId = activeId;

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeId ?? undefined,
            message: text,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame
              .split('\n')
              .map((l) => l.trim())
              .find((l) => l.startsWith('data:'));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(payload);
            } catch {
              continue;
            }
            if (ev.type === 'open' && typeof ev.conversationId === 'string') {
              finalConversationId = ev.conversationId;
              setActiveId(ev.conversationId);
              continue;
            }
            if (ev.type === 'delta' && typeof ev.text === 'string') {
              assistantText += ev.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? { ...m, content: assistantText, streaming: true }
                    : m,
                ),
              );
              continue;
            }
            if (ev.type === 'tool_call' && ev.call) {
              const call = ev.call as { id: string; name: string; arguments: unknown };
              setMessages((prev) => [
                ...prev,
                {
                  id: `tmp-toolcall-${call.id}`,
                  role: 'ASSISTANT',
                  content: '',
                  toolCalls: [call],
                  createdAt: new Date().toISOString(),
                  metadata: { toolCall: true },
                },
              ]);
              continue;
            }
            if (ev.type === 'tool_result' && ev.result) {
              const r = ev.result as {
                toolCallId: string;
                content: string;
                isError?: boolean;
              };
              setMessages((prev) => [
                ...prev,
                {
                  id: `tmp-toolres-${r.toolCallId}`,
                  role: 'TOOL',
                  content: r.content,
                  toolCallId: r.toolCallId,
                  createdAt: new Date().toISOString(),
                  metadata: { isError: !!r.isError },
                },
              ]);
              continue;
            }
            if (ev.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, streaming: false } : m,
                ),
              );
              continue;
            }
            if (ev.type === 'error' && typeof ev.error === 'string') {
              toast.error(ev.error);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, streaming: false } : m,
                ),
              );
            }
          }
        }

        // Refresh: get canonical IDs + usage numbers.
        if (finalConversationId) {
          const res2 = await fetch(
            `/api/assistant/conversations/${finalConversationId}`,
            { cache: 'no-store' },
          );
          if (res2.ok) {
            const data = (await res2.json()) as { messages: ChatMessage[] };
            setMessages(data.messages);
          }
        }
        loadConversations();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error((err as Error).message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, hasApiKey, isStreaming, loadConversations],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Failed to delete');
        return;
      }
      if (activeId === id) newConversation();
      loadConversations();
    },
    [activeId, loadConversations, newConversation],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        toast.error('Failed to rename');
        return;
      }
      loadConversations();
    },
    [loadConversations],
  );

  const header = useMemo(() => {
    const active = conversations.find((c) => c.id === activeId);
    return active?.title ?? 'New conversation';
  }, [conversations, activeId]);

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* Mobile header bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-2 rounded text-muted hover:bg-surface-elevated"
          aria-label="Toggle conversations"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="font-medium truncate mx-3">{header}</div>
        <Button href="/settings/assistant" variant="ghost" size="sm">
          Settings
        </Button>
      </div>

      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          loadConversation(id);
          setSidebarOpen(false);
        }}
        onNew={newConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-h-0">
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border">
          <h1 className="text-base font-semibold truncate">{header}</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/assistant"
              className="text-sm text-muted hover:text-foreground"
            >
              Settings
            </Link>
          </div>
        </div>

        {!hasApiKey ? (
          <EmptyApiKeyNotice />
        ) : (
          <MessageList messages={messages} />
        )}

        <Composer onSend={send} onStop={stop} isStreaming={isStreaming} />
      </main>
    </div>
  );
}

function EmptyApiKeyNotice() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Configure your LLM provider</h2>
        <p className="text-muted text-sm">
          The assistant needs an API key to start chatting. Configure any
          OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Ollama, …) or
          the native Anthropic API.
        </p>
        <Button href="/settings/assistant">Open assistant settings</Button>
      </div>
    </div>
  );
}

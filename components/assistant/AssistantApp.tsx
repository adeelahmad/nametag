'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import ConversationSidebar from './ConversationSidebar';
import MessageList from './MessageList';
import Composer from './Composer';
import ShareDialog from './ShareDialog';
import ImportDialog from './ImportDialog';
import ExportMenu from './ExportMenu';
import CommandPalette from './CommandPalette';
import type { ChatMessage, ConversationSummary, SettingsView } from './types';

interface AssistantAppProps {
  settingsView: SettingsView;
}

const MODEL_OPTIONS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'o4-mini',
  'claude-sonnet-4-5',
  'claude-opus-4-7',
  'claude-haiku-4-5',
  'llama-3.3-70b-versatile',
];

export default function AssistantApp({ settingsView }: AssistantAppProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasApiKey = settingsView.hasApiKey;

  const loadConversations = useCallback(async () => {
    const res = await fetch(
      `/api/assistant/conversations${showArchived ? '?includeArchived=1' : ''}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { conversations: ConversationSummary[] };
    setConversations(data.conversations);
  }, [showArchived]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  const consumeStream = useCallback(
    async (
      res: Response,
      tempAssistantId: string,
      signal: AbortController,
    ): Promise<string | null> => {
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let finalConversationId: string | null = null;
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
      void signal;
      return finalConversationId;
    },
    [],
  );

  const refreshAfterStream = useCallback(
    async (convId: string | null) => {
      if (convId) {
        const res = await fetch(`/api/assistant/conversations/${convId}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { messages: ChatMessage[] };
          setMessages(data.messages);
        }
      }
      loadConversations();
    },
    [loadConversations],
  );

  const send = useCallback(
    async (text: string, attachmentIds: string[]) => {
      if ((!text.trim() && attachmentIds.length === 0) || isStreaming) return;
      if (!hasApiKey) {
        toast.error('Configure an LLM API key in settings first.');
        return;
      }

      const now = new Date().toISOString();
      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-asst-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          role: 'USER',
          content: text || '(attachment)',
          createdAt: now,
        },
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
      let finalConvId: string | null = activeId;

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeId ?? undefined,
            message: text,
            attachmentIds,
          }),
          signal: controller.signal,
        });
        finalConvId = (await consumeStream(res, tempAssistantId, controller)) ?? finalConvId;
        await refreshAfterStream(finalConvId);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error((err as Error).message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeId, hasApiKey, isStreaming, consumeStream, refreshAfterStream],
  );

  const regenerate = useCallback(async () => {
    if (!activeId || isStreaming) return;
    const tempAssistantId = `tmp-asst-${Date.now()}`;
    // Drop the trailing assistant/tool block locally so the UI matches the
    // server deletion that's about to happen.
    setMessages((prev) => {
      let cutoff = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'USER') {
          cutoff = i;
          break;
        }
      }
      const kept = cutoff >= 0 ? prev.slice(0, cutoff + 1) : prev;
      return [
        ...kept,
        {
          id: tempAssistantId,
          role: 'ASSISTANT',
          content: '',
          createdAt: new Date().toISOString(),
          streaming: true,
        },
      ];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    try {
      const res = await fetch(
        `/api/assistant/conversations/${activeId}/regenerate`,
        {
          method: 'POST',
          signal: controller.signal,
        },
      );
      await consumeStream(res, tempAssistantId, controller);
      await refreshAfterStream(activeId);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [activeId, isStreaming, consumeStream, refreshAfterStream]);

  const branch = useCallback(
    async (messageId: string, newContent: string) => {
      if (!activeId) return;
      try {
        const res = await fetch(
          `/api/assistant/conversations/${activeId}/branch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, newContent }),
          },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { conversationId: string };
        await loadConversations();
        await loadConversation(data.conversationId);
        toast.success('Branched into a new conversation');
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [activeId, loadConversations, loadConversation],
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

  const pinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (res.ok) loadConversations();
      else toast.error('Failed to update pin');
    },
    [loadConversations],
  );

  const archiveConversation = useCallback(
    async (id: string, archived: boolean) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (res.ok) loadConversations();
      else toast.error('Failed to update archive');
    },
    [loadConversations],
  );

  const changeModel = useCallback(
    async (model: string | null) => {
      if (!activeId) return;
      const res = await fetch(`/api/assistant/conversations/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        loadConversations();
      } else {
        toast.error('Failed to change model');
      }
    },
    [activeId, loadConversations],
  );

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const header = active?.title ?? 'New conversation';
  const activeModel = active?.model ?? settingsView.model;
  const tokenTotal = active?.tokenCount ?? 0;

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
        onPin={pinConversation}
        onArchive={archiveConversation}
        onOpenImport={() => setImportOpen(true)}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        showArchived={showArchived}
        onToggleShowArchived={() => setShowArchived((v) => !v)}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-h-0">
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">{header}</h1>
            <div className="text-[11px] text-muted mt-0.5 flex gap-2">
              <span>{tokenTotal.toLocaleString()} tokens</span>
              {active?.forkedFromId ? <span>· forked</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <select
                value={activeModel}
                onChange={(e) => changeModel(e.target.value || null)}
                className="text-xs rounded border border-border bg-surface px-2 py-1"
                title="Model for this conversation"
              >
                {!MODEL_OPTIONS.includes(activeModel) ? (
                  <option value={activeModel}>{activeModel}</option>
                ) : null}
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : null}
            {active ? <ExportMenu conversationId={active.id} /> : null}
            {active ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-elevated"
              >
                Share
              </button>
            ) : null}
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
          <MessageList
            messages={messages}
            streaming={isStreaming}
            onRegenerate={regenerate}
            onBranch={branch}
          />
        )}

        <Composer
          conversationId={activeId}
          onSend={send}
          onStop={stop}
          isStreaming={isStreaming}
          disabled={!hasApiKey}
        />
      </main>

      {active ? (
        <ShareDialog
          conversationId={active.id}
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      <ImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(id) => {
          loadConversations();
          loadConversation(id);
        }}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        onSelect={loadConversation}
        onNew={newConversation}
      />
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

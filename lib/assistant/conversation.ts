// Conversation persistence + context-window management. Mirrors claude.ai's
// "auto-compact" behavior: when total tokens in active messages exceed a
// configured ratio of the model's context window, summarize the oldest
// uncompacted prefix with a cheap model call and keep only the summary plus
// the most recent turns in the prompt.

import { prisma } from '@/lib/prisma';
import type {
  AssistantConversation,
  AssistantConversationSummary,
  AssistantMessage,
  AssistantSettings,
} from '@prisma/client';
import type {
  NormalizedMessage,
  LlmProvider,
  ToolCall,
} from './types';

// Lightweight heuristic token counter used when the provider doesn't supply
// usage data. Treats 4 chars ≈ 1 token. We only use this to decide *when* to
// compact; the real number comes back from the provider after generation.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function messageTokens(m: {
  content: string;
  toolCalls?: unknown;
  totalTokens?: number | null;
}): number {
  if (m.totalTokens && m.totalTokens > 0) return m.totalTokens;
  let n = estimateTokens(m.content);
  if (m.toolCalls) n += estimateTokens(JSON.stringify(m.toolCalls));
  return n;
}

// Load the active "live" messages for a conversation: everything created
// after the latest summary's coveredUntil (or all of them if none exists).
// Also returns the most recent summary so callers can prepend it.
export async function loadContext(conversationId: string): Promise<{
  summary: AssistantConversationSummary | null;
  messages: AssistantMessage[];
}> {
  const summary = await prisma.assistantConversationSummary.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  });
  const messages = await prisma.assistantMessage.findMany({
    where: {
      conversationId,
      compacted: false,
      ...(summary ? { createdAt: { gt: summary.coveredUntil } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  return { summary, messages };
}

// Convert stored DB messages + latest summary into the provider-neutral
// shape used by `complete()`.
export function toNormalizedMessages(
  summary: AssistantConversationSummary | null,
  messages: AssistantMessage[],
): { system?: string; messages: NormalizedMessage[] } {
  const out: NormalizedMessage[] = [];

  for (const m of messages) {
    if (m.role === 'SYSTEM') {
      out.push({ role: 'system', content: m.content });
      continue;
    }
    if (m.role === 'USER') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    if (m.role === 'ASSISTANT') {
      const toolCalls = Array.isArray(m.toolCalls)
        ? (m.toolCalls as unknown as ToolCall[])
        : undefined;
      out.push({ role: 'assistant', content: m.content, toolCalls });
      continue;
    }
    if (m.role === 'TOOL') {
      out.push({
        role: 'tool',
        content: m.content,
        toolCallId: m.toolCallId ?? undefined,
      });
    }
  }

  return {
    system: summary
      ? `Summary of earlier conversation:\n${summary.summary}`
      : undefined,
    messages: out,
  };
}

export async function createConversation(
  userId: string,
  opts?: { title?: string; origin?: string; bridgeKey?: string },
): Promise<AssistantConversation> {
  return prisma.assistantConversation.create({
    data: {
      userId,
      title: opts?.title ?? 'New conversation',
      origin: opts?.origin ?? 'web',
      bridgeKey: opts?.bridgeKey,
    },
  });
}

export async function appendMessage(
  conversationId: string,
  input: {
    role: 'USER' | 'ASSISTANT' | 'TOOL' | 'SYSTEM';
    content: string;
    toolCalls?: unknown;
    toolCallId?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AssistantMessage> {
  const msg = await prisma.assistantMessage.create({
    data: {
      conversationId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls
        ? (input.toolCalls as object as never)
        : undefined,
      toolCallId: input.toolCallId,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      model: input.model,
      metadata: input.metadata as object | undefined as never,
    },
  });
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: {
      messageCount: { increment: 1 },
      tokenCount: input.totalTokens
        ? { increment: input.totalTokens }
        : undefined,
      updatedAt: new Date(),
    },
  });
  return msg;
}

// Best-effort first-message title derivation, used when creating a fresh
// conversation from a user message.
export function deriveTitle(userText: string): string {
  const trimmed = userText.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'New conversation';
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export async function setTitle(conversationId: string, title: string) {
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: { title },
  });
}

// Auto-compaction: if the conversation is over budget, summarize the oldest
// turns and stash the summary. Returns the new, in-budget context.
export async function maybeCompact(
  conversationId: string,
  settings: AssistantSettings,
  provider: LlmProvider,
): Promise<{ compacted: boolean }> {
  const { summary, messages } = await loadContext(conversationId);
  const budget = Math.floor(settings.contextWindow * settings.compactAtRatio);
  const current =
    (summary ? estimateTokens(summary.summary) : 0) +
    messages.reduce((acc, m) => acc + messageTokens(m), 0);
  if (current < budget) return { compacted: false };

  // Keep the trailing third of messages (minimum 6) in active context and
  // summarize the leading two-thirds.
  const keepCount = Math.max(6, Math.floor(messages.length / 3));
  const toSummarize = messages.slice(0, Math.max(0, messages.length - keepCount));
  if (toSummarize.length === 0) return { compacted: false };

  const transcript = toSummarize
    .map((m) => {
      const role =
        m.role === 'ASSISTANT'
          ? 'Assistant'
          : m.role === 'USER'
            ? 'User'
            : m.role === 'TOOL'
              ? 'Tool'
              : 'System';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');

  const summaryRequest = {
    model: settings.summaryModel || settings.model,
    messages: [
      {
        role: 'user' as const,
        content:
          'Summarize the following conversation preserving: key facts, user goals, decisions, referenced entities (names, ids), and any open tasks. Keep under 400 words, plain prose.\n\n' +
          transcript,
      },
    ],
    maxTokens: 800,
    temperature: 0.2,
  };

  let summaryText = '';
  try {
    const result = await provider.complete(summaryRequest);
    summaryText = result.content.trim();
  } catch (err) {
    // If summarization fails, don't mark anything as compacted — we'll try
    // again on the next turn. Log but keep the conversation functional.
    console.warn('Assistant summary failed:', err);
    return { compacted: false };
  }

  if (!summaryText) return { compacted: false };

  const coveredUntil = toSummarize[toSummarize.length - 1].createdAt;
  const prevHeadline = summary?.headline ?? null;

  await prisma.$transaction([
    prisma.assistantConversationSummary.create({
      data: {
        conversationId,
        coveredUntil,
        messageCount: toSummarize.length + (summary?.messageCount ?? 0),
        headline: prevHeadline,
        summary: summary ? `${summary.summary}\n\n---\n\n${summaryText}` : summaryText,
        tokenCount: estimateTokens(summaryText),
      },
    }),
    prisma.assistantMessage.updateMany({
      where: { id: { in: toSummarize.map((m) => m.id) } },
      data: { compacted: true },
    }),
    prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { summarizedUpToMessageId: toSummarize[toSummarize.length - 1].id },
    }),
  ]);

  return { compacted: true };
}

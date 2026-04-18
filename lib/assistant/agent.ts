// Agentic loop: given a conversation + new user message, call the LLM, run
// any tool_use requests, feed results back, and repeat up to MAX_STEPS.
// Emits SSE-friendly events to the caller so the chat UI can stream tokens
// and tool activity in real time.

import type { AssistantSettings } from '@prisma/client';
import {
  appendMessage,
  loadContext,
  maybeCompact,
  toNormalizedMessages,
} from './conversation';
import { buildProvider } from './provider-factory';
import { getDecryptedApiKey, resolveSystemPrompt } from './settings';
import { listTools, runTool, type ToolContext } from './tools';
import type {
  LlmProvider,
  NormalizedMessage,
  StreamEvent,
  ToolDefinition,
} from './types';

const MAX_STEPS = 8;

export interface RunAssistantOptions {
  userId: string;
  conversationId: string;
  settings: AssistantSettings;
  // Optional injected provider (tests / matter-bridge); defaults to the one
  // built from settings + decrypted API key.
  provider?: LlmProvider;
  onEvent: (ev: StreamEvent) => void;
  // Abort signal to propagate client disconnect.
  signal?: AbortSignal;
  // Per-conversation override for the model identifier. Falls back to
  // settings.model when null/undefined.
  modelOverride?: string | null;
}

function buildToolList(settings: AssistantSettings): ToolDefinition[] {
  if (!settings.toolsEnabled) return [];
  return listTools({ disabled: settings.disabledTools }).map((t) => t.definition);
}

export async function runAssistantTurn(opts: RunAssistantOptions): Promise<void> {
  const { userId, conversationId, settings, onEvent, signal } = opts;

  const apiKey = await getDecryptedApiKey(userId);
  const provider = opts.provider ?? buildProvider(settings, apiKey);

  // Auto-compact before we build the prompt so the summarizer runs on a
  // coherent cut-off point.
  await maybeCompact(conversationId, settings, provider);

  const system = resolveSystemPrompt(settings);
  const toolCtx: ToolContext = { userId };
  const activeModel = opts.modelOverride?.trim() || settings.model;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) {
      onEvent({ type: 'error', error: 'Aborted' });
      return;
    }

    const { summary, messages } = await loadContext(conversationId);
    const { system: summarySystem, messages: normalized } = toNormalizedMessages(
      summary,
      messages,
    );

    const request = {
      model: activeModel,
      messages: normalized,
      system: summarySystem ? `${system}\n\n${summarySystem}` : system,
      tools: buildToolList(settings),
      maxTokens: settings.maxTokens,
      temperature: settings.temperature,
    };

    const completion = await provider.complete(request, (text) => {
      onEvent({ type: 'delta', text });
    });

    onEvent({
      type: 'message',
      content: completion.content,
      toolCalls: completion.toolCalls,
      usage: completion.usage,
      stopReason: completion.stopReason,
    });

    // Persist the assistant turn (tool calls included).
    await appendMessage(conversationId, {
      role: 'ASSISTANT',
      content: completion.content,
      toolCalls: completion.toolCalls.length ? completion.toolCalls : undefined,
      promptTokens: completion.usage?.promptTokens,
      completionTokens: completion.usage?.completionTokens,
      totalTokens: completion.usage?.totalTokens,
      model: completion.model ?? activeModel,
      metadata: { stopReason: completion.stopReason },
    });

    if (completion.stopReason !== 'tool_use' || completion.toolCalls.length === 0) {
      return;
    }

    // Execute each tool call sequentially so later ones can observe earlier
    // writes. This is simpler than parallelism and matches the agent loop in
    // most Claude-style clients.
    for (const call of completion.toolCalls) {
      onEvent({ type: 'tool_call', call });
      const { result, isError } = await runTool(call.name, call.arguments, toolCtx);
      const content = safeJsonString(result);
      onEvent({
        type: 'tool_result',
        result: { toolCallId: call.id, content, isError },
      });
      await appendMessage(conversationId, {
        role: 'TOOL',
        content,
        toolCallId: call.id,
        metadata: { tool: call.name, isError },
      });
    }

    // Loop: next iteration will feed the tool results back to the model.
  }

  onEvent({
    type: 'error',
    error: `Reached tool-use step limit (${MAX_STEPS}).`,
  });
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Convenience for non-streaming callers (matter-bridge): collect deltas into
// a final string and return it along with any tool-call summary.
export async function runAssistantTurnToString(
  opts: Omit<RunAssistantOptions, 'onEvent'>,
): Promise<{ text: string; error?: string }> {
  let text = '';
  let error: string | undefined;
  await runAssistantTurn({
    ...opts,
    onEvent(ev) {
      if (ev.type === 'delta') text += ev.text;
      if (ev.type === 'error') error = ev.error;
    },
  });
  return { text, error };
}

export function composeNormalizedForDebug(system: string, msgs: NormalizedMessage[]) {
  return { system, msgs };
}

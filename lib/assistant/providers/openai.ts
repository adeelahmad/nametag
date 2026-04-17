// OpenAI-compatible chat-completions adapter. Works against the official
// OpenAI API, Azure OpenAI (with a matching baseUrl), OpenRouter, Groq,
// Together, Mistral, local llama.cpp/Ollama/LM Studio, and any other gateway
// that implements /chat/completions with SSE streaming.

import type {
  CompletionRequest,
  LlmProvider,
  NormalizedMessage,
  ProviderCompletion,
  ToolCall,
  ToolDefinition,
} from '../types';

interface OpenAiToolCallPart {
  index: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

interface OpenAiStreamDelta {
  content?: string | null;
  tool_calls?: OpenAiToolCallPart[];
  role?: string;
}

interface OpenAiStreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: OpenAiStreamDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function toOpenAiMessages(messages: NormalizedMessage[], system?: string) {
  const out: Array<Record<string, unknown>> = [];
  if (system) {
    out.push({ role: 'system', content: system });
  }
  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toOpenAiTools(tools: ToolDefinition[] | undefined) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function normalizeStopReason(
  finish: string | null | undefined,
  hadToolCalls: boolean,
): ProviderCompletion['stopReason'] {
  if (finish === 'tool_calls' || hadToolCalls) return 'tool_use';
  if (finish === 'length') return 'length';
  if (finish === 'stop' || !finish) return 'stop';
  return 'stop';
}

export function createOpenAiCompatibleProvider(opts: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): LlmProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const apiKey = opts.apiKey;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  async function complete(
    req: CompletionRequest,
    onDelta?: (text: string) => void,
  ): Promise<ProviderCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: toOpenAiMessages(req.messages, req.system),
        stream: true,
        stream_options: { include_usage: true },
      };
      if (req.maxTokens != null) body.max_tokens = req.maxTokens;
      if (req.temperature != null) body.temperature = req.temperature;
      const tools = toOpenAiTools(req.tools);
      if (tools) body.tools = tools;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await safeReadText(res);
        throw new Error(
          `LLM request failed (${res.status}): ${errText || res.statusText}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      const toolPartials = new Map<number, { id: string; name: string; args: string }>();
      let finishReason: string | null | undefined;
      let usage: ProviderCompletion['usage'];
      let model: string | undefined = req.model;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines. Each frame has one or more
        // `data: ...` lines; the special `[DONE]` sentinel ends the stream.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n').map((l) => l.trim()).filter(Boolean);
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            let chunk: OpenAiStreamChunk;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }

            if (chunk.model) model = chunk.model;
            if (chunk.usage) {
              usage = {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              };
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta;
            if (!delta) continue;

            if (typeof delta.content === 'string' && delta.content.length > 0) {
              content += delta.content;
              onDelta?.(delta.content);
            }

            if (delta.tool_calls) {
              for (const part of delta.tool_calls) {
                const entry =
                  toolPartials.get(part.index) ?? { id: '', name: '', args: '' };
                if (part.id) entry.id = part.id;
                if (part.function?.name) entry.name = part.function.name;
                if (part.function?.arguments)
                  entry.args += part.function.arguments;
                toolPartials.set(part.index, entry);
              }
            }
          }
        }
      }

      const toolCalls: ToolCall[] = [];
      for (const entry of toolPartials.values()) {
        if (!entry.name) continue;
        let parsed: Record<string, unknown> = {};
        if (entry.args) {
          try {
            parsed = JSON.parse(entry.args);
          } catch {
            parsed = { _raw: entry.args };
          }
        }
        toolCalls.push({
          id: entry.id || `call_${Math.random().toString(36).slice(2, 10)}`,
          name: entry.name,
          arguments: parsed,
        });
      }

      return {
        content,
        toolCalls,
        stopReason: normalizeStopReason(finishReason, toolCalls.length > 0),
        usage,
        model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { id: 'openai-compatible', complete };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

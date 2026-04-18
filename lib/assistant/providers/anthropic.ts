// Anthropic Messages API adapter. Streams via SSE and returns a normalized
// completion that the rest of the module can treat identically to the
// OpenAI-compatible adapter.

import type {
  CompletionRequest,
  LlmProvider,
  NormalizedMessage,
  ProviderCompletion,
  ToolCall,
  ToolDefinition,
} from '../types';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  partial_json?: string;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  content_block?: AnthropicContentBlock;
  message?: {
    id?: string;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  usage?: { output_tokens?: number };
}

function toAnthropicMessages(messages: NormalizedMessage[]) {
  const out: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

  // Anthropic requires alternating user/assistant. Tool results are returned
  // as user-role messages with content-type "tool_result". Assistant tool_use
  // blocks live alongside text content on assistant messages.
  let pendingToolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

  function flushToolResults() {
    if (pendingToolResults.length > 0) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  }

  for (const m of messages) {
    if (m.role === 'system') continue; // handled via `system` param
    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId ?? '',
        content: m.content,
      });
      continue;
    }
    flushToolResults();
    if (m.role === 'assistant') {
      const blocks: Array<Record<string, unknown>> = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      out.push({ role: 'user', content: m.content });
    }
  }
  flushToolResults();
  return out;
}

function toAnthropicTools(tools: ToolDefinition[] | undefined) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function mapStopReason(
  reason: string | undefined,
  hadToolUse: boolean,
): ProviderCompletion['stopReason'] {
  if (reason === 'tool_use' || hadToolUse) return 'tool_use';
  if (reason === 'max_tokens') return 'length';
  if (reason === 'end_turn' || !reason) return 'stop';
  return 'stop';
}

export function createAnthropicProvider(opts: {
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
        max_tokens: req.maxTokens ?? 4096,
        messages: toAnthropicMessages(req.messages),
        stream: true,
      };
      if (req.system) body.system = req.system;
      if (req.temperature != null) body.temperature = req.temperature;
      const tools = toAnthropicTools(req.tools);
      if (tools) body.tools = tools;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        Accept: 'text/event-stream',
      };
      if (apiKey) headers['x-api-key'] = apiKey;

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await safeReadText(res);
        throw new Error(
          `Anthropic request failed (${res.status}): ${errText || res.statusText}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      const toolParts = new Map<
        number,
        { id: string; name: string; json: string }
      >();
      let stopReason: string | undefined;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let model: string | undefined = req.model;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n').map((l) => l.trim()).filter(Boolean);
          let dataLine: string | undefined;
          for (const l of lines) {
            if (l.startsWith('data:')) dataLine = l.slice(5).trim();
          }
          if (!dataLine || dataLine === '[DONE]') continue;
          let ev: AnthropicStreamEvent;
          try {
            ev = JSON.parse(dataLine);
          } catch {
            continue;
          }

          switch (ev.type) {
            case 'message_start':
              if (ev.message?.model) model = ev.message.model;
              if (ev.message?.usage?.input_tokens != null)
                inputTokens = ev.message.usage.input_tokens;
              if (ev.message?.usage?.output_tokens != null)
                outputTokens = ev.message.usage.output_tokens;
              break;
            case 'content_block_start': {
              const block = ev.content_block;
              if (block?.type === 'tool_use' && ev.index != null) {
                toolParts.set(ev.index, {
                  id: block.id ?? '',
                  name: block.name ?? '',
                  json: '',
                });
              }
              break;
            }
            case 'content_block_delta': {
              const d = ev.delta;
              if (d?.type === 'text_delta' && d.text) {
                text += d.text;
                onDelta?.(d.text);
              } else if (d?.type === 'input_json_delta' && ev.index != null) {
                const entry = toolParts.get(ev.index);
                if (entry && d.partial_json) entry.json += d.partial_json;
              }
              break;
            }
            case 'message_delta':
              if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
              break;
            case 'message_stop':
              break;
            default:
              break;
          }
        }
      }

      const toolCalls: ToolCall[] = [];
      for (const entry of toolParts.values()) {
        let parsed: Record<string, unknown> = {};
        if (entry.json) {
          try {
            parsed = JSON.parse(entry.json);
          } catch {
            parsed = { _raw: entry.json };
          }
        }
        toolCalls.push({ id: entry.id, name: entry.name, arguments: parsed });
      }

      return {
        content: text,
        toolCalls,
        stopReason: mapStopReason(stopReason, toolCalls.length > 0),
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens:
            inputTokens != null && outputTokens != null
              ? inputTokens + outputTokens
              : undefined,
        },
        model,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { id: 'anthropic', complete };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

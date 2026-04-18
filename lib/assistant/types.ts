// Shared types for the Assistant module: provider-agnostic message, tool
// schema, and streaming-event shapes. These are the common contract between
// the provider adapters, the agentic loop, the API routes, and the UI.

export type AssistantRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  // Arguments as a JSON-serializable object. Providers that stream partial
  // arguments will have them re-assembled into a final object before we
  // surface them here.
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// A message in the provider-neutral format we keep in memory while building
// a single completion request. Database messages are mapped into this shape
// via `buildContext()`.
export interface NormalizedMessage {
  role: AssistantRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

// JSON-Schema-style parameter spec, trimmed to what we actually use.
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export type JSONSchema =
  | { type: 'string'; description?: string; enum?: string[] }
  | { type: 'number'; description?: string }
  | { type: 'integer'; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items?: JSONSchema }
  | { type: 'object'; description?: string; properties?: Record<string, JSONSchema>; required?: string[] }
  | { type: 'null'; description?: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface CompletionRequest {
  model: string;
  messages: NormalizedMessage[];
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

// Streaming event types mirrored in the UI over SSE.
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | {
      type: 'message';
      content: string;
      toolCalls?: ToolCall[];
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      stopReason?: 'stop' | 'tool_use' | 'length' | 'error';
    }
  | { type: 'error'; error: string }
  | { type: 'done'; conversationId: string };

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProviderCompletion {
  content: string;
  toolCalls: ToolCall[];
  stopReason: 'stop' | 'tool_use' | 'length' | 'error';
  usage?: TokenUsage;
  model?: string;
}

export interface LlmProvider {
  // Name for logs/UI, e.g. "openai-compatible" or "anthropic".
  readonly id: string;
  // Returns a single completion, streamed via the callback while aggregating
  // the final result. Throws on transport/API errors.
  complete(
    req: CompletionRequest,
    onDelta?: (text: string) => void,
  ): Promise<ProviderCompletion>;
}

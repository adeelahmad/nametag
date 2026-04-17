// Shared client-side types for the assistant chat UI.

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string | null;
  pinned: boolean;
  messageCount: number;
  tokenCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
  toolCallId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  // Client-only: true while the assistant turn is mid-stream.
  streaming?: boolean;
}

export interface SettingsView {
  provider: 'OPENAI_COMPATIBLE' | 'ANTHROPIC';
  baseUrl: string;
  model: string;
  summaryModel: string | null;
  hasApiKey: boolean;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  compactAtRatio: number;
  systemPrompt: string | null;
  toolsEnabled: boolean;
  mcpEnabled: boolean;
  disabledTools: string[];
}

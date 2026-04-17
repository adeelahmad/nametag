// Transcript export/import for assistant conversations.
//
// Two formats are supported:
//   * "markdown" — human-readable, claude.ai-style; one message per section
//     headed by `## USER`, `## ASSISTANT`, `## SYSTEM`, or `## TOOL`.
//   * "json"     — lossless structured dump including tool_calls and usage.
//
// Imports are tolerant (extra whitespace, mixed heading case, missing trailing
// newline) and sanitized: tool_call payloads are preserved but tool_result
// messages are reclassified as SYSTEM text to avoid the agent loop re-issuing
// tool invocations on replay.
//
// The import cap is 1 MiB to avoid memory blow-ups.
import type { AssistantConversation, AssistantMessage } from '@prisma/client';

export type ExportFormat = 'markdown' | 'json';

export const MAX_IMPORT_BYTES = 1024 * 1024;

export type ParsedTranscriptMessage = {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
};

// ---------- Export ---------------------------------------------------------

export function exportAsMarkdown(
  conv: Pick<AssistantConversation, 'title' | 'createdAt'>,
  messages: Pick<
    AssistantMessage,
    'role' | 'content' | 'toolCalls' | 'toolCallId' | 'createdAt'
  >[],
): string {
  const lines: string[] = [];
  lines.push(`# ${conv.title}`);
  lines.push('');
  lines.push(`_Exported ${new Date().toISOString()}_`);
  lines.push('');
  for (const m of messages) {
    lines.push(`## ${m.role}`);
    if (m.role === 'TOOL' && m.toolCallId) {
      lines.push(`<!-- tool_call_id: ${m.toolCallId} -->`);
    }
    lines.push('');
    lines.push(m.content);
    lines.push('');
    if (m.role === 'ASSISTANT' && m.toolCalls) {
      lines.push('```json tool_calls');
      lines.push(JSON.stringify(m.toolCalls, null, 2));
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function exportAsJSON(
  conv: Pick<AssistantConversation, 'id' | 'title' | 'createdAt'>,
  messages: Pick<
    AssistantMessage,
    | 'role'
    | 'content'
    | 'toolCalls'
    | 'toolCallId'
    | 'promptTokens'
    | 'completionTokens'
    | 'totalTokens'
    | 'model'
    | 'createdAt'
  >[],
): string {
  return JSON.stringify(
    {
      schema: 'nametag.assistant.transcript/v1',
      exportedAt: new Date().toISOString(),
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
      },
      messages,
    },
    null,
    2,
  );
}

// ---------- Import ---------------------------------------------------------

export class TranscriptParseError extends Error {}

export function parseTranscript(
  raw: string,
  format?: ExportFormat,
): { title?: string; messages: ParsedTranscriptMessage[] } {
  if (raw.length > MAX_IMPORT_BYTES) {
    throw new TranscriptParseError('Transcript exceeds 1 MiB cap');
  }
  const trimmed = raw.trim();
  if (!trimmed) return { messages: [] };

  const looksJson =
    format === 'json' || (!format && trimmed.startsWith('{') && trimmed.endsWith('}'));

  if (looksJson) return parseJsonTranscript(trimmed);
  return parseMarkdownTranscript(trimmed);
}

function parseJsonTranscript(
  raw: string,
): { title?: string; messages: ParsedTranscriptMessage[] } {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new TranscriptParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (!doc || typeof doc !== 'object') {
    throw new TranscriptParseError('Transcript root must be an object');
  }
  const obj = doc as Record<string, unknown>;
  const rawMessages = Array.isArray(obj.messages) ? obj.messages : null;
  if (!rawMessages) {
    throw new TranscriptParseError('Missing `messages` array');
  }
  const title =
    (obj.conversation as { title?: string } | undefined)?.title ?? undefined;
  const messages: ParsedTranscriptMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const role = normalizeRole(String(m.role ?? ''));
    if (!role) continue;
    const content = String(m.content ?? '');
    const parsed: ParsedTranscriptMessage = { role, content };
    if (role === 'ASSISTANT' && m.toolCalls != null) {
      parsed.toolCalls = m.toolCalls;
    }
    if (role === 'TOOL' && typeof m.toolCallId === 'string') {
      parsed.toolCallId = m.toolCallId;
    }
    messages.push(parsed);
  }
  return { title, messages: sanitize(messages) };
}

function parseMarkdownTranscript(
  raw: string,
): { title?: string; messages: ParsedTranscriptMessage[] } {
  // Extract leading `# Title` if present (first line only).
  let title: string | undefined;
  let body = raw;
  const firstLine = raw.split('\n', 1)[0];
  if (/^#\s+\S/.test(firstLine)) {
    title = firstLine.replace(/^#\s+/, '').trim();
    body = raw.slice(firstLine.length);
  }

  const pattern = /^##\s+(USER|ASSISTANT|SYSTEM|TOOL)\s*$/gim;
  const messages: ParsedTranscriptMessage[] = [];
  const matches: { role: ParsedTranscriptMessage['role']; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const role = normalizeRole(m[1]);
    if (!role) continue;
    matches.push({ role, start: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) {
    // Best-effort: treat the whole body as a single user message.
    const text = body.trim();
    if (text) messages.push({ role: 'USER', content: text });
    return { title, messages: sanitize(messages) };
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const slice = body
      .slice(cur.end, next ? next.start : body.length)
      .replace(/^\s*\n/, '')
      .trimEnd();
    const { content, toolCalls, toolCallId } = splitMarkdownSection(slice);
    messages.push({ role: cur.role, content, toolCalls, toolCallId });
  }
  return { title, messages: sanitize(messages) };
}

function splitMarkdownSection(section: string): {
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
} {
  let content = section;
  let toolCalls: unknown;
  let toolCallId: string | undefined;

  const idMatch = content.match(/<!--\s*tool_call_id:\s*(.+?)\s*-->/);
  if (idMatch) {
    toolCallId = idMatch[1];
    content = content.replace(idMatch[0], '').trim();
  }
  const fenceMatch = content.match(
    /```json\s+tool_calls\s*\n([\s\S]*?)\n```/,
  );
  if (fenceMatch) {
    try {
      toolCalls = JSON.parse(fenceMatch[1]);
    } catch {
      // Ignore malformed tool_calls JSON — we'd rather keep the content.
    }
    content = content.replace(fenceMatch[0], '').trim();
  }
  return { content, toolCalls, toolCallId };
}

function normalizeRole(raw: string): ParsedTranscriptMessage['role'] | null {
  const r = raw.trim().toUpperCase();
  if (r === 'USER' || r === 'ASSISTANT' || r === 'SYSTEM' || r === 'TOOL') {
    return r;
  }
  return null;
}

// Strip tool-result replay vectors — rewrite TOOL messages as SYSTEM notes
// so an imported transcript doesn't cause the live agent to re-issue tools.
function sanitize(messages: ParsedTranscriptMessage[]): ParsedTranscriptMessage[] {
  return messages.map((m) =>
    m.role === 'TOOL'
      ? {
          role: 'SYSTEM',
          content: `[imported tool result${
            m.toolCallId ? ` for ${m.toolCallId}` : ''
          }]\n${m.content}`,
        }
      : m,
  );
}

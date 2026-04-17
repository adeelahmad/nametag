import { describe, expect, it } from 'vitest';
import {
  exportAsJSON,
  exportAsMarkdown,
  MAX_IMPORT_BYTES,
  parseTranscript,
  TranscriptParseError,
} from '@/lib/assistant/transcripts';

const conv = {
  id: 'c1',
  title: 'Demo',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const messages = [
  {
    role: 'USER' as const,
    content: 'Hello there',
    toolCalls: null,
    toolCallId: null,
    createdAt: new Date('2026-01-01T00:00:01Z'),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: null,
  },
  {
    role: 'ASSISTANT' as const,
    content: 'General Kenobi',
    toolCalls: [{ id: 'call_1', name: 'search', arguments: { q: 'x' } }],
    toolCallId: null,
    createdAt: new Date('2026-01-01T00:00:02Z'),
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    model: 'gpt-4o',
  },
  {
    role: 'TOOL' as const,
    content: '{"result":"sensitive"}',
    toolCalls: null,
    toolCallId: 'call_1',
    createdAt: new Date('2026-01-01T00:00:03Z'),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: null,
  },
];

describe('transcripts markdown export/import', () => {
  it('round-trips a conversation while sanitizing tool results', () => {
    const md = exportAsMarkdown(conv, messages);
    expect(md).toContain('# Demo');
    expect(md).toContain('## USER');
    expect(md).toContain('## ASSISTANT');
    expect(md).toContain('## TOOL');
    expect(md).toContain('tool_call_id: call_1');

    const parsed = parseTranscript(md, 'markdown');
    expect(parsed.title).toBe('Demo');
    const roles = parsed.messages.map((m) => m.role);
    // TOOL must have been rewritten to SYSTEM so a replay cannot re-trigger tools
    expect(roles).toEqual(['USER', 'ASSISTANT', 'SYSTEM']);
    expect(parsed.messages[2].content).toMatch(/\[imported tool result for call_1\]/);
    expect(parsed.messages[1].toolCalls).toBeTruthy();
  });

  it('tolerates mixed case and missing fences', () => {
    const body = '## user\nHi there\n\n## Assistant\nreply';
    const parsed = parseTranscript(body, 'markdown');
    expect(parsed.messages.map((m) => m.role)).toEqual(['USER', 'ASSISTANT']);
  });
});

describe('transcripts JSON export/import', () => {
  it('round-trips structured data', () => {
    const json = exportAsJSON(conv, messages);
    expect(json).toContain('"schema": "nametag.assistant.transcript/v1"');
    const parsed = parseTranscript(json, 'json');
    expect(parsed.messages.length).toBe(3);
    // Sanitizer still applies.
    expect(parsed.messages[2].role).toBe('SYSTEM');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseTranscript('{not json', 'json')).toThrow(TranscriptParseError);
  });

  it('rejects payloads over the import cap', () => {
    const huge = 'a'.repeat(MAX_IMPORT_BYTES + 1);
    expect(() => parseTranscript(huge)).toThrow(TranscriptParseError);
  });
});

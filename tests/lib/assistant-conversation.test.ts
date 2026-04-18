import { describe, expect, it } from 'vitest';
import {
  deriveTitle,
  estimateTokens,
  messageTokens,
  toNormalizedMessages,
} from '@/lib/assistant/conversation';

describe('assistant conversation helpers', () => {
  it('estimateTokens approximates 4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('12345')).toBe(2);
  });

  it('messageTokens prefers provider-reported totalTokens when present', () => {
    expect(messageTokens({ content: 'some text', totalTokens: 42 })).toBe(42);
    expect(messageTokens({ content: 'xxxxxxxx' })).toBe(2);
  });

  it('deriveTitle falls back to "New conversation" for empty input', () => {
    expect(deriveTitle('')).toBe('New conversation');
    expect(deriveTitle('   ')).toBe('New conversation');
  });

  it('deriveTitle preserves short titles and truncates long ones', () => {
    expect(deriveTitle('Hello there')).toBe('Hello there');
    const long = 'a'.repeat(100);
    const derived = deriveTitle(long);
    expect(derived.length).toBeLessThanOrEqual(60);
    expect(derived.endsWith('…')).toBe(true);
  });

  it('toNormalizedMessages maps DB messages into provider-neutral shape', () => {
    const now = new Date();
    const { system, messages } = toNormalizedMessages(null, [
      {
        id: '1',
        conversationId: 'c',
        role: 'USER',
        content: 'hi',
        toolCalls: null,
        toolCallId: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        compacted: false,
        metadata: null,
        createdAt: now,
      },
      {
        id: '2',
        conversationId: 'c',
        role: 'ASSISTANT',
        content: 'hello',
        toolCalls: null,
        toolCallId: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        model: null,
        compacted: false,
        metadata: null,
        createdAt: now,
      },
    ]);
    expect(system).toBeUndefined();
    expect(messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', toolCalls: undefined },
    ]);
  });

  it('toNormalizedMessages prepends summary as system context', () => {
    const now = new Date();
    const { system } = toNormalizedMessages(
      {
        id: 's1',
        conversationId: 'c',
        coveredUntil: now,
        messageCount: 10,
        headline: null,
        summary: 'Alice called.',
        tokenCount: 10,
        createdAt: now,
      },
      [],
    );
    expect(system).toContain('Summary of earlier conversation');
    expect(system).toContain('Alice called.');
  });
});

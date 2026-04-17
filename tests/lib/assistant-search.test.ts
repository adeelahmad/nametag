import { describe, expect, it } from 'vitest';
import { snippetAround } from '@/lib/assistant/search';

describe('snippetAround', () => {
  it('centers a window around the first match', () => {
    const prefix = 'preamble '.repeat(30);
    const suffix = ' postscript'.repeat(30);
    const text = `${prefix}needle${suffix}`;
    const out = snippetAround(text, 'needle');
    expect(out).toMatch(/needle/);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns leading text when match is at the start', () => {
    const out = snippetAround('hello world, this is a demo', 'hello');
    expect(out.startsWith('…')).toBe(false);
  });

  it('is case-insensitive', () => {
    const out = snippetAround('Find my Contact list please', 'contact');
    expect(out).toMatch(/Contact/);
  });

  it('falls back to a slice when query not found', () => {
    const out = snippetAround('nothing matches here', 'xyz');
    expect(out).toBe('nothing matches here');
  });

  it('handles empty input gracefully', () => {
    expect(snippetAround('', 'x')).toBe('');
  });
});

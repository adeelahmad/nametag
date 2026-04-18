import { describe, expect, it } from 'vitest';
import {
  extractBearer,
  generateToken,
  hashToken,
  previewOf,
} from '@/lib/assistant/bridge-auth';

describe('bridge auth helpers', () => {
  it('generateToken produces nmt-prefixed opaque strings', () => {
    const t = generateToken();
    expect(t.startsWith('nmt_')).toBe(true);
    expect(t.length).toBeGreaterThan(30);
  });

  it('hashToken is deterministic', () => {
    expect(hashToken('nmt_example')).toBe(hashToken('nmt_example'));
    expect(hashToken('nmt_a')).not.toBe(hashToken('nmt_b'));
  });

  it('previewOf masks the middle of the token', () => {
    expect(previewOf('nmt_abcdefghij12345')).toContain('…');
    expect(previewOf('short')).toBe('short');
  });

  it('extractBearer reads Authorization headers', () => {
    const req = new Request('https://x/a', {
      headers: { authorization: 'Bearer nmt_foo' },
    });
    expect(extractBearer(req)).toBe('nmt_foo');

    const reqLower = new Request('https://x/a', {
      headers: { authorization: 'bearer nmt_bar' },
    });
    expect(extractBearer(reqLower)).toBe('nmt_bar');

    const reqMissing = new Request('https://x/a');
    expect(extractBearer(reqMissing)).toBeNull();

    const reqWrongScheme = new Request('https://x/a', {
      headers: { authorization: 'Basic abc' },
    });
    expect(extractBearer(reqWrongScheme)).toBeNull();
  });
});

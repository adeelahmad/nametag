import { describe, expect, it } from 'vitest';
import {
  generateShareToken,
  hashShareToken,
  previewShareToken,
} from '@/lib/assistant/share';

describe('share token helpers', () => {
  it('generateShareToken returns nmts_-prefixed opaque strings', () => {
    const t = generateShareToken();
    expect(t.startsWith('nmts_')).toBe(true);
    // 32 random bytes → base64url ≈ 43 chars; with the prefix that's >= 48.
    expect(t.length).toBeGreaterThanOrEqual(48);
  });

  it('each call produces a distinct token', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });

  it('hashShareToken is deterministic and sensitive', () => {
    expect(hashShareToken('nmts_a')).toBe(hashShareToken('nmts_a'));
    expect(hashShareToken('nmts_a')).not.toBe(hashShareToken('nmts_b'));
    expect(hashShareToken('nmts_a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('previewShareToken masks the middle', () => {
    const t = 'nmts_abcdefghij1234567890';
    expect(previewShareToken(t)).toContain('…');
    expect(previewShareToken(t).startsWith('nmts_abc')).toBe(true);
    expect(previewShareToken('short')).toBe('short');
  });
});

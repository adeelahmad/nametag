// Token utilities for the matter-bridge + MCP integrations. Tokens are
// opaque random strings with a `nmt_` prefix; only SHA-256 digests are
// stored server-side. The plaintext is shown once at creation time.

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { AssistantBridgeToken, User } from '@prisma/client';

const PREFIX = 'nmt_';

export function generateToken(): string {
  const raw = crypto.randomBytes(32).toString('base64url');
  return `${PREFIX}${raw}`;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function previewOf(token: string): string {
  if (token.length < 10) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}

// Verify a bearer token and return the owning user + token record, or null.
// On success, updates lastUsedAt (best effort).
export async function verifyBridgeToken(
  token: string,
  requiredScope?: 'mcp' | 'chat',
): Promise<{ user: User; token: AssistantBridgeToken } | null> {
  if (!token.startsWith(PREFIX)) return null;
  const hash = hashToken(token);
  const record = await prisma.assistantBridgeToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  if (requiredScope && record.scope !== '*' && record.scope !== requiredScope)
    return null;

  // best-effort update; ignore contention
  prisma.assistantBridgeToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { user: record.user, token: record };
}

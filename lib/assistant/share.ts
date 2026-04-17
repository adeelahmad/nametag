// Public read-only share links for assistant conversations. Modeled after
// AssistantBridgeToken: plaintext `nmts_<base64url(32B)>` is shown once at
// creation; only the SHA-256 hash is stored in the DB.

import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

export function generateShareToken(): string {
  return `nmts_${randomBytes(32).toString('base64url')}`;
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function previewShareToken(token: string): string {
  if (token.length < 12) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export interface VerifiedShareLink {
  id: string;
  conversationId: string;
  userId: string;
}

export async function verifyShareToken(
  token: string,
): Promise<VerifiedShareLink | null> {
  if (!token || !token.startsWith('nmts_')) return null;
  const hash = hashShareToken(token);
  const link = await prisma.assistantShareLink.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      conversationId: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;

  await prisma.assistantShareLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  return {
    id: link.id,
    conversationId: link.conversationId,
    userId: link.userId,
  };
}

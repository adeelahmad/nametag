// Create / list bridge tokens used by matter-bridge and MCP clients to
// authenticate as the user. Plaintext tokens are only returned once, on
// creation.

import { prisma } from '@/lib/prisma';
import {
  apiResponse,
  handleApiError,
  parseRequestBody,
  withAuth,
} from '@/lib/api-utils';
import {
  generateToken,
  hashToken,
  previewOf,
} from '@/lib/assistant/bridge-auth';

export const GET = withAuth(async (_request, session) => {
  try {
    const tokens = await prisma.assistantBridgeToken.findMany({
      where: { userId: session.user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scope: true,
        tokenPreview: true,
        defaultConversationId: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return apiResponse.ok({ tokens });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/tokens', {
      userId: session.user.id,
    });
  }
});

export const POST = withAuth(async (request, session) => {
  try {
    const body = await parseRequestBody<{
      name: string;
      scope?: 'mcp' | 'chat' | '*';
      defaultConversationId?: string;
      expiresAt?: string;
    }>(request);

    const name = body.name?.trim();
    if (!name) return apiResponse.error('Name is required');

    const plaintext = generateToken();
    const created = await prisma.assistantBridgeToken.create({
      data: {
        userId: session.user.id,
        name: name.slice(0, 80),
        tokenHash: hashToken(plaintext),
        tokenPreview: previewOf(plaintext),
        scope: body.scope ?? '*',
        defaultConversationId: body.defaultConversationId ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: {
        id: true,
        name: true,
        scope: true,
        tokenPreview: true,
        defaultConversationId: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    // Plaintext is returned ONCE here and never again.
    return apiResponse.created({ token: created, plaintext });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/tokens', {
      userId: session.user.id,
    });
  }
});

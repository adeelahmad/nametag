// Mint a share token for a conversation; list existing tokens.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import {
  generateShareToken,
  hashShareToken,
  previewShareToken,
} from '@/lib/assistant/share';

export const GET = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const conv = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!conv) return apiResponse.notFound('Conversation not found');
    const links = await prisma.assistantShareLink.findMany({
      where: { conversationId: id, userId: session.user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenPreview: true,
        createdAt: true,
        expiresAt: true,
        viewCount: true,
        lastViewedAt: true,
      },
    });
    return apiResponse.ok({ links });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/conversations/[id]/share', {
      userId: session.user.id,
    });
  }
});

export const POST = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const conv = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!conv) return apiResponse.notFound('Conversation not found');

    const token = generateShareToken();
    const link = await prisma.assistantShareLink.create({
      data: {
        conversationId: id,
        userId: session.user.id,
        tokenHash: hashShareToken(token),
        tokenPreview: previewShareToken(token),
      },
    });
    return apiResponse.created({
      id: link.id,
      token,
      tokenPreview: link.tokenPreview,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/conversations/[id]/share', {
      userId: session.user.id,
    });
  }
});

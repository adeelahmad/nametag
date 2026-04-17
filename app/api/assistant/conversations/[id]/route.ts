// Read / update / archive a single conversation.

import { prisma } from '@/lib/prisma';
import {
  apiResponse,
  handleApiError,
  parseRequestBody,
  withAuth,
} from '@/lib/api-utils';

export const GET = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const conv = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      include: {
        summaries: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!conv) return apiResponse.notFound('Conversation not found');

    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return apiResponse.ok({ conversation: conv, messages });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/conversations/[id]', {
      userId: session.user.id,
    });
  }
});

export const PATCH = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;
    const body = await parseRequestBody<{
      title?: string;
      pinned?: boolean;
      archived?: boolean;
    }>(request);

    const existing = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) return apiResponse.notFound('Conversation not found');

    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim().slice(0, 200);
    if (typeof body.pinned === 'boolean') data.pinned = body.pinned;
    if (typeof body.archived === 'boolean') {
      data.archivedAt = body.archived ? new Date() : null;
    }

    const updated = await prisma.assistantConversation.update({
      where: { id },
      data,
    });
    return apiResponse.ok({ conversation: updated });
  } catch (error) {
    return handleApiError(error, 'PATCH /api/assistant/conversations/[id]', {
      userId: session.user.id,
    });
  }
});

export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const existing = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) return apiResponse.notFound('Conversation not found');
    await prisma.assistantConversation.delete({ where: { id } });
    return apiResponse.success();
  } catch (error) {
    return handleApiError(error, 'DELETE /api/assistant/conversations/[id]', {
      userId: session.user.id,
    });
  }
});

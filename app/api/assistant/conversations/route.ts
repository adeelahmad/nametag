// List / create assistant conversations for the authenticated user.

import { prisma } from '@/lib/prisma';
import {
  apiResponse,
  handleApiError,
  parseRequestBody,
  withAuth,
} from '@/lib/api-utils';
import { createConversation, deriveTitle } from '@/lib/assistant/conversation';

export const GET = withAuth(async (request, session) => {
  try {
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get('includeArchived') === '1';
    const conversations = await prisma.assistantConversation.findMany({
      where: {
        userId: session.user.id,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        preview: true,
        pinned: true,
        archivedAt: true,
        model: true,
        forkedFromId: true,
        messageCount: true,
        tokenCount: true,
        updatedAt: true,
        createdAt: true,
      },
      take: 200,
    });
    return apiResponse.ok({ conversations });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/conversations', {
      userId: session.user.id,
    });
  }
});

export const POST = withAuth(async (request, session) => {
  try {
    const body = await parseRequestBody<{ title?: string; firstMessage?: string }>(request);
    const title =
      body.title?.trim() ||
      (body.firstMessage ? deriveTitle(body.firstMessage) : undefined);
    const conv = await createConversation(session.user.id, { title });
    return apiResponse.created({ conversation: conv });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/conversations', {
      userId: session.user.id,
    });
  }
});

// Aggregated token usage across the authenticated user's conversations.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

export const GET = withAuth(async (_request, session) => {
  try {
    const conversations = await prisma.assistantConversation.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        title: true,
        tokenCount: true,
        messageCount: true,
        updatedAt: true,
      },
      orderBy: { tokenCount: 'desc' },
      take: 50,
    });
    const totals = conversations.reduce(
      (acc, c) => {
        acc.tokens += c.tokenCount;
        acc.messages += c.messageCount;
        acc.conversations += 1;
        return acc;
      },
      { tokens: 0, messages: 0, conversations: 0 },
    );
    return apiResponse.ok({ totals, byConversation: conversations });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/usage', {
      userId: session.user.id,
    });
  }
});

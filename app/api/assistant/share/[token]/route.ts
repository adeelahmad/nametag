// Public (unauthenticated) read-only view of a shared conversation.
// Verifies the token, returns title + messages stripped of tool_call payloads
// to avoid leaking internal tool invocations.

import { prisma } from '@/lib/prisma';
import { apiResponse } from '@/lib/api-utils';
import { verifyShareToken } from '@/lib/assistant/share';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await verifyShareToken(token);
  if (!link) return apiResponse.notFound('Not found');

  const conv = await prisma.assistantConversation.findUnique({
    where: { id: link.conversationId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  if (!conv) return apiResponse.notFound('Not found');

  const rawMessages = await prisma.assistantMessage.findMany({
    where: {
      conversationId: conv.id,
      role: { in: ['USER', 'ASSISTANT'] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });

  return apiResponse.ok({
    conversation: conv,
    messages: rawMessages,
  });
}

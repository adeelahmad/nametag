// Fork a conversation from a specific user message. Clones the history up
// to (not including) the given message, appends an optionally-edited new
// user message, and returns the new conversation id. The caller can then
// POST to /api/assistant/chat to stream the assistant's response.

import {
  apiResponse,
  handleApiError,
  parseRequestBody,
  withAuth,
} from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { appendMessage, deriveTitle } from '@/lib/assistant/conversation';

export const POST = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;
    const body = await parseRequestBody<{
      messageId: string;
      newContent?: string;
    }>(request);

    if (!body.messageId) return apiResponse.error('messageId is required', 400);

    const source = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, title: true, model: true },
    });
    if (!source) return apiResponse.notFound('Conversation not found');

    const anchor = await prisma.assistantMessage.findFirst({
      where: { id: body.messageId, conversationId: id },
      select: { id: true, createdAt: true, role: true, content: true },
    });
    if (!anchor) return apiResponse.notFound('Message not found');
    if (anchor.role !== 'USER') {
      return apiResponse.error('Can only branch from a user message', 400);
    }

    const priorMessages = await prisma.assistantMessage.findMany({
      where: {
        conversationId: id,
        createdAt: { lt: anchor.createdAt },
      },
      orderBy: { createdAt: 'asc' },
    });

    const newContent = body.newContent?.trim() || anchor.content;
    const newConv = await prisma.assistantConversation.create({
      data: {
        userId: session.user.id,
        title: deriveTitle(newContent),
        model: source.model,
        forkedFromId: source.id,
        forkedFromMessageId: anchor.id,
      },
    });

    for (const m of priorMessages) {
      await appendMessage(newConv.id, {
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ?? undefined,
        toolCallId: m.toolCallId ?? undefined,
        promptTokens: m.promptTokens ?? undefined,
        completionTokens: m.completionTokens ?? undefined,
        totalTokens: m.totalTokens ?? undefined,
        model: m.model ?? undefined,
        metadata: { branchedFrom: anchor.id },
      });
    }

    await appendMessage(newConv.id, {
      role: 'USER',
      content: newContent,
      metadata: { branchedFrom: anchor.id },
    });

    return apiResponse.created({ conversationId: newConv.id });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/conversations/[id]/branch', {
      userId: session.user.id,
    });
  }
});

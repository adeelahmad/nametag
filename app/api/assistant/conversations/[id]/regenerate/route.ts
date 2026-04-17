// Regenerate the last assistant reply in a conversation. Deletes the trailing
// ASSISTANT + TOOL messages after the most recent USER message, then replays
// the agent turn streaming SSE events back to the browser.

import { NextResponse } from 'next/server';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/assistant/settings';
import { runAssistantTurn } from '@/lib/assistant/agent';
import type { StreamEvent } from '@/lib/assistant/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;
    const conv = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, model: true },
    });
    if (!conv) return apiResponse.notFound('Conversation not found');

    const settings = await getOrCreateSettings(session.user.id);
    if (!settings.apiKeyEncrypted) {
      return apiResponse.error(
        'No LLM API key configured. Add one in Settings → Assistant.',
        400,
      );
    }

    // Find the most recent USER message and drop everything after it.
    const lastUser = await prisma.assistantMessage.findFirst({
      where: { conversationId: id, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (!lastUser) return apiResponse.error('Nothing to regenerate', 400);

    const removed = await prisma.assistantMessage.deleteMany({
      where: {
        conversationId: id,
        createdAt: { gt: lastUser.createdAt },
      },
    });
    if (removed.count > 0) {
      await prisma.assistantConversation.update({
        where: { id },
        data: {
          messageCount: { decrement: removed.count },
          updatedAt: new Date(),
        },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: StreamEvent | { type: 'open'; conversationId: string }) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(ev)}\n\n`),
          );
        };
        send({ type: 'open', conversationId: id });
        try {
          await runAssistantTurn({
            userId: session.user.id,
            conversationId: id,
            settings,
            modelOverride: conv.model,
            signal: request.signal,
            onEvent: send,
          });
          send({ type: 'done', conversationId: id });
        } catch (err) {
          send({
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/conversations/[id]/regenerate', {
      userId: session.user.id,
    });
  }
});

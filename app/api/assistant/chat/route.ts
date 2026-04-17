// Streaming chat endpoint. Accepts a user message, appends it to the
// conversation, kicks off the agentic loop, and streams SSE events back to
// the browser (or any SSE-aware client).

import { NextResponse } from 'next/server';
import { apiResponse, handleApiError, parseRequestBody, withAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/assistant/settings';
import { runAssistantTurn } from '@/lib/assistant/agent';
import {
  appendMessage,
  createConversation,
  deriveTitle,
  setTitle,
} from '@/lib/assistant/conversation';
import type { StreamEvent } from '@/lib/assistant/types';

export const runtime = 'nodejs';
// Long-running stream; let it run up to 5 minutes on platforms that enforce
// per-request limits (Vercel, Cloudflare). Self-hosted Node ignores this.
export const maxDuration = 300;

export const POST = withAuth(async (request, session) => {
  try {
    const body = await parseRequestBody<{
      conversationId?: string;
      message: string;
    }>(request);

    const message = body.message?.trim();
    if (!message) return apiResponse.error('Empty message');

    const settings = await getOrCreateSettings(session.user.id);
    if (!settings.apiKeyEncrypted) {
      return apiResponse.error(
        'No LLM API key configured. Add one in Settings → Assistant.',
        400,
      );
    }

    // Resolve or create the conversation.
    let conversationId = body.conversationId;
    let isNew = false;
    if (conversationId) {
      const existing = await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: session.user.id },
        select: { id: true, messageCount: true, title: true },
      });
      if (!existing) return apiResponse.notFound('Conversation not found');
    } else {
      const conv = await createConversation(session.user.id, {
        title: deriveTitle(message),
      });
      conversationId = conv.id;
      isNew = true;
    }

    // Store the user's message before starting generation so it appears in
    // history even if the stream is interrupted.
    await appendMessage(conversationId, { role: 'USER', content: message });

    if (!isNew) {
      // Opportunistically upgrade the title on first real user turn.
      const conv = await prisma.assistantConversation.findUnique({
        where: { id: conversationId },
        select: { title: true, messageCount: true },
      });
      if (
        conv &&
        (conv.title === 'New conversation' || !conv.title) &&
        conv.messageCount <= 2
      ) {
        await setTitle(conversationId, deriveTitle(message));
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: StreamEvent | { type: 'open'; conversationId: string }) => {
          const chunk = `data: ${JSON.stringify(ev)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        send({ type: 'open', conversationId: conversationId! });

        try {
          await runAssistantTurn({
            userId: session.user.id,
            conversationId: conversationId!,
            settings,
            signal: request.signal,
            onEvent: send,
          });
          send({ type: 'done', conversationId: conversationId! });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: 'error', error: message });
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Client disconnected; Node will GC the in-flight fetch to the LLM.
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
    return handleApiError(error, 'POST /api/assistant/chat', {
      userId: session.user.id,
    });
  }
});

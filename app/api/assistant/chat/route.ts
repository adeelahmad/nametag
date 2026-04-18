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
      attachmentIds?: string[];
    }>(request);

    const message = body.message?.trim() ?? '';
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (!message && attachmentIds.length === 0) return apiResponse.error('Empty message');

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
    let modelOverride: string | null = null;
    if (conversationId) {
      const existing = await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: session.user.id },
        select: { id: true, messageCount: true, title: true, model: true },
      });
      if (!existing) return apiResponse.notFound('Conversation not found');
      modelOverride = existing.model;
    } else {
      const conv = await createConversation(session.user.id, {
        title: deriveTitle(message),
      });
      conversationId = conv.id;
      isNew = true;
    }

    // Resolve attachments: load extracted text and attach metadata. Only the
    // user's own attachments are honored.
    let finalContent = message;
    const attachmentMeta: Array<{
      id: string;
      kind: string;
      filename: string;
      mimeType: string;
    }> = [];
    if (attachmentIds.length > 0) {
      const found = await prisma.assistantAttachment.findMany({
        where: {
          id: { in: attachmentIds },
          userId: session.user.id,
          deletedAt: null,
        },
      });
      for (const att of found) {
        attachmentMeta.push({
          id: att.id,
          kind: att.kind,
          filename: att.filename,
          mimeType: att.mimeType,
        });
        if (att.extractedText) {
          const snippet = att.extractedText.slice(0, 20_000);
          finalContent += `\n\n--- attachment: ${att.filename} (${att.kind}) ---\n${snippet}`;
        } else if (att.kind === 'IMAGE') {
          finalContent += `\n\n[Attached image: ${att.filename}]`;
        }
      }
      // Rebind attachments that were uploaded before the conversation existed.
      await prisma.assistantAttachment.updateMany({
        where: {
          id: { in: found.map((a) => a.id) },
          userId: session.user.id,
          conversationId: null,
        },
        data: { conversationId },
      });
    }

    // Store the user's message before starting generation so it appears in
    // history even if the stream is interrupted.
    await appendMessage(conversationId, {
      role: 'USER',
      content: finalContent,
      metadata: attachmentMeta.length > 0 ? { attachments: attachmentMeta } : undefined,
    });

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
            modelOverride,
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

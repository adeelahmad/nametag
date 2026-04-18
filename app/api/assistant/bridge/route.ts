// Matter-bridge / generic webhook endpoint. Authenticated with a bridge
// token (Authorization: Bearer nmt_...). Delivers a message to the assistant
// on behalf of the owning user and returns the textual response so the
// bridge can post it back to Slack, Matrix, Telegram, XMPP, Discord, etc.
//
// This endpoint is also reused by matterbridge's webhook transport: set
// Inbound+Outbound to this URL with the bearer token in the header.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, parseRequestBody } from '@/lib/api-utils';
import { extractBearer, verifyBridgeToken } from '@/lib/assistant/bridge-auth';
import {
  appendMessage,
  createConversation,
  deriveTitle,
} from '@/lib/assistant/conversation';
import { runAssistantTurnToString } from '@/lib/assistant/agent';
import { getOrCreateSettings } from '@/lib/assistant/settings';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    const bearer = extractBearer(request);
    if (!bearer) return apiResponse.unauthorized('Missing bearer token');

    const authed = await verifyBridgeToken(bearer, 'chat');
    if (!authed) return apiResponse.unauthorized('Invalid token');

    const body = await parseRequestBody<{
      text?: string;
      message?: string;
      // matterbridge canonical fields
      username?: string;
      channel?: string;
      // Optional explicit conversation id; otherwise we derive one per
      // channel+user so each chat gets its own history.
      conversationId?: string;
      gateway?: string;
    }>(request);

    const message = (body.text ?? body.message ?? '').trim();
    if (!message) return apiResponse.error('Empty message');

    const settings = await getOrCreateSettings(authed.user.id);
    if (!settings.apiKeyEncrypted)
      return apiResponse.error('No LLM API key configured for this user.', 400);

    // Resolve conversation: explicit > per-bridgeKey > default > new.
    const bridgeKey =
      body.conversationId
        ? undefined
        : [
            body.gateway ?? 'bridge',
            body.channel ?? 'dm',
            body.username ?? 'unknown',
          ].join(':');

    let conversationId = body.conversationId;
    if (!conversationId && authed.token.defaultConversationId) {
      const def = await prisma.assistantConversation.findFirst({
        where: {
          id: authed.token.defaultConversationId,
          userId: authed.user.id,
        },
        select: { id: true },
      });
      if (def) conversationId = def.id;
    }
    if (!conversationId && bridgeKey) {
      const existing = await prisma.assistantConversation.findFirst({
        where: { userId: authed.user.id, bridgeKey },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (existing) conversationId = existing.id;
    }
    if (!conversationId) {
      const conv = await createConversation(authed.user.id, {
        title: deriveTitle(message),
        origin: 'matterbridge',
        bridgeKey,
      });
      conversationId = conv.id;
    } else {
      // Make sure it still belongs to the user.
      const owns = await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId: authed.user.id },
        select: { id: true },
      });
      if (!owns) return apiResponse.forbidden('Conversation not owned by token user');
    }

    await appendMessage(conversationId, { role: 'USER', content: message });

    const { text, error } = await runAssistantTurnToString({
      userId: authed.user.id,
      conversationId,
      settings,
    });

    if (error) return apiResponse.error(error, 500);

    return NextResponse.json({
      conversationId,
      text,
      username: 'Nametag Assistant',
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/bridge');
  }
}

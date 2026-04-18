// Export a conversation as Markdown or JSON.

import { prisma } from '@/lib/prisma';
import { handleApiError, withAuth, apiResponse } from '@/lib/api-utils';
import {
  exportAsJSON,
  exportAsMarkdown,
  type ExportFormat,
} from '@/lib/assistant/transcripts';

export const GET = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const format: ExportFormat = url.searchParams.get('format') === 'json' ? 'json' : 'markdown';

    const conv = await prisma.assistantConversation.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, title: true, createdAt: true },
    });
    if (!conv) return apiResponse.notFound('Conversation not found');

    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    const body =
      format === 'json' ? exportAsJSON(conv, messages) : exportAsMarkdown(conv, messages);
    const ext = format === 'json' ? 'json' : 'md';
    const safeTitle =
      conv.title.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'conversation';
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type':
          format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.${ext}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/conversations/[id]/export', {
      userId: session.user.id,
    });
  }
});

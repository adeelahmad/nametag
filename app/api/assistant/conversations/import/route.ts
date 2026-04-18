// Import a Markdown or JSON transcript into a new conversation.

import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import {
  appendMessage,
  createConversation,
  deriveTitle,
} from '@/lib/assistant/conversation';
import {
  MAX_IMPORT_BYTES,
  TranscriptParseError,
  parseTranscript,
  type ExportFormat,
} from '@/lib/assistant/transcripts';

export const runtime = 'nodejs';

export const POST = withAuth(async (request, session) => {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let text = '';
    let format: ExportFormat | undefined;
    let titleHint: string | undefined;

    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      const fmt = form.get('format');
      const title = form.get('title');
      if (file instanceof File) {
        if (file.size > MAX_IMPORT_BYTES) {
          return apiResponse.error('File exceeds 1 MiB cap', 400);
        }
        text = await file.text();
      } else if (typeof form.get('text') === 'string') {
        text = form.get('text') as string;
      }
      if (typeof fmt === 'string' && (fmt === 'markdown' || fmt === 'json')) {
        format = fmt;
      }
      if (typeof title === 'string') titleHint = title;
    } else {
      const body = (await request.json()) as {
        text?: string;
        format?: ExportFormat;
        title?: string;
      };
      text = body.text ?? '';
      format = body.format;
      titleHint = body.title;
    }

    if (!text || !text.trim()) {
      return apiResponse.error('Empty transcript', 400);
    }
    if (text.length > MAX_IMPORT_BYTES) {
      return apiResponse.error('Transcript exceeds 1 MiB cap', 400);
    }

    let parsed;
    try {
      parsed = parseTranscript(text, format);
    } catch (err) {
      if (err instanceof TranscriptParseError) {
        return apiResponse.error(err.message, 400);
      }
      throw err;
    }
    if (parsed.messages.length === 0) {
      return apiResponse.error('Transcript had no recognizable messages', 400);
    }

    const firstUser = parsed.messages.find((m) => m.role === 'USER');
    const title =
      titleHint?.trim() ||
      parsed.title ||
      (firstUser ? deriveTitle(firstUser.content) : 'Imported conversation');

    const conv = await createConversation(session.user.id, { title });

    for (const m of parsed.messages) {
      await appendMessage(conv.id, {
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        metadata: { imported: true },
      });
    }

    await prisma.assistantConversation.update({
      where: { id: conv.id },
      data: { preview: firstUser?.content.slice(0, 160) ?? null },
    });

    return apiResponse.created({ conversationId: conv.id });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/conversations/import', {
      userId: session.user.id,
    });
  }
});

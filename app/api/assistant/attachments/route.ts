// Upload an attachment (image/PDF/text). Returns {id, kind, extractedSnippet}.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { AttachmentError, saveAttachment } from '@/lib/assistant/attachments';
import { getOrCreateSettings } from '@/lib/assistant/settings';

export const runtime = 'nodejs';

export const POST = withAuth(async (request, session) => {
  try {
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return apiResponse.error('multipart/form-data required', 400);
    }
    const form = await request.formData();
    const file = form.get('file');
    const conversationId = form.get('conversationId');
    if (!(file instanceof File)) {
      return apiResponse.error('`file` is required', 400);
    }

    const settings = await getOrCreateSettings(session.user.id);
    const bytes = Buffer.from(await file.arrayBuffer());

    let saved;
    try {
      saved = await saveAttachment({
        userId: session.user.id,
        conversationId: typeof conversationId === 'string' ? conversationId : undefined,
        filename: file.name || 'attachment',
        mimeType: file.type || 'application/octet-stream',
        bytes,
        maxBytes: settings.attachmentsMaxBytes,
      });
    } catch (err) {
      if (err instanceof AttachmentError) return apiResponse.error(err.message, 400);
      throw err;
    }

    return apiResponse.created({
      attachment: {
        id: saved.id,
        kind: saved.kind,
        filename: saved.filename,
        byteSize: saved.byteSize,
        mimeType: saved.mimeType,
        extractedSnippet: saved.extractedText?.slice(0, 400) ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/assistant/attachments', {
      userId: session.user.id,
    });
  }
});

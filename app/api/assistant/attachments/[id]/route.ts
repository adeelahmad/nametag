// Soft-delete an attachment.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { softDeleteAttachment } from '@/lib/assistant/attachments';

export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const att = await softDeleteAttachment(session.user.id, id);
    if (!att) return apiResponse.notFound('Attachment not found');
    return apiResponse.success();
  } catch (error) {
    return handleApiError(error, 'DELETE /api/assistant/attachments/[id]', {
      userId: session.user.id,
    });
  }
});

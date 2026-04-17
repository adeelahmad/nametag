// Revoke a share link.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id, linkId } = await context.params;
    const link = await prisma.assistantShareLink.findFirst({
      where: { id: linkId, conversationId: id, userId: session.user.id },
      select: { id: true },
    });
    if (!link) return apiResponse.notFound('Share link not found');
    await prisma.assistantShareLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
    return apiResponse.success();
  } catch (error) {
    return handleApiError(error, 'DELETE /api/assistant/conversations/[id]/share/[linkId]', {
      userId: session.user.id,
    });
  }
});

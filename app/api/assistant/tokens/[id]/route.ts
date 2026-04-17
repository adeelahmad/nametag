// Revoke a bridge token.

import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';

export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const existing = await prisma.assistantBridgeToken.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) return apiResponse.notFound('Token not found');
    await prisma.assistantBridgeToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return apiResponse.success();
  } catch (error) {
    return handleApiError(error, 'DELETE /api/assistant/tokens/[id]', {
      userId: session.user.id,
    });
  }
});

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { getUnreadCount } from '@/lib/notifications';

// GET /api/notifications/unread-count - Return the unread notification count
export const GET = withAuth(async (_request, session) => {
  try {
    const count = await getUnreadCount(session.user.id);
    return apiResponse.ok({ count });
  } catch (error) {
    return handleApiError(error, 'notifications-unread-count');
  }
});

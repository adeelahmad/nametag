import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { markAllAsRead } from '@/lib/notifications';

// POST /api/notifications/mark-all-read - Mark all of the user's notifications as read
export const POST = withAuth(async (_request, session) => {
  try {
    const count = await markAllAsRead(session.user.id);
    return apiResponse.ok({ count });
  } catch (error) {
    return handleApiError(error, 'notifications-mark-all-read');
  }
});

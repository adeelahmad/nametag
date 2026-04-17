import { apiResponse, handleApiError, parseRequestBody, withAuth } from '@/lib/api-utils';
import { deleteNotification, markAsRead } from '@/lib/notifications';

// PATCH /api/notifications/[id] - Mark a single notification as read
export const PATCH = withAuth(async (request, session, context) => {
  try {
    const { id } = await context.params;
    const body = await parseRequestBody<{ read?: boolean }>(request).catch(() => ({ read: true }));
    const markRead = body?.read !== false;

    if (!markRead) {
      return apiResponse.error('Unread transition is not supported');
    }

    const notification = await markAsRead(session.user.id, id);
    if (!notification) {
      return apiResponse.notFound('Notification not found');
    }
    return apiResponse.ok({ notification });
  } catch (error) {
    return handleApiError(error, 'notifications-update');
  }
});

// DELETE /api/notifications/[id] - Delete a notification
export const DELETE = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;
    const deleted = await deleteNotification(session.user.id, id);
    if (!deleted) {
      return apiResponse.notFound('Notification not found');
    }
    return apiResponse.success();
  } catch (error) {
    return handleApiError(error, 'notifications-delete');
  }
});

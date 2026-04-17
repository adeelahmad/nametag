import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { listNotifications } from '@/lib/notifications';

// GET /api/notifications - List notifications for the current user
export const GET = withAuth(async (request, session) => {
  try {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const pageParam = Number(url.searchParams.get('page'));
    const pageSizeParam = Number(url.searchParams.get('pageSize'));

    const result = await listNotifications(session.user.id, {
      unreadOnly,
      page: Number.isFinite(pageParam) && pageParam > 0 ? pageParam : undefined,
      pageSize: Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : undefined,
    });

    return apiResponse.ok({
      notifications: result.notifications,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    return handleApiError(error, 'notifications-list');
  }
});

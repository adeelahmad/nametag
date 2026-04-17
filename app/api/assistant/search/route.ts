// Search the authenticated user's conversations by title + message content.

import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { searchConversations } from '@/lib/assistant/search';

export const GET = withAuth(async (request, session) => {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) return apiResponse.ok({ results: [] });
    const results = await searchConversations(session.user.id, q);
    return apiResponse.ok({ results });
  } catch (error) {
    return handleApiError(error, 'GET /api/assistant/search', {
      userId: session.user.id,
    });
  }
});

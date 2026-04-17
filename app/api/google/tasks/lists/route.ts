import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError, withLogging } from '@/lib/api-utils';
import { listUserTaskLists } from '@/lib/google/tasks';

// GET /api/google/tasks/lists - List the user's Google Task lists (picker UI)
export const GET = withLogging(async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lists = await listUserTaskLists(session.user.id);
    return NextResponse.json({ success: true, data: lists });
  } catch (error) {
    return handleApiError(error, 'google-tasks-lists');
  }
});

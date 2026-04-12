import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError, withLogging } from '@/lib/api-utils';
import { listUserCalendars, syncBirthdaysToCalendar } from '@/lib/google/calendar';

// GET /api/google/calendar - List user's Google Calendars (for picker UI)
export const GET = withLogging(async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const calendars = await listUserCalendars(session.user.id);
    return NextResponse.json({ success: true, data: calendars });
  } catch (error) {
    return handleApiError(error, 'google-calendar-list');
  }
});

// POST /api/google/calendar - Trigger birthday calendar sync
export const POST = withLogging(async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncBirthdaysToCalendar(session.user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, 'google-calendar-sync');
  }
});

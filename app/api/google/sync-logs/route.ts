import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, withLogging } from '@/lib/api-utils';

// GET /api/google/sync-logs - List sync history for current user
export const GET = withLogging(async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const integration = await prisma.googleIntegration.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!integration) {
      return NextResponse.json({ success: true, data: [] });
    }

    const logs = await prisma.syncLog.findMany({
      where: { integrationId: integration.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    return handleApiError(error, 'google-sync-logs');
  }
});

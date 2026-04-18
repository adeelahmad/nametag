import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { handleApiError, withLogging } from '@/lib/api-utils';
import { syncGoogleContactsForUser } from '@/lib/google/contacts';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('google-contacts-sync-api');

// POST /api/google/contacts/sync - Manually trigger Google Contacts sync
export const POST = withLogging(async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const integration = await prisma.googleIntegration.findUnique({
      where: { userId: session.user.id },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'No Google integration found. Connect Google first.' },
        { status: 404 },
      );
    }

    if (!integration.contactsSyncEnabled) {
      return NextResponse.json(
        { error: 'Contacts sync is not enabled for this integration.' },
        { status: 400 },
      );
    }

    if (integration.syncInProgress) {
      return NextResponse.json(
        {
          error:
            'A sync is already in progress. Please wait for it to complete.',
        },
        { status: 409 },
      );
    }

    await prisma.googleIntegration.update({
      where: { id: integration.id },
      data: { syncInProgress: true, syncStartedAt: new Date() },
    });

    try {
      log.info(
        { userId: session.user.id },
        'Starting manual Google Contacts sync',
      );
      const result = await syncGoogleContactsForUser(session.user.id);

      await prisma.googleIntegration.update({
        where: { id: integration.id },
        data: {
          syncInProgress: false,
          lastError: result.errors.length > 0 ? result.errors.join('; ') : null,
          lastErrorAt: result.errors.length > 0 ? new Date() : null,
        },
      });

      return NextResponse.json({ success: true, data: result });
    } catch (syncError) {
      const errorMessage =
        syncError instanceof Error ? syncError.message : String(syncError);
      await prisma.googleIntegration.update({
        where: { id: integration.id },
        data: {
          syncInProgress: false,
          lastError: errorMessage,
          lastErrorAt: new Date(),
        },
      });
      throw syncError;
    }
  } catch (error) {
    return handleApiError(error, 'google-contacts-sync-post');
  }
});

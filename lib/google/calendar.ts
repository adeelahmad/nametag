import { calendar as createCalendar, calendar_v3 } from '@googleapis/calendar';
import { prisma } from '@/lib/prisma';
import { getGoogleAuth } from './auth';
import { createModuleLogger } from '@/lib/logger';
import { formatFullName } from '@/lib/nameUtils';

const log = createModuleLogger('google-calendar');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarSyncResult {
  synced: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// syncBirthdaysToCalendar
// ---------------------------------------------------------------------------

/**
 * Main sync function: pushes birthdays, anniversaries, and namedays from
 * the user's Nametag CRM contacts into a dedicated Google Calendar.
 *
 * Each important date becomes a recurring all-day event so it shows up
 * every year. Events are de-duplicated via extendedProperties so running
 * the sync multiple times is safe.
 */
export async function syncBirthdaysToCalendar(userId: string): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = { synced: 0, errors: [] };

  // 1. Verify integration & calendar sync enabled
  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    throw new Error(`No Google integration found for user ${userId}`);
  }

  if (!integration.calendarSyncEnabled) {
    log.info({ userId }, 'Calendar sync is not enabled, skipping');
    return result;
  }

  // 2. Authenticate and create calendar client
  const { auth } = await getGoogleAuth(userId);
  const cal = createCalendar({ version: 'v3', auth });

  // 3. Ensure dedicated birthday calendar exists
  const calendarId = await ensureBirthdayCalendar(cal, {
    id: integration.id,
    birthdayCalendarId: integration.birthdayCalendarId,
  });

  // 4. Fetch important dates for non-deleted persons belonging to this user
  const importantDates = await prisma.importantDate.findMany({
    where: {
      person: {
        userId,
        deletedAt: null,
      },
      type: { in: ['birthday', 'anniversary', 'nameday'] },
      deletedAt: null,
    },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          surname: true,
          middleName: true,
          secondLastName: true,
          nickname: true,
        },
      },
    },
  });

  log.info(
    { userId, totalDates: importantDates.length },
    'Starting calendar sync for important dates',
  );

  // 5. Create or update an event for each date (errors are isolated per-event)
  for (const importantDate of importantDates) {
    try {
      const personName = formatFullName(importantDate.person);
      await createOrUpdateBirthdayEvent(cal, calendarId, {
        id: importantDate.id,
        title: importantDate.title,
        type: importantDate.type,
        date: importantDate.date,
      }, personName);
      result.synced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(
        { userId, importantDateId: importantDate.id, error: message },
        'Failed to sync event to calendar',
      );
      result.errors.push(`Failed to sync date ${importantDate.id}: ${message}`);
    }
  }

  // 6. Update last sync timestamp
  await prisma.googleIntegration.update({
    where: { id: integration.id },
    data: { lastCalendarSyncAt: new Date() },
  });

  log.info(
    { userId, synced: result.synced, errors: result.errors.length },
    'Calendar sync completed',
  );

  return result;
}

// ---------------------------------------------------------------------------
// ensureBirthdayCalendar
// ---------------------------------------------------------------------------

/**
 * Ensures that a dedicated "Nametag Birthdays" calendar exists in the
 * user's Google account. If the stored calendar ID is stale (calendar was
 * deleted externally), a new one is created.
 *
 * The resolved calendar ID is persisted back to the GoogleIntegration
 * record so subsequent syncs skip the lookup.
 */
export async function ensureBirthdayCalendar(
  cal: calendar_v3.Calendar,
  integration: { id: string; birthdayCalendarId: string | null },
): Promise<string> {
  const CALENDAR_NAME = 'Nametag Birthdays';

  // 1. If we already have a stored calendar ID, verify it still exists
  if (integration.birthdayCalendarId) {
    try {
      await cal.calendars.get({ calendarId: integration.birthdayCalendarId });
      log.debug({ calendarId: integration.birthdayCalendarId }, 'Birthday calendar verified');
      return integration.birthdayCalendarId;
    } catch {
      log.warn(
        { calendarId: integration.birthdayCalendarId },
        'Stored birthday calendar not found, will search or create',
      );
    }
  }

  // 2. Search the user's calendar list for one named "Nametag Birthdays"
  try {
    const listResponse = await cal.calendarList.list();
    const existing = listResponse.data.items?.find(
      (item) => item.summary === CALENDAR_NAME,
    );

    if (existing?.id) {
      log.info({ calendarId: existing.id }, 'Found existing Nametag Birthdays calendar');
      await prisma.googleIntegration.update({
        where: { id: integration.id },
        data: { birthdayCalendarId: existing.id },
      });
      return existing.id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ error: message }, 'Failed to list calendars, will attempt to create');
  }

  // 3. Create a new calendar
  log.info('Creating new Nametag Birthdays calendar');
  const createResponse = await cal.calendars.insert({
    requestBody: {
      summary: CALENDAR_NAME,
      description: 'Birthdays and important dates from Nametag CRM',
    },
  });

  const newCalendarId = createResponse.data.id;
  if (!newCalendarId) {
    throw new Error('Google Calendar API returned no calendar ID after creation');
  }

  await prisma.googleIntegration.update({
    where: { id: integration.id },
    data: { birthdayCalendarId: newCalendarId },
  });

  log.info({ calendarId: newCalendarId }, 'Created new Nametag Birthdays calendar');
  return newCalendarId;
}

// ---------------------------------------------------------------------------
// listUserCalendars
// ---------------------------------------------------------------------------

/**
 * Lists the calendars available in the user's Google account.
 * Used by the UI to let users choose which calendar to sync to.
 */
export async function listUserCalendars(
  userId: string,
): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const { auth } = await getGoogleAuth(userId);
  const cal = createCalendar({ version: 'v3', auth });

  const response = await cal.calendarList.list();
  const items = response.data.items || [];

  return items
    .filter((item): item is calendar_v3.Schema$CalendarListEntry & { id: string } => !!item.id)
    .map((item) => ({
      id: item.id,
      summary: item.summary || '(Untitled)',
      primary: item.primary === true,
    }));
}

// ---------------------------------------------------------------------------
// createOrUpdateBirthdayEvent
// ---------------------------------------------------------------------------

/**
 * Creates or updates a single recurring all-day birthday/anniversary event
 * in the specified Google Calendar.
 *
 * De-duplication is handled via the `nametagDateId` private extended
 * property: if an event with the same nametag date ID already exists it is
 * updated in place (to reflect name or date changes).
 */
export async function createOrUpdateBirthdayEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  importantDate: { id: string; title: string; type: string | null; date: Date },
  personName: string,
): Promise<string> {
  const summary = `${personName}'s ${importantDate.title}`;

  // Format the date as YYYY-MM-DD for an all-day event
  const eventDate = importantDate.date;
  const startDate = formatDateString(eventDate);
  const endDate = formatDateString(new Date(eventDate.getTime() + 86_400_000)); // +1 day

  const eventBody: calendar_v3.Schema$Event = {
    summary,
    start: { date: startDate },
    end: { date: endDate },
    recurrence: ['RRULE:FREQ=YEARLY'],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 },    // 1 day before
        { method: 'email', minutes: 7 * 24 * 60 }, // 1 week before
      ],
    },
    extendedProperties: {
      private: {
        nametagDateId: importantDate.id,
      },
    },
  };

  // Search for an existing event with the same nametagDateId
  const existingEventId = await findEventByNametagDateId(cal, calendarId, importantDate.id);

  if (existingEventId) {
    log.debug(
      { calendarId, eventId: existingEventId, nametagDateId: importantDate.id },
      'Updating existing calendar event',
    );
    const updateResponse = await cal.events.update({
      calendarId,
      eventId: existingEventId,
      requestBody: eventBody,
    });
    return updateResponse.data.id!;
  }

  log.debug(
    { calendarId, nametagDateId: importantDate.id, summary },
    'Creating new calendar event',
  );
  const insertResponse = await cal.events.insert({
    calendarId,
    requestBody: eventBody,
  });
  return insertResponse.data.id!;
}

// ---------------------------------------------------------------------------
// deleteBirthdayEvent
// ---------------------------------------------------------------------------

/**
 * Removes a birthday/anniversary event from Google Calendar by its
 * Nametag date ID. No-ops silently if the event does not exist.
 */
export async function deleteBirthdayEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  nametagDateId: string,
): Promise<void> {
  const eventId = await findEventByNametagDateId(cal, calendarId, nametagDateId);

  if (!eventId) {
    log.debug({ calendarId, nametagDateId }, 'No event found to delete');
    return;
  }

  log.info({ calendarId, eventId, nametagDateId }, 'Deleting calendar event');
  await cal.events.delete({ calendarId, eventId });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Searches for a calendar event that has the given `nametagDateId` in its
 * private extended properties. Returns the event ID if found, null otherwise.
 */
async function findEventByNametagDateId(
  cal: calendar_v3.Calendar,
  calendarId: string,
  nametagDateId: string,
): Promise<string | null> {
  try {
    const response = await cal.events.list({
      calendarId,
      privateExtendedProperty: [`nametagDateId=${nametagDateId}`],
      maxResults: 1,
    });

    const items = (response as { data: { items?: Array<{ id?: string }> } }).data.items;
    if (items && items.length > 0 && items[0].id) {
      return items[0].id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { calendarId, nametagDateId, error: message },
      'Failed to search for existing event',
    );
  }

  return null;
}

/**
 * Formats a Date object as a YYYY-MM-DD string (no timezone offset).
 * Uses UTC methods so the date doesn't shift across timezones.
 */
function formatDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

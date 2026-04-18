import { prisma } from '@/lib/prisma';
import { getGoogleAuth } from './auth';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('google-contacts');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactsSyncResult {
  fetched: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

interface PeopleName {
  givenName?: string;
  familyName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
  displayName?: string;
}

interface PeopleEmail {
  value?: string;
  type?: string;
}

interface PeoplePhone {
  value?: string;
  type?: string;
}

interface PeopleOrganization {
  name?: string;
  title?: string;
}

interface PeoplePhoto {
  url?: string;
  default?: boolean;
}

interface PeopleMetadata {
  deleted?: boolean;
}

interface PeopleConnection {
  resourceName: string;
  etag?: string;
  metadata?: PeopleMetadata;
  names?: PeopleName[];
  emailAddresses?: PeopleEmail[];
  phoneNumbers?: PeoplePhone[];
  organizations?: PeopleOrganization[];
  photos?: PeoplePhoto[];
}

interface ConnectionsResponse {
  connections?: PeopleConnection[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

const PERSON_FIELDS = [
  'names',
  'emailAddresses',
  'phoneNumbers',
  'organizations',
  'photos',
  'metadata',
].join(',');

const UID_PREFIX = 'google:';

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Sync the user's Google Contacts via the People API. Uses the same unified
 * auth client as Gmail/Drive/Calendar (OAuth or service-account DWD).
 *
 * - First run: full sync, stores a `nextSyncToken` for later runs.
 * - Subsequent runs: incremental using the stored `syncToken`.
 * - On token expiry (410 Gone), automatically falls back to full sync.
 */
export async function syncGoogleContactsForUser(
  userId: string,
): Promise<ContactsSyncResult> {
  log.info({ userId }, 'Starting Google Contacts sync');

  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    return emptyResult(['No Google integration configured']);
  }
  if (!integration.contactsSyncEnabled) {
    return emptyResult(['Contacts sync is disabled']);
  }

  const { auth } = await getGoogleAuth(userId);
  const tokenResponse = await auth.getAccessToken();
  const accessToken =
    typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

  if (!accessToken) {
    return emptyResult(['Unable to obtain access token for Google Contacts']);
  }

  const result: ContactsSyncResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  try {
    const { connections, nextSyncToken } = await fetchAllConnections(
      accessToken,
      integration.contactsSyncToken,
    );

    result.fetched = connections.length;

    for (const conn of connections) {
      try {
        const outcome = await upsertPerson(userId, conn);
        if (outcome === 'created') result.created++;
        else if (outcome === 'updated') result.updated++;
        else if (outcome === 'deleted') result.deleted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(
          { userId, resourceName: conn.resourceName, err },
          'Failed to upsert contact',
        );
        result.errors.push(`Failed ${conn.resourceName}: ${msg}`);
      }
    }

    await prisma.googleIntegration.update({
      where: { id: integration.id },
      data: {
        contactsSyncToken: nextSyncToken ?? integration.contactsSyncToken,
        lastContactsSyncAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      },
    });

    log.info({ userId, ...result }, 'Google Contacts sync completed');
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ userId, err }, 'Google Contacts sync failed');

    await prisma.googleIntegration
      .update({
        where: { id: integration.id },
        data: {
          lastError: `Contacts sync failed: ${msg}`,
          lastErrorAt: new Date(),
        },
      })
      .catch(() => {
        /* swallow */
      });

    result.errors.push(msg);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Fetch all connections (paginated)
// ---------------------------------------------------------------------------

async function fetchAllConnections(
  accessToken: string,
  syncToken: string | null,
): Promise<{ connections: PeopleConnection[]; nextSyncToken: string | null }> {
  const all: PeopleConnection[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let currentSyncToken = syncToken;

  // Loop pages; handle syncToken expiry (HTTP 410) with a one-time full retry.
  let retriedOnTokenExpiry = false;

  do {
    const url = new URL(
      'https://people.googleapis.com/v1/people/me/connections',
    );
    url.searchParams.set('personFields', PERSON_FIELDS);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    if (currentSyncToken) {
      url.searchParams.set('syncToken', currentSyncToken);
    } else {
      url.searchParams.set('requestSyncToken', 'true');
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 410 && !retriedOnTokenExpiry) {
      log.warn(
        'People API sync token expired (410) — falling back to full sync',
      );
      retriedOnTokenExpiry = true;
      currentSyncToken = null;
      pageToken = undefined;
      all.length = 0;
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`People API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as ConnectionsResponse;
    if (data.connections) all.push(...data.connections);

    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { connections: all, nextSyncToken };
}

// ---------------------------------------------------------------------------
// Upsert a single Person from a People connection
// ---------------------------------------------------------------------------

async function upsertPerson(
  userId: string,
  conn: PeopleConnection,
): Promise<'created' | 'updated' | 'deleted' | 'skipped'> {
  const uid = `${UID_PREFIX}${conn.resourceName}`;

  // Handle deletion (incremental sync returns tombstones with metadata.deleted=true)
  if (conn.metadata?.deleted) {
    const existing = await prisma.person.findFirst({
      where: { userId, uid, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return 'skipped';
    await prisma.person.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    return 'deleted';
  }

  const primaryName = conn.names?.[0];
  const name =
    primaryName?.givenName?.trim() || primaryName?.displayName?.trim() || '';
  // Skip records with no usable name — People API returns empty stubs for some groups.
  if (!name) return 'skipped';

  const organization = conn.organizations?.[0];
  const photo =
    conn.photos?.find((p) => !p.default)?.url || conn.photos?.[0]?.url;

  const baseData = {
    name,
    surname: primaryName?.familyName?.trim() || null,
    middleName: primaryName?.middleName?.trim() || null,
    prefix: primaryName?.honorificPrefix?.trim() || null,
    suffix: primaryName?.honorificSuffix?.trim() || null,
    organization: organization?.name?.trim() || null,
    jobTitle: organization?.title?.trim() || null,
    photo: photo || null,
  };

  const existing = await prisma.person.findFirst({
    where: { userId, uid, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.person.update({ where: { id: existing.id }, data: baseData }),
      prisma.personEmail.deleteMany({ where: { personId: existing.id } }),
      prisma.personPhone.deleteMany({ where: { personId: existing.id } }),
      ...emailCreates(existing.id, conn.emailAddresses),
      ...phoneCreates(existing.id, conn.phoneNumbers),
    ]);
    return 'updated';
  }

  const created = await prisma.person.create({
    data: {
      userId,
      uid,
      ...baseData,
    },
    select: { id: true },
  });

  if (
    (conn.emailAddresses?.length ?? 0) + (conn.phoneNumbers?.length ?? 0) >
    0
  ) {
    await prisma.$transaction([
      ...emailCreates(created.id, conn.emailAddresses),
      ...phoneCreates(created.id, conn.phoneNumbers),
    ]);
  }

  return 'created';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emailCreates(personId: string, emails?: PeopleEmail[]) {
  if (!emails?.length) return [];
  const seen = new Set<string>();
  return emails
    .filter((e) => {
      const v = e.value?.trim().toLowerCase();
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    })
    .map((e) =>
      prisma.personEmail.create({
        data: {
          personId,
          email: e.value!.trim().toLowerCase(),
          type: normalizeType(e.type, 'other'),
        },
      }),
    );
}

function phoneCreates(personId: string, phones?: PeoplePhone[]) {
  if (!phones?.length) return [];
  const seen = new Set<string>();
  return phones
    .filter((p) => {
      const v = p.value?.trim();
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    })
    .map((p) =>
      prisma.personPhone.create({
        data: {
          personId,
          number: p.value!.trim(),
          type: normalizeType(p.type, 'mobile'),
        },
      }),
    );
}

function normalizeType(raw: string | undefined, fallback: string): string {
  const t = raw?.toLowerCase().trim();
  if (!t) return fallback;
  if (
    t === 'work' ||
    t === 'home' ||
    t === 'mobile' ||
    t === 'main' ||
    t === 'fax' ||
    t === 'other'
  )
    return t;
  return fallback;
}

function emptyResult(errors: string[]): ContactsSyncResult {
  return { fetched: 0, created: 0, updated: 0, deleted: 0, errors };
}

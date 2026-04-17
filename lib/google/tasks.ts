import { tasks as createTasks, tasks_v1 } from '@googleapis/tasks';
import { prisma } from '@/lib/prisma';
import { getGoogleAuth } from './auth';
import { createModuleLogger } from '@/lib/logger';
import { formatFullName } from '@/lib/nameUtils';

const log = createModuleLogger('google-tasks');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskListOption {
  id: string;
  title: string;
}

export interface CreateTaskInput {
  userId: string;
  title: string;
  notes?: string;
  /** ISO date string (YYYY-MM-DD) for task due date. */
  due?: string | null;
  /** Optional Google task list ID. Falls back to the user's default list. */
  taskListId?: string | null;
  /** Nametag person IDs to associate with this task. */
  personIds?: string[];
  /** Optional Nametag journal entry the task was spawned from. */
  journalEntryId?: string | null;
}

export interface StoredTask {
  id: string;
  googleTaskId: string;
  googleListId: string;
  title: string;
  notes: string | null;
  due: Date | null;
  status: string;
  taskWebUrl: string | null;
  createdAt: Date;
  people: Array<{ id: string; name: string; surname: string | null }>;
}

// ---------------------------------------------------------------------------
// listUserTaskLists
// ---------------------------------------------------------------------------

/**
 * Lists the task lists available in the user's Google account. Used by the
 * settings UI to let users pick their default list for new tasks.
 */
export async function listUserTaskLists(userId: string): Promise<TaskListOption[]> {
  const { auth } = await getGoogleAuth(userId);
  const client = createTasks({ version: 'v1', auth });

  const response = await client.tasklists.list({ maxResults: 100 });
  const items = response.data.items || [];

  return items
    .filter((item): item is tasks_v1.Schema$TaskList & { id: string } => !!item.id)
    .map((item) => ({
      id: item.id,
      title: item.title || '(Untitled)',
    }));
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

/**
 * Creates a task in Google Tasks and stores a local reference linking it back
 * to the supplied people / journal entry. The task's notes are augmented with
 * a human-readable "Related people" list so the context is preserved inside
 * Google Tasks itself.
 */
export async function createTask(input: CreateTaskInput): Promise<StoredTask> {
  const { userId, title, notes, due, taskListId, personIds = [], journalEntryId } = input;

  const integration = await prisma.googleIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    throw new Error('No Google integration configured for this user');
  }

  if (!integration.tasksEnabled) {
    throw new Error('Google Tasks is not enabled for this user');
  }

  // Validate people belong to this user before doing any API calls
  let validPeople: Array<{ id: string; name: string; surname: string | null; middleName: string | null; secondLastName: string | null; nickname: string | null }> = [];
  if (personIds.length > 0) {
    validPeople = await prisma.person.findMany({
      where: {
        id: { in: personIds },
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        surname: true,
        middleName: true,
        secondLastName: true,
        nickname: true,
      },
    });

    if (validPeople.length !== personIds.length) {
      throw new Error('One or more person IDs are invalid');
    }
  }

  // Validate journal entry ownership if provided
  if (journalEntryId) {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: journalEntryId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      throw new Error('Journal entry not found');
    }
  }

  const { auth } = await getGoogleAuth(userId);
  const client = createTasks({ version: 'v1', auth });

  const listId = taskListId || integration.defaultTaskListId || await resolveDefaultListId(client);

  // Compose the notes body: user notes + a "Related:" footer with names and
  // deep links back into Nametag. The links use BASE_URL when available, so
  // the user can jump from Google Tasks straight to the person profile.
  const baseUrl = process.env.NEXTAUTH_URL || process.env.BASE_URL || '';
  const peopleLines = validPeople.map((p) => {
    const name = formatFullName(p);
    return baseUrl ? `- ${name} (${baseUrl}/people/${p.id})` : `- ${name}`;
  });
  const journalLine = journalEntryId && baseUrl
    ? `Journal entry: ${baseUrl}/journal/${journalEntryId}`
    : null;

  const noteSections = [
    notes?.trim() || null,
    peopleLines.length > 0 ? `Related people:\n${peopleLines.join('\n')}` : null,
    journalLine,
  ].filter(Boolean);

  const combinedNotes = noteSections.join('\n\n') || undefined;

  const requestBody: tasks_v1.Schema$Task = {
    title,
    notes: combinedNotes,
  };

  if (due) {
    // Google Tasks only persists the date portion; send as RFC3339 at UTC.
    requestBody.due = new Date(`${due}T00:00:00.000Z`).toISOString();
  }

  log.info({ userId, listId, personCount: validPeople.length }, 'Creating Google Task');

  const response = await client.tasks.insert({
    tasklist: listId,
    requestBody,
  });

  const task = response.data;
  if (!task.id) {
    throw new Error('Google Tasks API returned no task ID');
  }

  const dueDate = task.due ? new Date(task.due) : null;

  // Persist the local reference inside a transaction so the join rows are
  // created atomically with the parent record.
  const stored = await prisma.$transaction(async (tx) => {
    const gtask = await tx.googleTask.create({
      data: {
        integrationId: integration.id,
        userId,
        journalEntryId: journalEntryId || null,
        googleTaskId: task.id!,
        googleListId: listId,
        title: task.title || title,
        notes: task.notes || combinedNotes || null,
        due: dueDate,
        status: task.status || 'needsAction',
        taskWebUrl: task.webViewLink || null,
      },
    });

    if (validPeople.length > 0) {
      await tx.googleTaskPerson.createMany({
        data: validPeople.map((p) => ({
          googleTaskId: gtask.id,
          personId: p.id,
        })),
        skipDuplicates: true,
      });
    }

    return gtask;
  });

  return {
    id: stored.id,
    googleTaskId: stored.googleTaskId,
    googleListId: stored.googleListId,
    title: stored.title,
    notes: stored.notes,
    due: stored.due,
    status: stored.status,
    taskWebUrl: stored.taskWebUrl,
    createdAt: stored.createdAt,
    people: validPeople.map((p) => ({ id: p.id, name: p.name, surname: p.surname })),
  };
}

// ---------------------------------------------------------------------------
// listTasksForPerson / listTasksForJournalEntry
// ---------------------------------------------------------------------------

/**
 * Returns all locally-tracked Google Tasks that reference the given person,
 * newest first. Used to show an inline "Tasks" section on the person profile.
 */
export async function listTasksForPerson(userId: string, personId: string): Promise<StoredTask[]> {
  const rows = await prisma.googleTask.findMany({
    where: {
      userId,
      people: { some: { personId } },
    },
    include: {
      people: {
        include: {
          person: { select: { id: true, name: true, surname: true } },
        },
      },
    },
    orderBy: [{ due: 'asc' }, { createdAt: 'desc' }],
  });

  return rows.map(mapStoredTask);
}

/**
 * Returns all locally-tracked Google Tasks that reference the given journal
 * entry. Used to show tasks inline on the journal detail page.
 */
export async function listTasksForJournalEntry(
  userId: string,
  journalEntryId: string,
): Promise<StoredTask[]> {
  const rows = await prisma.googleTask.findMany({
    where: { userId, journalEntryId },
    include: {
      people: {
        include: {
          person: { select: { id: true, name: true, surname: true } },
        },
      },
    },
    orderBy: [{ due: 'asc' }, { createdAt: 'desc' }],
  });

  return rows.map(mapStoredTask);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveDefaultListId(client: tasks_v1.Tasks): Promise<string> {
  const response = await client.tasklists.list({ maxResults: 1 });
  const first = response.data.items?.[0];
  if (!first?.id) {
    throw new Error('User has no Google Task lists');
  }
  return first.id;
}

type StoredTaskRow = {
  id: string;
  googleTaskId: string;
  googleListId: string;
  title: string;
  notes: string | null;
  due: Date | null;
  status: string;
  taskWebUrl: string | null;
  createdAt: Date;
  people: Array<{ person: { id: string; name: string; surname: string | null } }>;
};

function mapStoredTask(row: StoredTaskRow): StoredTask {
  return {
    id: row.id,
    googleTaskId: row.googleTaskId,
    googleListId: row.googleListId,
    title: row.title,
    notes: row.notes,
    due: row.due,
    status: row.status,
    taskWebUrl: row.taskWebUrl,
    createdAt: row.createdAt,
    people: row.people.map((p) => p.person),
  };
}

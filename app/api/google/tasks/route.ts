import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { handleApiError, withLogging, parseRequestBody } from '@/lib/api-utils';
import { createGoogleTaskSchema, validateRequest } from '@/lib/validations';
import { createTask, listTasksForPerson, listTasksForJournalEntry } from '@/lib/google/tasks';

// GET /api/google/tasks?person=<id> | ?journalEntry=<id>
// Lists locally-tracked Google Tasks for a person or journal entry. At least
// one filter is required so we never return every task.
export const GET = withLogging(async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const personId = url.searchParams.get('person');
    const journalEntryId = url.searchParams.get('journalEntry');

    if (!personId && !journalEntryId) {
      return NextResponse.json(
        { error: 'Either "person" or "journalEntry" query parameter is required' },
        { status: 400 },
      );
    }

    const tasks = personId
      ? await listTasksForPerson(session.user.id, personId)
      : await listTasksForJournalEntry(session.user.id, journalEntryId!);

    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return handleApiError(error, 'google-tasks-list');
  }
});

// POST /api/google/tasks - Create a new Google Task linked to people/journal
export const POST = withLogging(async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await parseRequestBody(request);
    const validation = validateRequest(createGoogleTaskSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { title, notes, due, taskListId, personIds, journalEntryId } = validation.data;

    const task = await createTask({
      userId: session.user.id,
      title,
      notes: notes ?? undefined,
      due: due ?? null,
      taskListId: taskListId ?? null,
      personIds: personIds ?? [],
      journalEntryId: journalEntryId ?? null,
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'google-tasks-create');
  }
});

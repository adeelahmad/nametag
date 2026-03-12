import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { findAllDuplicateGroups } from '@/lib/duplicate-detection';

// GET /api/people/duplicates - Find all duplicate groups
export const GET = withAuth(async (_request, session) => {
  try {
    const [allPeople, dismissals] = await Promise.all([
      prisma.person.findMany({
        where: { userId: session.user.id, deletedAt: null },
        select: { id: true, name: true, surname: true },
      }),
      prisma.duplicateDismissal.findMany({
        where: { userId: session.user.id },
        select: { personAId: true, personBId: true },
      }),
    ]);

    // Build a set of dismissed pair keys for fast lookup
    const dismissedPairs = new Set(
      dismissals.map((d) => `${d.personAId}:${d.personBId}`)
    );

    const groups = findAllDuplicateGroups(allPeople, dismissedPairs);

    return apiResponse.ok({ groups });
  } catch (error) {
    return handleApiError(error, 'people-duplicates-all');
  }
});

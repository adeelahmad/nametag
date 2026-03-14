import { prisma } from '@/lib/prisma';
import { apiResponse, handleApiError, withAuth } from '@/lib/api-utils';
import { findDuplicates } from '@/lib/duplicate-detection';

// GET /api/people/[id]/duplicates - Find potential duplicates for a person
export const GET = withAuth(async (_request, session, context) => {
  try {
    const { id } = await context.params;

    const target = await prisma.person.findUnique({
      where: { id, userId: session.user.id, deletedAt: null },
      select: { id: true, name: true, surname: true },
    });

    if (!target) {
      return apiResponse.notFound('Person not found');
    }

    const [allPeople, dismissals] = await Promise.all([
      prisma.person.findMany({
        where: { userId: session.user.id, deletedAt: null },
        select: { id: true, name: true, surname: true },
      }),
      prisma.duplicateDismissal.findMany({
        where: {
          userId: session.user.id,
          OR: [{ personAId: id }, { personBId: id }],
        },
        select: { personAId: true, personBId: true },
      }),
    ]);

    // Build set of person IDs dismissed against the target
    const dismissedPartners = new Set(
      dismissals.map((d) =>
        d.personAId === id ? d.personBId : d.personAId
      )
    );

    const candidates = findDuplicates(target.name, target.surname, allPeople, target.id)
      .filter((c) => !dismissedPartners.has(c.personId));

    return apiResponse.ok({ duplicates: candidates });
  } catch (error) {
    return handleApiError(error, 'people-duplicates');
  }
});

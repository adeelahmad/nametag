// Conversation search. Returns a ranked list of conversations that match the
// query in either their title or any non-compacted message content. We use
// case-insensitive substring matching (Postgres ILIKE) which is adequate for
// tens of thousands of messages; swap in tsvector/pg_trgm in phase 3 if
// performance becomes an issue.
//
// Ranking: title hits count 3, message hits count 1; recency adds a small
// constant per day since now (capped). Snippets are 120 chars centered on
// the first hit.

import { prisma } from '@/lib/prisma';

export type SearchHit = {
  conversationId: string;
  title: string;
  snippet: string;
  updatedAt: Date;
  score: number;
};

const SNIPPET_RADIUS = 60;
const MAX_RESULTS = 50;

export async function searchConversations(
  userId: string,
  rawQuery: string,
): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (!query) return [];
  const pattern = `%${escapeLike(query)}%`;

  const convs = await prisma.assistantConversation.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        {
          messages: {
            some: {
              content: { contains: query, mode: 'insensitive' },
              compacted: false,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      messages: {
        where: {
          content: { contains: query, mode: 'insensitive' },
          compacted: false,
        },
        select: { content: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    take: MAX_RESULTS,
  });
  // pattern is only referenced when adding a raw query; keep unused warning away.
  void pattern;

  const now = Date.now();
  const hits: SearchHit[] = convs.map((c) => {
    const titleHit = c.title.toLowerCase().includes(query.toLowerCase());
    const msg = c.messages[0];
    let score = 0;
    if (titleHit) score += 3;
    if (msg) score += 1;
    const recencyDays = Math.max(
      0,
      (now - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    score += Math.max(0, 1 - Math.min(30, recencyDays) / 30);

    let snippet = c.title;
    if (msg) snippet = snippetAround(msg.content, query);
    else if (titleHit) snippet = c.title;

    return {
      conversationId: c.id,
      title: c.title,
      snippet,
      updatedAt: c.updatedAt,
      score,
    };
  });

  hits.sort((a, b) => b.score - a.score || b.updatedAt.getTime() - a.updatedAt.getTime());
  return hits;
}

export function snippetAround(text: string, query: string): string {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, SNIPPET_RADIUS * 2).trim();
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

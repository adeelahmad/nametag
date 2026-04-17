// Tool registry for the assistant. Tools are user-scoped Prisma operations
// wrapped in a simple name + JSON-schema + handler interface. They're the
// same surface exposed over MCP, so agent, matter-bridge, and MCP clients
// all share one code path.
//
// Each tool is intentionally small and stateless so the LLM can compose them.
// Destructive operations (delete/merge) are NOT included here on purpose;
// add them explicitly once the rest of the flow is proven.

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { filterPeople, normalizeForSearch } from '@/lib/search';
import type { ToolDefinition, JSONSchema } from './types';
import { getUpcomingEvents } from '@/lib/upcoming-events';
import { runWebSearch } from './web-search';
import { safeFetch, extractText } from './fetch-url';
import { extractPdfText } from './pdf';
import { runDeepResearch } from './deep-research';
import { getOrCreateSettings, getDecryptedSearchKey } from './settings';

export interface ToolContext {
  userId: string;
}

export interface RegisteredTool {
  definition: ToolDefinition;
  // Zod schema used for runtime validation of arguments.
  argsSchema: z.ZodTypeAny;
  // Returns a value that will be JSON-stringified for the model.
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

const PAGINATION = {
  limit: {
    type: 'integer',
    description: 'Maximum number of results to return (default 25, max 100).',
  } satisfies JSONSchema,
  offset: {
    type: 'integer',
    description: 'Number of results to skip (for pagination).',
  } satisfies JSONSchema,
};

function clampLimit(n: unknown, def = 25, max = 100): number {
  const v = typeof n === 'number' ? n : def;
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
}

function clampOffset(n: unknown): number {
  const v = typeof n === 'number' ? n : 0;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

// ---------------------------------------------------------------------------
// Tool: list_people
// ---------------------------------------------------------------------------
const listPeopleTool: RegisteredTool = {
  definition: {
    name: 'list_people',
    description:
      'List people in the user\'s contacts. Supports fuzzy search across name, surname, nickname, and organization.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search string. Matches across name, surname, nickname, and organization, accent-insensitive.',
        },
        groupId: {
          type: 'string',
          description: 'Optional group id to filter by.',
        },
        ...PAGINATION,
      },
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    query: z.string().optional(),
    groupId: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),
  async handler(args, ctx) {
    const { query, groupId, limit, offset } = listPeopleTool.argsSchema.parse(args) as {
      query?: string;
      groupId?: string;
      limit?: number;
      offset?: number;
    };
    const take = clampLimit(limit);
    const skip = clampOffset(offset);

    const where: Record<string, unknown> = {
      userId: ctx.userId,
      deletedAt: null,
    };
    if (groupId) {
      where.groups = { some: { groupId } };
    }

    const rows = await prisma.person.findMany({
      where: where as never,
      select: {
        id: true,
        name: true,
        surname: true,
        nickname: true,
        organization: true,
        jobTitle: true,
        lastContact: true,
      },
      orderBy: { name: 'asc' },
      take: query ? 500 : take,
      skip: query ? 0 : skip,
    });

    const filtered = query
      ? filterPeople(rows, query, ['name', 'surname', 'nickname', 'organization'])
      : rows;

    return {
      total: filtered.length,
      results: filtered.slice(skip, skip + take),
    };
  },
};

// ---------------------------------------------------------------------------
// Tool: get_person
// ---------------------------------------------------------------------------
const getPersonTool: RegisteredTool = {
  definition: {
    name: 'get_person',
    description: 'Fetch a single person by id, including all structured details.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Person id.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({ id: z.string().min(1) }),
  async handler(args, ctx) {
    const { id } = getPersonTool.argsSchema.parse(args) as { id: string };
    const person = await prisma.person.findFirst({
      where: { id, userId: ctx.userId, deletedAt: null },
      include: {
        phoneNumbers: true,
        emails: true,
        addresses: true,
        urls: true,
        imHandles: true,
        importantDates: { where: { deletedAt: null } },
        groups: { include: { group: true } },
        relationshipToUser: true,
      },
    });
    if (!person) throw new Error(`Person ${id} not found.`);
    return person;
  },
};

// ---------------------------------------------------------------------------
// Tool: update_person_notes
// ---------------------------------------------------------------------------
const updatePersonNotesTool: RegisteredTool = {
  definition: {
    name: 'update_person_notes',
    description:
      'Append to or replace the free-form notes field on a person. Use append when adding context the user just mentioned.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Person id.' },
        notes: { type: 'string', description: 'New notes text.' },
        mode: {
          type: 'string',
          description: 'Either "replace" (overwrite) or "append" (add to existing, default).',
          enum: ['replace', 'append'],
        },
      },
      required: ['id', 'notes'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    id: z.string().min(1),
    notes: z.string(),
    mode: z.enum(['replace', 'append']).optional(),
  }),
  async handler(args, ctx) {
    const { id, notes, mode = 'append' } = updatePersonNotesTool.argsSchema.parse(args) as {
      id: string;
      notes: string;
      mode?: 'replace' | 'append';
    };
    const person = await prisma.person.findFirst({
      where: { id, userId: ctx.userId, deletedAt: null },
      select: { notes: true },
    });
    if (!person) throw new Error(`Person ${id} not found.`);
    const next =
      mode === 'replace' || !person.notes
        ? notes
        : `${person.notes.trimEnd()}\n\n${notes}`;
    await prisma.person.update({ where: { id }, data: { notes: next } });
    return { id, notes: next };
  },
};

// ---------------------------------------------------------------------------
// Tool: update_last_contact
// ---------------------------------------------------------------------------
const updateLastContactTool: RegisteredTool = {
  definition: {
    name: 'update_last_contact',
    description:
      'Set the `lastContact` timestamp for a person (e.g. when the user mentions they just spoke with someone).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Person id.' },
        date: {
          type: 'string',
          description: 'ISO-8601 timestamp. Defaults to now if omitted.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({ id: z.string().min(1), date: z.string().optional() }),
  async handler(args, ctx) {
    const { id, date } = updateLastContactTool.argsSchema.parse(args) as {
      id: string;
      date?: string;
    };
    const person = await prisma.person.findFirst({
      where: { id, userId: ctx.userId, deletedAt: null },
      select: { id: true },
    });
    if (!person) throw new Error(`Person ${id} not found.`);
    const when = date ? new Date(date) : new Date();
    if (Number.isNaN(when.getTime())) throw new Error('Invalid date.');
    await prisma.person.update({ where: { id }, data: { lastContact: when } });
    return { id, lastContact: when.toISOString() };
  },
};

// ---------------------------------------------------------------------------
// Tool: create_journal_entry
// ---------------------------------------------------------------------------
const createJournalEntryTool: RegisteredTool = {
  definition: {
    name: 'create_journal_entry',
    description:
      'Create a journal entry. Optionally associate it with one or more people.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the entry.' },
        content: { type: 'string', description: 'Body of the entry (markdown ok).' },
        date: {
          type: 'string',
          description: 'ISO-8601 timestamp for when this happened (defaults to now).',
        },
        personIds: {
          type: 'array',
          description: 'Ids of people to associate with this entry.',
          items: { type: 'string' },
        },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    date: z.string().optional(),
    personIds: z.array(z.string()).optional(),
  }),
  async handler(args, ctx) {
    const { title, content, date, personIds } = createJournalEntryTool.argsSchema.parse(args) as {
      title: string;
      content: string;
      date?: string;
      personIds?: string[];
    };
    const when = date ? new Date(date) : new Date();
    if (Number.isNaN(when.getTime())) throw new Error('Invalid date.');

    // Ownership check for the provided person ids.
    const ids = personIds ?? [];
    if (ids.length > 0) {
      const valid = await prisma.person.findMany({
        where: { id: { in: ids }, userId: ctx.userId, deletedAt: null },
        select: { id: true },
      });
      const validSet = new Set(valid.map((p) => p.id));
      for (const id of ids) {
        if (!validSet.has(id)) throw new Error(`Person ${id} not found.`);
      }
    }

    const entry = await prisma.journalEntry.create({
      data: {
        userId: ctx.userId,
        title,
        body: content,
        date: when,
        people: ids.length
          ? { create: ids.map((pid) => ({ personId: pid })) }
          : undefined,
      },
      include: { people: true },
    });
    return entry;
  },
};

// ---------------------------------------------------------------------------
// Tool: list_groups
// ---------------------------------------------------------------------------
const listGroupsTool: RegisteredTool = {
  definition: {
    name: 'list_groups',
    description: 'List the user\'s contact groups.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search by group name.' },
      },
      additionalProperties: false,
    },
  },
  argsSchema: z.object({ query: z.string().optional() }),
  async handler(args, ctx) {
    const { query } = listGroupsTool.argsSchema.parse(args) as { query?: string };
    const groups = await prisma.group.findMany({
      where: { userId: ctx.userId, deletedAt: null },
      select: { id: true, name: true, description: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    if (!query) return { total: groups.length, results: groups };
    const norm = normalizeForSearch(query);
    const filtered = groups.filter((g) =>
      normalizeForSearch(`${g.name} ${g.description ?? ''}`).includes(norm),
    );
    return { total: filtered.length, results: filtered };
  },
};

// ---------------------------------------------------------------------------
// Tool: upcoming_events
// ---------------------------------------------------------------------------
const upcomingEventsTool: RegisteredTool = {
  definition: {
    name: 'upcoming_events',
    description:
      'Return upcoming important dates (birthdays, anniversaries, custom events) for the user\'s contacts.',
    parameters: {
      type: 'object',
      properties: {
        daysAhead: {
          type: 'integer',
          description: 'How many days in the future to include (default 30, max 365).',
        },
      },
      additionalProperties: false,
    },
  },
  argsSchema: z.object({ daysAhead: z.number().optional() }),
  async handler(args, ctx) {
    const { daysAhead } = upcomingEventsTool.argsSchema.parse(args) as {
      daysAhead?: number;
    };
    const events = await getUpcomingEvents(ctx.userId);
    const capped = typeof daysAhead === 'number'
      ? events.filter((e) => e.daysUntil <= Math.min(daysAhead, 365))
      : events;
    return { total: capped.length, results: capped };
  },
};

// ---------------------------------------------------------------------------
// Tool: search_journal
// ---------------------------------------------------------------------------
const searchJournalTool: RegisteredTool = {
  definition: {
    name: 'search_journal',
    description:
      'Search the user\'s journal entries by text (title + content). Returns recent matches.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text.' },
        personId: {
          type: 'string',
          description: 'Optional: only entries linked to this person.',
        },
        ...PAGINATION,
      },
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    query: z.string().optional(),
    personId: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }),
  async handler(args, ctx) {
    const { query, personId, limit, offset } = searchJournalTool.argsSchema.parse(args) as {
      query?: string;
      personId?: string;
      limit?: number;
      offset?: number;
    };
    const take = clampLimit(limit);
    const skip = clampOffset(offset);
    const where: Record<string, unknown> = {
      userId: ctx.userId,
      deletedAt: null,
    };
    if (personId) where.people = { some: { personId } };

    const rows = await prisma.journalEntry.findMany({
      where: where as never,
      orderBy: { date: 'desc' },
      take: query ? 500 : take,
      skip: query ? 0 : skip,
      select: {
        id: true,
        title: true,
        body: true,
        date: true,
        createdAt: true,
      },
    });

    if (!query) return { total: rows.length, results: rows };
    const norm = normalizeForSearch(query);
    const filtered = rows.filter((r) =>
      normalizeForSearch(`${r.title} ${r.body}`).includes(norm),
    );
    return {
      total: filtered.length,
      results: filtered.slice(skip, skip + take),
    };
  },
};

// ---------------------------------------------------------------------------
// Tool: current_time
// ---------------------------------------------------------------------------
const currentTimeTool: RegisteredTool = {
  definition: {
    name: 'current_time',
    description: 'Get the current date and time (ISO-8601, UTC).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  argsSchema: z.object({}),
  async handler() {
    return { now: new Date().toISOString() };
  },
};

// ---------------------------------------------------------------------------
// Tool: web_search
// ---------------------------------------------------------------------------
const webSearchTool: RegisteredTool = {
  definition: {
    name: 'web_search',
    description:
      'Search the public web for up-to-date information. Returns a list of titles, URLs, and snippets. Provider is configured per-user (Brave, Tavily, or DuckDuckGo fallback).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query.' },
        maxResults: {
          type: 'integer',
          description: 'Maximum results to return (default 6, max 20).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().positive().max(20).optional(),
  }),
  async handler(args, ctx) {
    const { query, maxResults } = args as { query: string; maxResults?: number };
    const settings = await getOrCreateSettings(ctx.userId);
    const apiKey = await getDecryptedSearchKey(ctx.userId);
    const results = await runWebSearch(query, settings, {
      maxResults,
      apiKey,
    });
    return { provider: settings.searchProvider, results };
  },
};

// ---------------------------------------------------------------------------
// Tool: fetch_url
// ---------------------------------------------------------------------------
const fetchUrlTool: RegisteredTool = {
  definition: {
    name: 'fetch_url',
    description:
      'Fetch a URL and return extracted plain text. Supports HTML, plain text, JSON, and PDFs. SSRF-protected and size-capped.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL.' },
        maxChars: {
          type: 'integer',
          description: 'Maximum characters of extracted text to return (default 8000).',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    url: z.string().url(),
    maxChars: z.number().int().positive().max(50_000).optional(),
  }),
  async handler(args) {
    const { url, maxChars } = args as { url: string; maxChars?: number };
    const res = await safeFetch(url);
    const isPdf = res.contentType.toLowerCase().includes('pdf');
    const text = isPdf
      ? await extractPdfText(res.bytes).catch(() => '')
      : extractText(res.bytes, res.contentType);
    const cap = Math.min(maxChars ?? 8000, 50_000);
    return {
      finalUrl: res.url,
      status: res.status,
      contentType: res.contentType,
      text: text.slice(0, cap),
      truncated: text.length > cap,
    };
  },
};

// ---------------------------------------------------------------------------
// Tool: deep_research
// ---------------------------------------------------------------------------
const deepResearchTool: RegisteredTool = {
  definition: {
    name: 'deep_research',
    description:
      'Multi-step research: issue a web search, fetch the top pages, and return a structured brief with citations. Use for questions that need current facts the model may not know.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The research question.' },
        maxSteps: {
          type: 'integer',
          description: 'Optional override for the per-user research step cap (max 12).',
        },
      },
      required: ['question'],
      additionalProperties: false,
    },
  },
  argsSchema: z.object({
    question: z.string().min(1),
    maxSteps: z.number().int().positive().max(12).optional(),
  }),
  async handler(args, ctx) {
    const { question, maxSteps } = args as {
      question: string;
      maxSteps?: number;
    };
    const settings = await getOrCreateSettings(ctx.userId);
    const apiKey = await getDecryptedSearchKey(ctx.userId);
    return runDeepResearch(question, settings, apiKey, { maxSteps });
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const REGISTRY: Record<string, RegisteredTool> = {
  list_people: listPeopleTool,
  get_person: getPersonTool,
  update_person_notes: updatePersonNotesTool,
  update_last_contact: updateLastContactTool,
  create_journal_entry: createJournalEntryTool,
  search_journal: searchJournalTool,
  list_groups: listGroupsTool,
  upcoming_events: upcomingEventsTool,
  current_time: currentTimeTool,
  web_search: webSearchTool,
  fetch_url: fetchUrlTool,
  deep_research: deepResearchTool,
};

export function listTools(opts?: { disabled?: string[] }): RegisteredTool[] {
  const disabled = new Set(opts?.disabled ?? []);
  return Object.values(REGISTRY).filter((t) => !disabled.has(t.definition.name));
}

export function getTool(name: string): RegisteredTool | undefined {
  return REGISTRY[name];
}

export async function runTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  const tool = REGISTRY[name];
  if (!tool) {
    return { isError: true, result: { error: `Unknown tool: ${name}` } };
  }
  try {
    const result = await tool.handler(args ?? {}, ctx);
    return { isError: false, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, result: { error: message } };
  }
}

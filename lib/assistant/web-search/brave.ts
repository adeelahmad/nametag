// Brave Search adapter — https://api.search.brave.com/res/v1/web/search
import { safeFetch } from '../fetch-url';
import type { WebSearchResult } from './index';

export async function searchBrave(
  query: string,
  opts: { maxResults: number; apiKey: string },
): Promise<WebSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(opts.maxResults));

  const res = await safeFetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'x-subscription-token': opts.apiKey,
    },
  });
  if (res.status !== 200) {
    throw new Error(`Brave search failed: ${res.status}`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(res.bytes.toString('utf8'));
  } catch {
    throw new Error('Brave search returned non-JSON');
  }
  const results =
    (doc as { web?: { results?: Array<Record<string, unknown>> } }).web?.results ?? [];
  return results.slice(0, opts.maxResults).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    snippet: String(r.description ?? ''),
    publishedAt: typeof r.age === 'string' ? r.age : undefined,
  }));
}

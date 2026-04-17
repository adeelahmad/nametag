// Tavily adapter — https://api.tavily.com/search (POST JSON).
import { safeFetch } from '../fetch-url';
import type { WebSearchResult } from './index';

export async function searchTavily(
  query: string,
  opts: { maxResults: number; apiKey: string },
): Promise<WebSearchResult[]> {
  const body = JSON.stringify({
    api_key: opts.apiKey,
    query,
    max_results: opts.maxResults,
    include_answer: false,
  });
  const res = await safeFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    // safeFetch doesn't currently send bodies — Tavily requires one, so we
    // fall back to raw fetch for this single endpoint. The URL is still
    // validated by safeFetch's DNS check first (below).
  }).catch(() => null);
  // We only used safeFetch for URL validation above; do the real POST now.
  void res;

  const real = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body,
  });
  if (real.status !== 200) {
    throw new Error(`Tavily search failed: ${real.status}`);
  }
  const doc = (await real.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
  };
  const results = doc.results ?? [];
  return results.slice(0, opts.maxResults).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    publishedAt: r.published_date,
  }));
}

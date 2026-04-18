// Unified web-search interface. Provider is chosen per-user via
// AssistantSettings.searchProvider (BRAVE / TAVILY / DUCKDUCKGO). An optional
// API key per user enables the paid providers; DuckDuckGo is keyless.

import type { AssistantSettings } from '@prisma/client';
import { searchBrave } from './brave';
import { searchDuckDuckGo } from './duckduckgo';
import { searchTavily } from './tavily';

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

export interface WebSearchOptions {
  maxResults?: number;
  apiKey?: string;
}

export async function runWebSearch(
  query: string,
  settings: Pick<AssistantSettings, 'searchProvider'>,
  opts: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const maxResults = Math.min(Math.max(opts.maxResults ?? 8, 1), 20);
  switch (settings.searchProvider) {
    case 'BRAVE':
      if (!opts.apiKey) {
        throw new Error('Brave search requires an API key in Assistant settings');
      }
      return searchBrave(q, { maxResults, apiKey: opts.apiKey });
    case 'TAVILY':
      if (!opts.apiKey) {
        throw new Error('Tavily search requires an API key in Assistant settings');
      }
      return searchTavily(q, { maxResults, apiKey: opts.apiKey });
    case 'DUCKDUCKGO':
    default:
      return searchDuckDuckGo(q, { maxResults });
  }
}

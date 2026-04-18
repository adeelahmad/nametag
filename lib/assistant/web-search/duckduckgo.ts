// DuckDuckGo HTML endpoint — keyless fallback. Parses the stripped-down HTML
// response at https://html.duckduckgo.com/html/?q=... using regex (no
// cheerio dependency). Brittle but good enough when the user hasn't set up
// an API key. Rate-limited by DuckDuckGo; consider pointing users at
// Brave/Tavily for heavy use.

import { htmlToText, safeFetch } from '../fetch-url';
import type { WebSearchResult } from './index';

export async function searchDuckDuckGo(
  query: string,
  opts: { maxResults: number },
): Promise<WebSearchResult[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  const res = await safeFetch(url.toString(), {
    headers: { accept: 'text/html' },
  });
  if (res.status !== 200) {
    throw new Error(`DuckDuckGo search failed: ${res.status}`);
  }
  const html = res.bytes.toString('utf8');
  return parseDuckDuckGoResults(html, opts.maxResults);
}

export function parseDuckDuckGoResults(
  html: string,
  maxResults: number,
): WebSearchResult[] {
  const hits: WebSearchResult[] = [];
  const resultBlock =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = resultBlock.exec(html)) !== null && hits.length < maxResults) {
    const rawUrl = decodeDuckDuckGoLink(match[1]);
    const title = htmlToText(match[2]);
    const snippet = htmlToText(match[3]);
    if (!rawUrl) continue;
    hits.push({ title, url: rawUrl, snippet });
  }
  return hits;
}

function decodeDuckDuckGoLink(href: string): string | null {
  try {
    if (href.startsWith('//')) href = `https:${href}`;
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return u.toString();
  } catch {
    return null;
  }
}

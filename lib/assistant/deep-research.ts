// Deep research composite tool. Given a question, performs up to N steps of
// web_search + fetch_url, then returns a synthesis answer plus citations.
// The step cap comes from settings.maxResearchSteps. Intermediate steps are
// logged back to the caller so they can be persisted in message.metadata.

import type { AssistantSettings } from '@prisma/client';
import { runWebSearch, type WebSearchResult } from './web-search';
import { safeFetch, extractText } from './fetch-url';
import { extractPdfText } from './pdf';

export interface DeepResearchStep {
  kind: 'search' | 'fetch';
  query?: string;
  url?: string;
  summary: string;
}

export interface DeepResearchResult {
  answer: string;
  citations: Array<{ title: string; url: string }>;
  steps: DeepResearchStep[];
}

const PER_FETCH_EXTRACT_CAP = 8_000;

export async function runDeepResearch(
  question: string,
  settings: Pick<AssistantSettings, 'searchProvider' | 'maxResearchSteps'>,
  searchApiKey: string | undefined,
  opts: { maxSteps?: number } = {},
): Promise<DeepResearchResult> {
  const steps: DeepResearchStep[] = [];
  const citations: Array<{ title: string; url: string }> = [];
  const maxSteps = Math.max(
    1,
    Math.min(opts.maxSteps ?? settings.maxResearchSteps ?? 6, 12),
  );

  const seen = new Set<string>();
  const synthesisChunks: string[] = [];

  const searchResults = await runWebSearch(question, settings, {
    apiKey: searchApiKey,
    maxResults: Math.min(6, maxSteps),
  });
  steps.push({
    kind: 'search',
    query: question,
    summary: `${searchResults.length} results`,
  });

  const toFetch = searchResults
    .filter((r) => r.url && !seen.has(r.url))
    .slice(0, maxSteps - 1);

  for (const hit of toFetch) {
    seen.add(hit.url);
    try {
      const res = await safeFetch(hit.url);
      let text = '';
      if (res.contentType.toLowerCase().includes('pdf')) {
        text = await extractPdfText(res.bytes).catch(() => '');
      } else {
        text = extractText(res.bytes, res.contentType);
      }
      const snippet = text.slice(0, PER_FETCH_EXTRACT_CAP);
      if (snippet.length > 0) {
        synthesisChunks.push(
          `### ${hit.title}\n<${hit.url}>\n${snippet}\n`,
        );
        citations.push({ title: hit.title || hit.url, url: hit.url });
      }
      steps.push({
        kind: 'fetch',
        url: hit.url,
        summary: `${snippet.length} chars`,
      });
    } catch (err) {
      steps.push({
        kind: 'fetch',
        url: hit.url,
        summary: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const answer = buildAnswer(question, searchResults, synthesisChunks);
  return { answer, citations, steps };
}

// Without a second LLM call, the "answer" is a structured brief of the
// highest-signal snippets. The caller (the agent loop) gets this back as a
// tool_result and will synthesise a final natural-language reply in the
// next turn.
function buildAnswer(
  question: string,
  results: WebSearchResult[],
  chunks: string[],
): string {
  const head = `# Research brief\n\nQuestion: ${question}\n`;
  const list = results
    .slice(0, 5)
    .map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.snippet}`)
    .join('\n');
  const body = chunks.length ? `\n\n## Extracted passages\n\n${chunks.join('\n')}` : '';
  return `${head}\n## Top results\n${list}${body}`.trim();
}

import { describe, expect, it } from 'vitest';
import { parseDuckDuckGoResults } from '@/lib/assistant/web-search/duckduckgo';

const sampleHtml = `
<html><body>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffirst">
      First Example
    </a>
    <a class="result__snippet" href="x">Leading <b>snippet</b> for the first hit.</a>
  </div>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsecond">
      Second Example
    </a>
    <a class="result__snippet" href="x">Another snippet here.</a>
  </div>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fthird">
      Third Example
    </a>
    <a class="result__snippet" href="x">Yet another snippet.</a>
  </div>
</body></html>
`;

describe('parseDuckDuckGoResults', () => {
  it('extracts title, url, and snippet from the HTML endpoint', () => {
    const hits = parseDuckDuckGoResults(sampleHtml, 10);
    expect(hits).toHaveLength(3);
    expect(hits[0].title).toMatch(/First Example/);
    expect(hits[0].url).toBe('https://example.com/first');
    expect(hits[0].snippet).toMatch(/Leading snippet/);
    expect(hits[1].url).toBe('https://example.com/second');
  });

  it('respects the maxResults cap', () => {
    const hits = parseDuckDuckGoResults(sampleHtml, 2);
    expect(hits).toHaveLength(2);
  });

  it('returns empty array when no results match', () => {
    expect(parseDuckDuckGoResults('<html></html>', 5)).toEqual([]);
  });
});

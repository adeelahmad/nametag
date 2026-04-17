// SSRF-safe outbound fetch used by web_search, fetch_url, and deep_research
// tools. Every outbound call goes through `safeFetch` so the deny-list is
// enforced in one place.
//
// Guards:
//   * Only http/https
//   * Host must resolve to non-private IPs (reuses isPrivateIP from the
//     CardDAV URL validator)
//   * Blocks well-known cloud metadata endpoints regardless of DNS result
//   * Caps: 10 s timeout, 5 MiB body, <=3 redirects
//
// Content extraction:
//   * HTML → strip <script>/<style>/<noscript> and tags, collapse whitespace
//   * PDF → delegate to lib/assistant/pdf.ts
//   * other text/* → return as-is, truncated to byte cap

import dns from 'dns';
import { isPrivateIP } from '@/lib/carddav/url-validation';

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
]);

export class UnsafeUrlError extends Error {}
export class FetchTooLargeError extends Error {}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  bytes: Buffer;
  text?: string;
}

export async function safeFetch(
  inputUrl: string,
  opts: { method?: string; headers?: Record<string, string>; maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const visited = new Set<string>();
  let currentUrl = inputUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertSafeUrl(currentUrl);
    if (visited.has(currentUrl)) {
      throw new UnsafeUrlError('Redirect loop detected');
    }
    visited.add(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: opts.method ?? 'GET',
        headers: {
          'user-agent': 'NametagAssistantBot/1.0 (+https://github.com/adeelahmad/nametag)',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(opts.headers ?? {}),
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        throw new UnsafeUrlError(`Redirect ${res.status} without location header`);
      }
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    const max = opts.maxBytes ?? MAX_BODY_BYTES;
    const bytes = await readBodyWithCap(res, max);
    const contentType = res.headers.get('content-type') ?? '';
    return {
      url: currentUrl,
      status: res.status,
      contentType,
      bytes,
    };
  }
  throw new UnsafeUrlError(`Exceeded ${MAX_REDIRECTS} redirects`);
}

async function readBodyWithCap(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      reader.cancel().catch(() => {});
      throw new FetchTooLargeError(`Body exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsafeUrlError('Only http/https URLs are allowed');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) throw new UnsafeUrlError('URL must include a host');
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new UnsafeUrlError('Blocked metadata host');
  }
  if (hostname === 'localhost') throw new UnsafeUrlError('Localhost not allowed');
  if (isPrivateIP(hostname)) throw new UnsafeUrlError('Private address not allowed');

  const isRawIP =
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':');
  if (isRawIP) return;

  const [v4, v6] = await Promise.allSettled([
    dns.promises.resolve4(hostname),
    dns.promises.resolve6(hostname),
  ]);
  const ips: string[] = [];
  if (v4.status === 'fulfilled') ips.push(...v4.value);
  if (v6.status === 'fulfilled') ips.push(...v6.value);
  if (ips.length === 0) throw new UnsafeUrlError('Host did not resolve');
  for (const ip of ips) {
    if (isPrivateIP(ip)) {
      throw new UnsafeUrlError(`Host resolves to private address ${ip}`);
    }
    if (BLOCKED_HOSTS.has(ip)) {
      throw new UnsafeUrlError('Blocked metadata address');
    }
  }
}

// ---------- Content extraction --------------------------------------------

export function extractText(bytes: Buffer, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    return htmlToText(bytes.toString('utf8'));
  }
  if (ct.startsWith('text/') || ct.includes('json') || ct.includes('xml')) {
    return bytes.toString('utf8');
  }
  return '';
}

export function htmlToText(html: string): string {
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  out = out.replace(/<(br|br\s*\/|\/p|\/div|\/li|\/h[1-6])>/gi, '\n');
  out = out.replace(/<[^>]+>/g, ' ');
  out = out.replace(/&nbsp;/g, ' ');
  out = out.replace(/&amp;/g, '&');
  out = out.replace(/&lt;/g, '<');
  out = out.replace(/&gt;/g, '>');
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#39;/g, "'");
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

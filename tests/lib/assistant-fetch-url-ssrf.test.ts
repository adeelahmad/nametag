import { describe, expect, it } from 'vitest';
import { assertSafeUrl, htmlToText, UnsafeUrlError } from '@/lib/assistant/fetch-url';

describe('assertSafeUrl — SSRF guard', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('javascript:alert(1)')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('gopher://evil/x')).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects localhost and loopback literals', async () => {
    await expect(assertSafeUrl('http://localhost/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('http://[::1]/')).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects RFC1918 and link-local', async () => {
    await expect(assertSafeUrl('http://10.0.0.1/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('http://192.168.1.1/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('http://172.16.5.5/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl('http://169.254.169.254/')).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('rejects known cloud metadata hostnames', async () => {
    await expect(assertSafeUrl('http://metadata.google.internal/')).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe('htmlToText', () => {
  it('strips scripts and styles and collapses whitespace', () => {
    const html = `<html><head><style>body{color:red}</style><script>evil()</script></head>
      <body><h1>Title</h1><p>Some <b>bold</b> text.</p></body></html>`;
    const out = htmlToText(html);
    expect(out).not.toMatch(/evil/);
    expect(out).not.toMatch(/color:red/);
    expect(out).toMatch(/Title/);
    expect(out).toMatch(/Some bold text/);
  });

  it('decodes a handful of html entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3');
  });
});

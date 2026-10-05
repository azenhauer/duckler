// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPdf, MAX_EXTENSION_PDF_BYTES } from './pdf';

afterEach(() => vi.unstubAllGlobals());
describe('PDF downloads', () => {
  it('keeps the actual PDF bytes and uses the website session', async () => {
    const request = vi.fn(async () => new Response('%PDF-1.7\nfixture', { headers: { 'content-type': 'application/octet-stream' } }));
    vi.stubGlobal('fetch', request);
    expect(await fetchPdf('https://example.com/download?id=1', 'https://example.com/paper')).toBe(`data:application/pdf;base64,${btoa('%PDF-1.7\nfixture')}`);
    expect(request).toHaveBeenCalledWith('https://example.com/download?id=1', expect.objectContaining({ credentials: 'include', redirect: 'error' }));
  });
  it('rejects a different origin before making a request', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(fetchPdf('https://other.example/file.pdf', 'https://example.com')).rejects.toThrow(/Open the PDF/);
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects login pages and denied downloads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Log in</html>')));
    await expect(fetchPdf('https://example.com/file.pdf', 'https://example.com')).rejects.toThrow(/not a PDF/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await expect(fetchPdf('https://example.com/file.pdf', 'https://example.com')).rejects.toThrow(/did not allow/);
  });
  it('enforces size limits even when the server omits content-length', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_EXTENSION_PDF_BYTES + 1)); controller.close(); } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));
    await expect(fetchPdf('https://example.com/file.pdf', 'https://example.com')).rejects.toThrow(/11 MiB/);
  });
});

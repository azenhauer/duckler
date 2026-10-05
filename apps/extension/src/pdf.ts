import { bytesToBase64 } from '../../../packages/shared/src/captureProtocol';

// Base64 plus the capture envelope must fit the existing 16 MiB transfer limit.
export const MAX_EXTENSION_PDF_BYTES = 11 * 1024 * 1024;
export async function fetchPdf(url: string, pageUrl: string) {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.origin !== new URL(pageUrl).origin) {
    throw new Error('Open the PDF’s website first, then save it from the extension.');
  }
  const response = await fetch(target.href, { credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(20000) }).catch(() => {
    throw new Error('Could not download this PDF. Open its direct URL and try again, or upload the downloaded file in Duckler.');
  });
  if (!response.ok) throw new Error('This website did not allow the PDF download. Open or download the PDF and try again.');
  if (Number(response.headers.get('content-length')) > MAX_EXTENSION_PDF_BYTES) throw new Error('PDFs saved by the extension must be 11 MiB or smaller. Upload this file in Duckler instead.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The PDF download was empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      const value = chunk.value;
      size += value.length;
      if (size > MAX_EXTENSION_PDF_BYTES) throw new Error('PDFs saved by the extension must be 11 MiB or smaller. Upload this file in Duckler instead.');
      chunks.push(value);
      chunk = await reader.read();
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (new TextDecoder().decode(bytes.subarray(0, 1024)).indexOf('%PDF-') < 0) throw new Error('This download is not a PDF. It may be a login page.');
  return `data:application/pdf;base64,${bytesToBase64(bytes)}`;
}

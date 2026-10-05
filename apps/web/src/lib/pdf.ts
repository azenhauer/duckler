// PDF support, loaded only when a PDF is added or opened. pdf.js and its worker are bundled assets.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { hasPdfSignature, MAX_PDF_BYTES, MAX_PDF_PAGES, type PdfDocument } from '@visual-library/shared';

type PdfJs = typeof import('pdfjs-dist');
export type LoadedPdf = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
let pdfjsPromise: Promise<PdfJs> | null = null;
const loadPdfJs = () => pdfjsPromise ??= import('pdfjs-dist').then(module => { module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; return module; });

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};
const fromDataUrl = (dataUrl: string) => {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export async function openPdf(data: Uint8Array | string): Promise<LoadedPdf> {
  const pdfjs = await loadPdfJs();
  const bytes = typeof data === 'string' ? fromDataUrl(data) : data;
  try {
    return await pdfjs.getDocument({ data: bytes.slice(), enableXfa: false }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password and try again.');
    throw new Error('This PDF could not be read. It may be damaged or not a PDF.');
  }
}

/** Renders one page to an image data URL no wider than `maxWidth` CSS pixels. */
export async function renderPdfPage(pdf: LoadedPdf, pageNumber: number, maxWidth = 900, type: 'image/png' | 'image/jpeg' = 'image/jpeg'): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxWidth / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas.toDataURL(type, .88);
}

/** Embedded text from text-based PDFs (scanned PDFs return little or nothing). */
async function extractPdfText(pdf: LoadedPdf, maxChars = 500000): Promise<string> {
  const parts: string[] = [];
  let length = 0;
  for (let number = 1; number <= Math.min(pdf.numPages, MAX_PDF_PAGES) && length < maxChars; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    page.cleanup();
    if (text) { parts.push(text); length += text.length + 1; }
  }
  return parts.join('\n').slice(0, maxChars);
}

/** Reads a PDF file into what a PDF card stores: bytes, page count, first-page thumbnail and text. */
export async function readPdfFile(file: File): Promise<{ title: string; thumbnail: string; pdf: PdfDocument }> {
  if (file.size > MAX_PDF_BYTES) throw new Error('PDFs can be up to 25 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfSignature(bytes)) throw new Error('This file is not a PDF.');
  const pdf = await openPdf(bytes);
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDFs can have up to ${MAX_PDF_PAGES} pages.`);
    const [thumbnail, text] = await Promise.all([renderPdfPage(pdf, 1, 640), extractPdfText(pdf)]);
    return { title: file.name.replace(/\.pdf$/i, '') || 'PDF', thumbnail, pdf: { fileName: file.name.slice(0, 300), pageCount: pdf.numPages, data: `data:application/pdf;base64,${toBase64(bytes)}`, text } };
  } finally {
    void pdf.loadingTask.destroy();
  }
}

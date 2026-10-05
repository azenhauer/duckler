// On-demand OCR. This module (and tesseract.js) is only loaded when someone presses "Extract text",
// so it never touches the initial bundle. Worker and core are served from this app (Vite ?url assets);
// only the language data comes from the tesseract.js-data CDN unless VITE_OCR_LANG_PATH points elsewhere.
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreSimdUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import { mediaFingerprint, type OcrText } from '@visual-library/shared';

export const OCR_LANGUAGES = [{ id: 'eng', label: 'English' }, { id: 'por', label: 'Português' }] as const;
export type OcrProgress = { status: string; progress: number };
const MAX_SIDE = 2400;
const MAX_TEXT = 200000;
const ENGINE = 'tesseract.js';
const ENGINE_VERSION = '7';

const simdSupported = (() => {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; }
})();

/** Draw the image no larger than MAX_SIDE on its longest side; the stored original is never changed. */
async function prepareImage(dataUrl: string): Promise<Blob> {
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image could not be prepared')), 'image/png'));
}

type OcrWorker = { recognize: (image: Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
let busy = false;

/** Extracts text from an image data URL. Abort the signal to cancel; only one job runs at a time. */
export async function extractText(dataUrl: string, options: { languages?: string[]; onProgress?: (progress: OcrProgress) => void; signal?: AbortSignal } = {}): Promise<OcrText> {
  if (busy) throw new Error('Another extraction is already running');
  const languages = options.languages?.length ? options.languages : ['eng', 'por'];
  const sourceHash = mediaFingerprint(dataUrl);
  busy = true;
  const handle: { worker: OcrWorker | null } = { worker: null };
  const abort = () => { void handle.worker?.terminate(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    options.onProgress?.({ status: 'Preparing image', progress: 0 });
    const [{ createWorker }, image] = await Promise.all([import('tesseract.js'), prepareImage(dataUrl)]);
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const langPath = (import.meta.env.VITE_OCR_LANG_PATH as string | undefined)?.trim() || undefined;
    handle.worker = await createWorker(languages, 1, {
      workerPath: workerUrl, corePath: simdSupported ? coreSimdUrl : coreUrl, workerBlobURL: false,
      ...(langPath ? { langPath } : {}),
      logger: message => options.onProgress?.({ status: message.status, progress: Number.isFinite(message.progress) ? message.progress : 0 }),
    }) as unknown as OcrWorker;
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const result = await handle.worker.recognize(image);
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const text = result.data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
    return { text, sourceHash, languages, engine: ENGINE, engineVersion: ENGINE_VERSION, createdAt: new Date().toISOString(), editedByUser: false };
  } finally {
    options.signal?.removeEventListener('abort', abort);
    busy = false;
    void handle.worker?.terminate().catch(() => {});
  }
}

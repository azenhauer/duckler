import { useEffect, useRef, useState } from 'react';
import type { CardRecord } from '@visual-library/shared';

/**
 * Small copies of card images for the grid. Painting hundreds of full-size screenshots (often
 * 1600 px+) scaled down cost ~200 ms per repaint; a 720 px copy is cheap. Each copy is made once,
 * decoded off the main thread by createImageBitmap, and saved on the card (`thumb`), so later
 * sessions show it immediately.
 */
export type CardThumb = NonNullable<CardRecord['thumb']>;
const THUMB_WIDTH = 720;
const MAX_PARALLEL = 3;
const made = new Map<string, CardThumb>();
const pending = new Map<string, Promise<CardThumb>>();
let running = 0;
const queue: (() => void)[] = [];

const slot = () => new Promise<void>(resolve => {
  if (running < MAX_PARALLEL) { running++; resolve(); } else queue.push(() => { running++; resolve(); });
});
const release = () => { running--; queue.shift()?.(); };

/** Identifies the image a thumbnail was made from without hashing megabytes of data URL. */
export const imageFingerprint = (source: string) => `${source.length}:${source.slice(-40)}`;

const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function shrink(source: string): Promise<CardThumb> {
  const of = imageFingerprint(source);
  await slot();
  try {
    const full = await createImageBitmap(await (await fetch(source)).blob());
    try {
      if (full.width <= THUMB_WIDTH) return { url: '', of }; // already small: the original is the thumbnail
      const height = Math.round(full.height * THUMB_WIDTH / full.width);
      const canvas = new OffscreenCanvas(THUMB_WIDTH, height);
      const context = canvas.getContext('2d');
      if (!context) return { url: '', of };
      context.imageSmoothingQuality = 'high';
      context.drawImage(full, 0, 0, THUMB_WIDTH, height);
      // WebP keeps transparency; browsers that cannot encode it fall back to PNG.
      return { url: await asDataUrl(await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })), of };
    } finally { full.close(); }
  } catch {
    return { url: '', of };
  } finally { release(); }
}

const supported = () => typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';

/**
 * The image to show for a card in the grid; undefined while its thumbnail is made (once per image).
 * `store` saves a new thumbnail on the card.
 */
export function useThumbnail(card: CardRecord, source: string | undefined, store: (cardId: string, thumb: CardThumb) => void): string | undefined {
  const of = source ? imageFingerprint(source) : '';
  const saved = card.thumb?.of === of ? card.thumb : made.get(`${card.id}:${of}`);
  const [, rerender] = useState(0);
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    if (!source || saved || !supported()) return;
    let live = true;
    const key = `${card.id}:${of}`;
    let job = pending.get(key);
    if (!job) {
      job = shrink(source).then(thumb => { made.set(key, thumb); pending.delete(key); storeRef.current(card.id, thumb); return thumb; });
      pending.set(key, job);
    }
    void job.then(() => { if (live) rerender(n => n + 1); });
    return () => { live = false; };
  }, [card.id, of, source, saved]);
  if (!source) return undefined;
  if (!supported()) return source;
  return saved ? saved.url || source : undefined;
}

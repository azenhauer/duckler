import { useEffect, useState } from 'react';

/**
 * Small copies of card images for the grid. Painting hundreds of full-size screenshots (often
 * 1600 px+) scaled down cost ~200 ms per repaint; a 720 px copy is cheap. Made once per image per
 * session, decoded off the main thread by createImageBitmap, and kept as blob URLs.
 */
const THUMB_WIDTH = 720;
const MAX_PARALLEL = 3;
const ready = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let running = 0;
const queue: (() => void)[] = [];

const slot = () => new Promise<void>(resolve => {
  if (running < MAX_PARALLEL) { running++; resolve(); } else queue.push(() => { running++; resolve(); });
});
const release = () => { running--; queue.shift()?.(); };

async function shrink(source: string): Promise<string> {
  await slot();
  try {
    const blob = await (await fetch(source)).blob();
    const full = await createImageBitmap(blob);
    try {
      if (full.width <= THUMB_WIDTH) return source; // already small: keep the original
      const height = Math.round(full.height * THUMB_WIDTH / full.width);
      const canvas = new OffscreenCanvas(THUMB_WIDTH, height);
      const context = canvas.getContext('2d');
      if (!context) return source;
      context.imageSmoothingQuality = 'high';
      context.drawImage(full, 0, 0, THUMB_WIDTH, height);
      // WebP keeps transparency; browsers that cannot encode it fall back to PNG.
      return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }));
    } finally { full.close(); }
  } catch {
    return source;
  } finally { release(); }
}

const supported = () => typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';

/** The grid-sized version of an image; undefined while it is being made (the first time only). */
export function useThumbnail(key: string, source: string | undefined): string | undefined {
  const id = source ? key : '';
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!source || ready.has(id) || !supported()) return;
    let live = true;
    let job = pending.get(id);
    if (!job) { job = shrink(source); pending.set(id, job); }
    void job.then(url => { ready.set(id, url); pending.delete(id); if (live) rerender(n => n + 1); });
    return () => { live = false; };
  }, [id, source]);
  if (!source) return undefined;
  if (!supported()) return source;
  return ready.get(id);
}

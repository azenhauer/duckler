import type { PendingShareItem } from './shareQueue';

export const parseShareTargetFallback = (search: string): PendingShareItem | null => {
  const params = new URLSearchParams(search);
  const id = params.get('sharedId');
  if (!id) return null;
  if (id.length > 200) throw new Error('The shared item identifier is invalid.');

  const title = params.get('sharedTitle')?.trim() ?? '';
  const text = params.get('sharedText')?.trim() ?? '';
  const url = params.get('sharedUrl')?.trim() ?? '';

  if (title.length > 1000 || text.length > 100_000 || url.length > 2048) {
    throw new Error('The shared item is too large to import.');
  }
  if (!title && !text && !url) throw new Error('The shared item is empty.');
  if (url) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('The shared URL is invalid.');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTP(S) shared URLs can be imported.');
    }
  }

  return { id, title, text, url };
};

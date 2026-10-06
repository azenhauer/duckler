/**
 * What a drag from another app or website carries, reduced to what Duckler can keep: one image or PDF
 * file, one web link and plain text. Only http(s) links are accepted, and Duckler's own drags (cards,
 * connections) are left to their own drop targets.
 */
export type DroppedItem = { file?: File; url: string; text: string };

const OWN_DRAG = /^application\/x-duckler/;
const MAX_TEXT = 100000;

const webUrl = (value: string) => {
  try { const url = new URL(value.trim()); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};

/** True for drags this app should accept as new content (checked on dragover, when data can't be read yet). */
export const isExternalDrop = (types: readonly string[]) =>
  !types.some(type => OWN_DRAG.test(type)) && types.some(type => type === 'Files' || type === 'text/uri-list' || type === 'text/plain');

export const isKeepableFile = (file: File) => file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export function readDrop(data: Pick<DataTransfer, 'files' | 'getData'>): DroppedItem | null {
  const file = Array.from(data.files ?? []).find(isKeepableFile);
  const listed = data.getData('text/uri-list').split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) ?? '';
  const plain = data.getData('text/plain').trim().slice(0, MAX_TEXT);
  const url = webUrl(listed) || webUrl(plain);
  // A dragged link usually repeats its address as the text; keep the text only when it says something else.
  const text = plain && !(url && webUrl(plain) === url) ? plain : '';
  return file || url || text ? { ...(file ? { file } : {}), url, text } : null;
}

/** A note's text with dropped text and links added on new lines (each kept once). */
export function appendToNote(note: string, additions: string[]): string {
  const lines = additions.map(item => item.trim()).filter(item => item && !note.includes(item));
  return [note.trimEnd(), ...lines].filter(Boolean).join('\n').slice(0, MAX_TEXT);
}

// JSON messages are bounded; binary payloads cross the bridge as base64 chunks.
export const CAPTURE_PROTOCOL = 1;
export const CAPTURE_CHUNK_BYTES = 192 * 1024;
export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
export const MAX_QUEUE_BYTES = 250 * 1024 * 1024;
export const MAX_QUEUE_ITEMS = 500;
export const CAPTURE_PORT = 'duckler-capture-v1';

export type Capture = {
  id: string;
  kind: 'bookmark' | 'text' | 'image' | 'screenshot' | 'pdf';
  title: string;
  sourceUrl?: string;
  note?: string;
  caption?: string;
  /** Optional card colour chosen while capturing (#rrggbb). */
  color?: string;
  collectionName?: string;
  collectionIds?: string[];
  collectionNames?: string[];
  payload?: string;
  tags?: string[];
  createdAt: string;
};
export type Pairing = { origin: string; libraryId: string; nonce: string };
export type CaptureMetadata = {
  id: string; libraryId: string; title: string; kind: Capture['kind'];
  createdAt: string; byteLength: number; hash: string; chunks: number;
};

export function parsePairing(value: unknown): Pairing {
  if (!value || typeof value !== 'object') throw new Error('Invalid library connection code.');
  const p = value as Record<string, unknown>;
  if (typeof p.origin !== 'string' || typeof p.libraryId !== 'string' || typeof p.nonce !== 'string'
    || !/^[a-zA-Z0-9-]{16,100}$/.test(p.libraryId) || !/^[a-zA-Z0-9-]{32,100}$/.test(p.nonce)) {
    throw new Error('Invalid library connection code.');
  }
  const url = new URL(p.origin);
  if (url.origin !== p.origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Connect to an HTTPS library or localhost.');
  }
  return { origin: p.origin, libraryId: p.libraryId, nonce: p.nonce };
}

export function validateCapture(value: unknown): Capture {
  if (!value || typeof value !== 'object') throw new Error('Capture data is missing.');
  const c = value as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id || c.id.length > 200 || typeof c.title !== 'string'
    || !c.title.trim() || c.title.length > 1000 || !['bookmark', 'text', 'image', 'screenshot', 'pdf'].includes(String(c.kind))) {
    throw new Error('Capture type and title are required.');
  }
  if (typeof c.createdAt !== 'string' || !Number.isFinite(Date.parse(c.createdAt))) throw new Error('Invalid capture time.');
  const sourceUrl = typeof c.sourceUrl === 'string' ? c.sourceUrl : '';
  if (sourceUrl && (sourceUrl.length > 8192 || !['http:', 'https:'].includes(new URL(sourceUrl).protocol))) {
    throw new Error('Only HTTP(S) source URLs can be captured.');
  }
  const note = typeof c.note === 'string' ? c.note : '';
  if (note.length > 100_000) throw new Error('Capture note is too long.');
  const caption = typeof c.caption === 'string' ? c.caption.trim() : '';
  if (caption.length > 10000) throw new Error('Capture caption is too long.');
  if (c.collectionName !== undefined && (typeof c.collectionName !== 'string' || c.collectionName.length > 200)) throw new Error('Collection name must be at most 200 characters.');
  const collectionIds = Array.isArray(c.collectionIds) ? c.collectionIds.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id)).slice(0, 100) : [];
  const collectionNames = Array.isArray(c.collectionNames) ? c.collectionNames.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).slice(0, 100).map(name => name.trim().slice(0, 200)) : [];
  const payload = typeof c.payload === 'string' ? c.payload : '';
  if (c.kind === 'pdf' && !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(payload)) throw new Error('PDF capture must contain PDF data.');
  if (['image', 'screenshot'].includes(String(c.kind)) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(payload)) {
    throw new Error('Image capture must contain PNG, JPEG, or WebP data.');
  }
  return {
    id: c.id, kind: c.kind as Capture['kind'], title: c.title.trim(), sourceUrl, note, caption: caption || undefined,
    ...(typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? { color: c.color.toLowerCase() } : {}), payload, collectionName: typeof c.collectionName === 'string' ? c.collectionName.trim() : undefined, collectionIds, collectionNames,
    tags: Array.isArray(c.tags) ? c.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).slice(0, 100).map(tag => tag.trim().slice(0, 100)) : [],
    createdAt: c.createdAt,
  };
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function base64ToBytes(encoded: string): Uint8Array {
  if (encoded.length > Math.ceil(CAPTURE_CHUNK_BYTES / 3) * 4) throw new Error('Capture chunk exceeds the transfer limit.');
  return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
}

export function cropBounds(rect: { left: number; top: number; right: number; bottom: number }, viewport: { width: number; height: number }, bitmap: { width: number; height: number }) {
  if (![...Object.values(rect), ...Object.values(viewport), ...Object.values(bitmap)].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0 || bitmap.width <= 0 || bitmap.height <= 0) throw new Error('Invalid screenshot dimensions.');
  const sx = bitmap.width / viewport.width, sy = bitmap.height / viewport.height;
  if (Math.abs(sx - sy) / Math.max(sx, sy) > 0.025) throw new Error('Screenshot viewport changed. Try again.');
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(0, value));
  const left = clamp(Math.floor(Math.min(rect.left, rect.right) * sx), bitmap.width);
  const top = clamp(Math.floor(Math.min(rect.top, rect.bottom) * sy), bitmap.height);
  const right = clamp(Math.ceil(Math.max(rect.left, rect.right) * sx), bitmap.width);
  const bottom = clamp(Math.ceil(Math.max(rect.top, rect.bottom) * sy), bitmap.height);
  if ((right - left) / sx < 4 || (bottom - top) / sy < 4) throw new Error('Select an area at least 4 × 4 pixels.');
  return { left, top, width: right - left, height: bottom - top };
}

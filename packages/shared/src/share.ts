import { z } from 'zod';
import type { CardRecord, CollectionRecord } from './index';

/**
 * A view-only shared collection: a snapshot file in the owner's Drive that anyone with the link can
 * read. It holds only what a viewer sees (no ids from the library, no tags of other collections).
 * Viewers treat it as untrusted: text is rendered as text, images must be raster data URLs and
 * links must be http(s).
 */
export const SHARE_FORMAT = 1;
export const MAX_SHARE_BYTES = 60 * 1024 * 1024;

const imageDataUrl = z.string().max(20 * 1024 * 1024).regex(/^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/);
const webUrl = z.string().max(4000).refine(value => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } });

const sharedCardSchema = z.object({
  type: z.enum(['image', 'text', 'bookmark', 'pdf']),
  title: z.string().max(1000),
  note: z.string().max(100000).default(''),
  caption: z.string().max(10000).optional(),
  sourceUrl: webUrl.optional(),
  tags: z.array(z.string().max(48)).max(20).default([]),
  createdAt: z.string().max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  image: imageDataUrl.optional(),
}).strict();

const shareSchema = z.object({
  kind: z.literal('duckler-share'),
  format: z.number().int().positive(),
  sharedAt: z.string().max(40),
  owner: z.string().max(120).default(''),
  /** The sharer's small profile photo (the 256 px crop), shown next to their name. */
  ownerPhoto: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  /** The rest of the sharer's profile card, shown when hovering their picture. */
  ownerTag: z.string().max(33).regex(/^[\p{L}\p{N}_.-]*$/u).optional(),
  ownerBio: z.string().max(256).optional(),
  ownerColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  ownerCover: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  collection: z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).default('') }).strict(),
  cards: z.array(sharedCardSchema).max(2000),
}).strict();

export type SharedCard = z.infer<typeof sharedCardSchema>;
export type SharedCollection = z.infer<typeof shareSchema>;

const isWebUrl = (value?: string) => { try { return Boolean(value) && ['http:', 'https:'].includes(new URL(value!).protocol); } catch { return false; } };
const isImage = (value?: string) => Boolean(value && /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(value));

/** What gets published for a collection. PDFs are shared as their first-page image. */
export type ShareOwner = { name: string; photo?: string; tag?: string; bio?: string; color?: string; cover?: string };
const safeImage = (value?: string) => value && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 400_000 ? value : undefined;
export function createShareSnapshot(collection: CollectionRecord, cards: CardRecord[], owner: ShareOwner | string = '', sharedAt = new Date().toISOString()): SharedCollection {
  const who = typeof owner === 'string' ? { name: owner } : owner;
  const photo = safeImage(who.photo), cover = safeImage(who.cover);
  const tag = who.tag?.replace(/^@+/, '').slice(0, 33);
  const byId = new Map(cards.map(card => [card.id, card]));
  return {
    kind: 'duckler-share',
    format: SHARE_FORMAT,
    sharedAt,
    owner: who.name.slice(0, 120),
    ...(photo ? { ownerPhoto: photo } : {}),
    ...(tag && /^[\p{L}\p{N}_.-]+$/u.test(tag) ? { ownerTag: tag } : {}),
    ...(who.bio?.trim() ? { ownerBio: who.bio.trim().slice(0, 256) } : {}),
    ...(who.color && /^#[0-9a-f]{6}$/i.test(who.color) ? { ownerColor: who.color } : {}),
    ...(cover ? { ownerCover: cover } : {}),
    collection: { name: collection.name, description: collection.description.slice(0, 2000) },
    cards: collection.cardIds.map(id => byId.get(id)).filter((card): card is CardRecord => Boolean(card && !card.trashed)).map(card => ({
      type: card.type,
      title: card.title.slice(0, 1000),
      note: card.note.slice(0, 100000),
      ...(card.caption ? { caption: card.caption.slice(0, 10000) } : {}),
      ...(isWebUrl(card.sourceUrl) ? { sourceUrl: card.sourceUrl } : {}),
      tags: card.tags.slice(0, 20).map(tag => tag.slice(0, 48)),
      createdAt: card.createdAt,
      ...(card.color ? { color: card.color } : {}),
      ...(isImage(card.dataUrl) ? { image: card.dataUrl } : {}),
    })),
  };
}

export function parseShareSnapshot(json: string): SharedCollection {
  if (json.length > MAX_SHARE_BYTES) throw new Error('This shared collection is too large to open.');
  const parsed = shareSchema.parse(JSON.parse(json));
  if (parsed.format > SHARE_FORMAT) throw new Error('This collection was shared by a newer Duckler. Reload to open it.');
  return parsed;
}

/*
 * End-to-end encrypted snapshots, the scheme Excalidraw uses for its share links (MIT,
 * https://plus.excalidraw.com/blog/end-to-end-encryption): AES-GCM with a random key that lives
 * only in the link's #fragment, which browsers never send to a server. Drive stores ciphertext.
 * File layout: 12-byte random IV, then the ciphertext.
 */
const subtle = () => globalThis.crypto.subtle;
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), char => char.charCodeAt(0));

export const SHARE_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export async function createShareKey(): Promise<string> {
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
  return toBase64Url(new Uint8Array(await subtle().exportKey('raw', key)));
}
const importKey = (key: string, usage: KeyUsage) => {
  if (!SHARE_KEY_PATTERN.test(key)) throw new Error('This link is incomplete. Ask for the full link again.');
  return subtle().importKey('raw', fromBase64Url(key), 'AES-GCM', false, [usage]);
};

export async function encryptShare(snapshot: SharedCollection, key: string): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(snapshot));
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await importKey(key, 'encrypt'), data));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv); out.set(sealed, iv.length);
  return out;
}

export async function decryptShare(bytes: Uint8Array, key: string): Promise<SharedCollection> {
  if (bytes.length > MAX_SHARE_BYTES || bytes.length < 29) throw new Error('This shared collection could not be opened.');
  let plain: ArrayBuffer;
  try { plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await importKey(key, 'decrypt'), bytes.slice(12)); }
  catch (error) { throw error instanceof Error && /incomplete/.test(error.message) ? error : new Error('This link does not match its collection. Ask for the full link again.'); }
  return parseShareSnapshot(new TextDecoder().decode(plain));
}

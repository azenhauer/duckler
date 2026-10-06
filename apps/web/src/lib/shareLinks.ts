import { createShareKey, createShareSnapshot, decryptShare, encryptShare, MAX_SHARE_BYTES, SHARE_KEY_PATTERN, type CardRecord, type CollectionRecord, type SharedCollection, type ShareOwner } from '@visual-library/shared';
import { editLibraryFile, type DriveClient } from './driveSync';
import { googleConfig, loadGoogleConfig } from './googleConfig';

/**
 * View-only share links. A shared collection is an encrypted snapshot file in the owner's Drive that
 * anyone with the link can download; only the full link (duckler.pages.dev/s/<file id>#<key>) can
 * read it, because the key never leaves the #fragment (Excalidraw's scheme, see share.ts). Stopping
 * sharing deletes the file, so the link stops working. Snapshots are refreshed after each sync.
 */
export const SHARE_PATH = /^\/s\/([A-Za-z0-9_-]{10,200})\/?$/;
export const shareUrl = (fileId: string, key: string, origin = globalThis.location?.origin ?? 'https://duckler.pages.dev') => `${origin}/s/${fileId}#${key}`;
export const getGoogleApiKey = () => googleConfig().apiKey;

export type ShareRecord = { collectionId: string; fileId: string; sharedAt: string };

/** Every share this owner has, from Drive itself (so all their devices agree). */
export async function listShares(drive: DriveClient, rootId: string): Promise<ShareRecord[]> {
  const files = await drive.byProperty(rootId, 'kind', 'share');
  return files.filter(file => file.appProperties?.collection).map(file => ({ collectionId: file.appProperties!.collection, fileId: file.id, sharedAt: file.appProperties?.sharedAt ?? '' }));
}

const sealed = async (collection: CollectionRecord, cards: CardRecord[], owner: ShareOwner, key: string) =>
  new Blob([(await encryptShare(createShareSnapshot(collection, cards, owner), key)).slice().buffer as ArrayBuffer], { type: 'application/octet-stream' });

/** Publishes (or re-publishes) a collection and returns its link. */
export async function shareCollection(drive: DriveClient, rootId: string, collection: CollectionRecord, cards: CardRecord[], owner: ShareOwner, keys: Record<string, string>): Promise<{ share: ShareRecord; url: string; key: string }> {
  const sharedAt = new Date().toISOString();
  const existing = (await listShares(drive, rootId)).find(share => share.collectionId === collection.id);
  const known = keys[collection.id];
  if (existing && known) {
    await drive.update(existing.fileId, await sealed(collection, cards, owner, known), { kind: 'share', collection: collection.id, sharedAt });
    return { share: { ...existing, sharedAt }, url: shareUrl(existing.fileId, known), key: known };
  }
  if (existing) await drive.remove(existing.fileId); // its key is lost: start a fresh link
  const key = await createShareKey();
  const file = await drive.create({ name: `share-${collection.id}`, parents: [rootId], appProperties: { kind: 'share', collection: collection.id, sharedAt } }, await sealed(collection, cards, owner, key));
  try {
    await drive.shareWithLink(file.id);
    await editLibraryFile(drive, rootId, library => ({ ...library, shareKeys: { ...library.shareKeys, [collection.id]: key } }));
  } catch (error) { await drive.remove(file.id).catch(() => {}); throw error; }
  return { share: { collectionId: collection.id, fileId: file.id, sharedAt }, url: shareUrl(file.id, key), key };
}

export async function stopSharing(drive: DriveClient, rootId: string, share: ShareRecord) {
  await drive.remove(share.fileId);
  await editLibraryFile(drive, rootId, library => {
    const { [share.collectionId]: _gone, ...shareKeys } = library.shareKeys;
    return { ...library, shareKeys };
  });
}

/**
 * Keeps live links current: re-publishes changed collections and removes links to deleted ones.
 * Returns the shares still live, with `sharedAt` moved forward for the ones re-published (it is saved
 * on the file too, so the next sync does not upload the same snapshot again).
 */
export async function refreshShares(drive: DriveClient, shares: ShareRecord[], keys: Record<string, string>, collections: CollectionRecord[], cards: CardRecord[], owner: ShareOwner): Promise<ShareRecord[]> {
  const byId = new Map(collections.map(item => [item.id, item]));
  const cardById = new Map(cards.map(card => [card.id, card]));
  const live: ShareRecord[] = [];
  for (const share of shares) {
    const collection = byId.get(share.collectionId), key = keys[share.collectionId];
    if (!collection || !key) { await drive.remove(share.fileId); continue; }
    const since = Date.parse(share.sharedAt) || 0;
    const changed = Date.parse(collection.updatedAt) > since || collection.cardIds.some(id => Date.parse(cardById.get(id)?.updatedAt ?? '') > since);
    if (!changed) { live.push(share); continue; }
    const sharedAt = new Date().toISOString();
    await drive.update(share.fileId, await sealed(collection, cards, owner, key), { kind: 'share', collection: share.collectionId, sharedAt });
    live.push({ ...share, sharedAt });
  }
  return live;
}

/** Reads a response body, refusing more than `limit` bytes (a link can point at any public Drive file). */
async function readCapped(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('Content-Length') ?? 0) > limit) throw new Error('This shared collection is too large to open.');
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel().catch(() => {}); throw new Error('This shared collection is too large to open.'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** Opens a share link. Works without signing in: a browser API key downloads the public file. */
export async function loadSharedCollection(fileId: string, key: string, fetcher: typeof fetch = (...args) => fetch(...args)): Promise<SharedCollection> {
  if (!SHARE_KEY_PATTERN.test(key)) throw new Error('This link is incomplete. Ask for the full link again.');
  const apiKey = getGoogleApiKey() || (await loadGoogleConfig()).apiKey;
  if (!apiKey) throw new Error('Shared links are not set up on this site yet.');
  const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`);
  if (response.status === 404 || response.status === 403) throw new Error('This link was turned off, or it does not exist.');
  if (!response.ok) throw new Error('This shared collection could not be loaded. Try again in a moment.');
  return decryptShare(await readCapped(response, MAX_SHARE_BYTES), key);
}

import { emptyDriveLibrary, mediaFingerprint, mergeLibraries, parseDriveLibrary, toDriveLibrary, type CardRecord, type DriveLibrary, type MediaRef } from '@visual-library/shared';
import { bytesToBase64 } from '../../../../packages/shared/src/captureProtocol';
import { applySyncedLibrary, cardDb, readCollections, readTombstones } from './cardDb';

/**
 * Drive sync for the signed-in owner. Everything lives in a `Duckler` folder in their own Drive
 * (scope drive.file: the app only ever sees files it created). Layout:
 *   Duckler/library.json   cards (no image data), collections, deletions
 *   Duckler/img-<card>     one file per image
 *   Duckler/share-<coll>   view-only snapshots for share links (see share.ts)
 */
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'Duckler';

export class DriveAuthError extends Error {
  constructor() { super('Your Google sign-in expired. Sign in again to keep syncing.'); }
}

export type DriveFile = { id: string; name?: string; version?: string; appProperties?: Record<string, string> };

export function driveClient(token: string, fetcher: typeof fetch = (...args) => fetch(...args)) {
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetcher(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (response.status === 401) throw new DriveAuthError();
    if (!response.ok) throw new Error(`Google Drive answered ${response.status}. Try again in a moment.`);
    return response;
  };
  const json = async <T>(url: string, init?: RequestInit) => (await (await call(url, init)).json()) as T;
  const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const fields = 'id,name,version,appProperties';
  const list = async (q: string) => {
    const files: DriveFile[] = [];
    let pageToken = '';
    do {
      const page = await json<{ files?: DriveFile[]; nextPageToken?: string }>(`${API}/files?q=${encodeURIComponent(`${q} and trashed = false`)}&spaces=drive&pageSize=1000&fields=nextPageToken,files(${fields})${pageToken ? `&pageToken=${pageToken}` : ''}`);
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return files;
  };
  const multipart = (metadata: object, body: Blob) => {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', body);
    return form;
  };
  return {
    list,
    /** Files in a folder carrying an app property, e.g. ('kind', 'media'). */
    byProperty: (parentId: string, key: string, value: string) => list(`${quote(parentId)} in parents and appProperties has { key=${quote(key)} and value=${quote(value)} }`),
    get: (id: string) => json<DriveFile>(`${API}/files/${id}?fields=${fields}`),
    create: (metadata: { name: string; parents?: string[]; mimeType?: string; appProperties?: Record<string, string> }, body?: Blob) => body
      ? json<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=${fields}`, { method: 'POST', body: multipart(metadata, body) })
      : json<DriveFile>(`${API}/files?fields=${fields}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) }),
    update: (id: string, body: Blob) => json<DriveFile>(`${UPLOAD}/files/${id}?uploadType=media&fields=${fields}`, { method: 'PATCH', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body }),
    text: async (id: string) => (await call(`${API}/files/${id}?alt=media`)).text(),
    blob: async (id: string) => (await call(`${API}/files/${id}?alt=media`)).blob(),
    remove: async (id: string) => {
      try { await call(`${API}/files/${id}`, { method: 'DELETE' }); }
      catch (error) { if (!(error instanceof Error && / 404\./.test(error.message))) throw error; } // already gone
    },
    /** Anyone with the link can view (used for share links only). */
    shareWithLink: (id: string) => json(`${API}/files/${id}/permissions?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) }),
    about: () => json<{ user?: { displayName?: string; emailAddress?: string; photoLink?: string } }>(`${API}/about?fields=user(displayName,emailAddress,photoLink)`),
  };
}
export type DriveClient = ReturnType<typeof driveClient>;

export async function findOrCreateRoot(drive: DriveClient): Promise<string> {
  const [existing] = await drive.list(`mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='duckler' and value='root' }`);
  if (existing) return existing.id;
  return (await drive.create({ name: ROOT_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { duckler: 'root' } })).id;
}

const toDataUrl = async (blob: Blob) => `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
const toBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

export type SyncSummary = { received: number; sent: number; deleted: number };

/**
 * One full sync: read Drive's library, merge it with this device's, move images both ways, apply
 * the result here and write library.json back. If another device wrote library.json meanwhile, the
 * merge is redone against its version (no edit is overwritten).
 */
export async function syncLibrary(drive: DriveClient, rootId: string): Promise<SyncSummary> {
  const uploaded = new Map<string, MediaRef>(); // reused if the merge has to be redone
  for (let attempt = 0; attempt < 3; attempt++) {
    const [libraryFile] = await drive.byProperty(rootId, 'kind', 'library');
    const remote = libraryFile ? parseDriveLibrary(await drive.text(libraryFile.id)) : emptyDriveLibrary();
    const local = { cards: await cardDb.cards.toArray(), collections: await readCollections(), tombstones: await readTombstones() };
    const merged = mergeLibraries(local, remote);

    // Images only on Drive: fetch them. A failed download keeps this device's version for now.
    const byId = new Map(merged.cards.map(card => [card.id, card]));
    const writes = new Map(merged.cardsToWrite.map(card => [card.id, card]));
    for (const id of merged.downloads) {
      const media = merged.media.get(id)!;
      try {
        const dataUrl = await toDataUrl(await drive.blob(media.fileId));
        const card = { ...byId.get(id)!, dataUrl } as CardRecord;
        byId.set(id, card); writes.set(id, card);
      } catch (error) {
        if (error instanceof DriveAuthError) throw error;
        writes.delete(id);
      }
    }
    // Images only on this device: upload them.
    for (const id of merged.uploads) {
      const card = byId.get(id)!, of = mediaFingerprint(card.dataUrl!);
      let media = uploaded.get(id);
      if (media?.of !== of) {
        const file = await drive.create({ name: `img-${id}`, parents: [rootId], appProperties: { kind: 'media', card: id } }, await toBlob(card.dataUrl!));
        media = { fileId: file.id, of };
        uploaded.set(id, media);
      }
      merged.media.set(id, media);
    }

    const cards = [...byId.values()];
    const stored = toDriveLibrary({ ...merged, cards });
    if (merged.remoteChanged || !libraryFile) {
      // Someone else saved since we read: merge again with their version.
      if (libraryFile && (await drive.get(libraryFile.id)).version !== libraryFile.version) continue;
      const body = new Blob([JSON.stringify(stored)], { type: 'application/json' });
      if (libraryFile) await drive.update(libraryFile.id, body);
      else await drive.create({ name: 'library.json', parents: [rootId], appProperties: { kind: 'library' } }, body);
    }
    await applySyncedLibrary({ ...merged, cardsToWrite: [...writes.values()] });
    // Images of deleted cards and replaced images go last, once library.json no longer points at them.
    for (const fileId of merged.mediaToDelete) await drive.remove(fileId);
    return { received: writes.size + merged.collectionsToWrite.length, sent: merged.uploads.length + (merged.remoteChanged ? 1 : 0), deleted: merged.cardsToDelete.length + merged.collectionsToDelete.length };
  }
  throw new Error('Another device kept changing the library. Sync will try again shortly.');
}

/** Reads library.json, changes it and writes it back; redone if another device saved meanwhile. */
export async function editLibraryFile(drive: DriveClient, rootId: string, edit: (library: DriveLibrary) => DriveLibrary): Promise<DriveLibrary> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [file] = await drive.byProperty(rootId, 'kind', 'library');
    const current = file ? parseDriveLibrary(await drive.text(file.id)) : emptyDriveLibrary();
    const next = edit(current);
    const body = new Blob([JSON.stringify(next)], { type: 'application/json' });
    if (!file) { await drive.create({ name: 'library.json', parents: [rootId], appProperties: { kind: 'library' } }, body); return next; }
    if ((await drive.get(file.id)).version !== file.version) continue;
    await drive.update(file.id, body);
    return next;
  }
  throw new Error('Another device kept changing the library. Try again in a moment.');
}

export async function readLibraryFile(drive: DriveClient, rootId: string): Promise<DriveLibrary> {
  const [file] = await drive.byProperty(rootId, 'kind', 'library');
  return file ? parseDriveLibrary(await drive.text(file.id)) : emptyDriveLibrary();
}

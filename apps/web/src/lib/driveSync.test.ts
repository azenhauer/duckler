// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardFromInput, createCollectionFromInput, parseDriveLibrary, type CardRecord } from '@visual-library/shared';
import { cardDb, removeCard, saveCard, saveCollection } from './cardDb';
import { driveClient, findOrCreateRoot, syncLibrary } from './driveSync';
import { listShares, loadSharedCollection, shareCollection, stopSharing } from './shareLinks';

// The browser API key share links use (normally from /api/config on the deployed site).
vi.mock('./googleConfig', () => ({ googleConfig: () => ({ clientId: '', apiKey: 'browser-key' }), loadGoogleConfig: async () => ({ clientId: '', apiKey: 'browser-key' }) }));

/** A tiny in-memory Google Drive that answers the REST calls Duckler makes. */
function fakeDrive() {
  type File = { id: string; name: string; parents: string[]; mimeType?: string; appProperties: Record<string, string>; body: Blob; version: number; anyone: boolean };
  const files = new Map<string, File>();
  const hooks: { afterDownload?: (file: File) => void } = {};
  let next = 1;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = (file: File) => ({ id: file.id, name: file.name, version: String(file.version), appProperties: file.appProperties });
  const fetcher = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const signedIn = new Headers(init.headers).get('Authorization') === 'Bearer token';
    const apiKey = url.searchParams.get('key');
    if (!signedIn && !(apiKey === 'browser-key' && method === 'GET')) return json({ error: 'unauthorized' }, 401);
    const id = url.pathname.match(/\/files\/([^/]+)/)?.[1];
    if (url.pathname.endsWith('/about')) return json({ user: { displayName: 'Paulo', emailAddress: 'p@example.com' } });
    if (id && url.pathname.endsWith('/permissions')) { files.get(id)!.anyone = true; return json({ id: 'perm' }); }
    if (method === 'GET' && !id) {
      const q = url.searchParams.get('q') ?? '';
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const prop = q.match(/key='([^']+)' and value='([^']+)'/);
      const mime = q.match(/mimeType = '([^']+)'/)?.[1];
      const found = [...files.values()].filter(file => (!parent || file.parents.includes(parent)) && (!prop || file.appProperties[prop[1]] === prop[2]) && (!mime || file.mimeType === mime));
      return json({ files: found.map(meta) });
    }
    if (method === 'POST' && !id) {
      let metadata: Record<string, unknown>, body = new Blob([]);
      if (init.body instanceof FormData) { metadata = JSON.parse(await (init.body.get('metadata') as Blob).text()); body = init.body.get('file') as Blob; }
      else metadata = JSON.parse(String(init.body));
      const file: File = { id: `file-${next++}`, name: String(metadata.name), parents: (metadata.parents as string[]) ?? [], mimeType: metadata.mimeType as string | undefined, appProperties: (metadata.appProperties as Record<string, string>) ?? {}, body, version: 1, anyone: false };
      files.set(file.id, file);
      return json(meta(file));
    }
    const file = id ? files.get(id) : undefined;
    if (!file || (!signedIn && !file.anyone)) return json({ error: 'not found' }, 404);
    if (method === 'PATCH') { file.body = init.body as Blob; file.version++; return json(meta(file)); }
    if (method === 'DELETE') { files.delete(file.id); return new Response(null, { status: 204 }); }
    if (url.searchParams.get('alt') === 'media') { const response = new Response(file.body, { status: 200 }); hooks.afterDownload?.(file); return response; }
    return json(meta(file));
  });
  return { files, fetcher, hooks };
}

const image = 'data:image/png;base64,' + Buffer.from('a picture').toString('base64');
const library = async (files: ReturnType<typeof fakeDrive>['files']) => parseDriveLibrary(await [...files.values()].find(file => file.appProperties.kind === 'library')!.body.text());
const wipeDevice = async () => { await cardDb.cards.clear(); await cardDb.collections.clear(); await cardDb.tombstones.clear(); };

beforeEach(async () => { await wipeDevice(); });

describe('Drive sync against a fake Drive', () => {
  it('moves a library to a second device, images included, and carries deletions back', async () => {
    const { files, fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    expect(await findOrCreateRoot(drive)).toBe(rootId); // found again, not duplicated

    // Device A: a note and an image in a collection.
    const note = createCardFromInput({ type: 'text', title: 'A note', note: 'hello' });
    const picture = createCardFromInput({ type: 'image', title: 'A picture', dataUrl: image });
    await saveCard(note); await saveCard(picture);
    await saveCollection(createCollectionFromInput({ name: 'Mood', cardIds: [note.id, picture.id] }));
    await syncLibrary(drive, rootId);
    const stored = await library(files);
    expect(stored.cards).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain(image.split(',')[1]); // images are separate files
    const mediaFiles = [...files.values()].filter(file => file.appProperties.kind === 'media');
    expect(mediaFiles).toHaveLength(1);

    // Device B starts empty and receives everything.
    await wipeDevice();
    const summary = await syncLibrary(drive, rootId);
    expect(summary.received).toBeGreaterThanOrEqual(3);
    const received = await cardDb.cards.get(picture.id);
    expect(received?.dataUrl).toBe(image);
    expect((await cardDb.collections.toArray())[0].cardIds).toHaveLength(2);

    // B deletes the picture: Drive drops the card and its image file.
    await removeCard(picture.id);
    await syncLibrary(drive, rootId);
    expect((await library(files)).cards.map(card => card.id)).toEqual([note.id]);
    expect([...files.values()].filter(file => file.appProperties.kind === 'media')).toHaveLength(0);

    // A (still holding the picture) syncs: the deletion reaches it.
    await wipeDevice();
    await saveCard(picture); await saveCard(note);
    await syncLibrary(drive, rootId);
    expect(await cardDb.cards.get(picture.id)).toBeUndefined();
    expect(await cardDb.cards.get(note.id)).toBeDefined();
  });

  it('newer edits win in both directions', async () => {
    const { fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const card: CardRecord = { ...createCardFromInput({ type: 'text', title: 'Shared', note: 'v1' }), updatedAt: '2026-10-06T10:00:00.000Z' };
    await saveCard(card); await syncLibrary(drive, rootId);
    // Another device edits later.
    await saveCard({ ...card, note: 'v2 elsewhere', updatedAt: '2026-10-06T11:00:00.000Z' }); await syncLibrary(drive, rootId);
    // This device still has v1 and an older time: it receives v2.
    await saveCard(card);
    await syncLibrary(drive, rootId);
    expect((await cardDb.cards.get(card.id))?.note).toBe('v2 elsewhere');
  });

  it('redoes the merge when another device saved in between, so nothing is overwritten', async () => {
    const { files, fetcher, hooks } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const first = createCardFromInput({ type: 'text', title: 'First' });
    await saveCard(first);
    await syncLibrary(drive, rootId);
    // This device adds a card; another device adds one too, right after this device reads library.json.
    const mine = createCardFromInput({ type: 'text', title: 'Mine' });
    const theirs = createCardFromInput({ type: 'text', title: 'Theirs' });
    await saveCard(mine);
    hooks.afterDownload = file => {
      if (file.appProperties.kind !== 'library') return;
      hooks.afterDownload = undefined;
      void file.body.text().then(text => {
        const library = JSON.parse(text);
        library.cards.push(theirs);
        file.body = new Blob([JSON.stringify(library)]); file.version++;
      });
    };
    await syncLibrary(drive, rootId);
    const titles = (await library(files)).cards.map(card => card.title).sort();
    expect(titles).toEqual(['First', 'Mine', 'Theirs']);
    expect((await cardDb.cards.get(theirs.id))?.title).toBe('Theirs');
  });
});

describe('share links against a fake Drive', () => {
  it('shares, opens without signing in, and stops working when sharing stops', async () => {
    const { files, fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const note = createCardFromInput({ type: 'text', title: 'Lighthouse', note: 'at dusk' });
    const collection = createCollectionFromInput({ name: 'Lighthouses', cardIds: [note.id] });
    const { share, key, url } = await shareCollection(drive, rootId, collection, [note], { name: 'Paulo' }, {});
    expect(url).toMatch(new RegExp(`/s/${share.fileId}#${key}$`));
    const file = files.get(share.fileId)!;
    expect(file.anyone).toBe(true);
    expect(await file.body.text()).not.toContain('Lighthouse'); // encrypted at rest
    expect((await library(files)).shareKeys[collection.id]).toBe(key);
    expect((await listShares(drive, rootId)).map(item => item.collectionId)).toEqual([collection.id]);

    const opened = await loadSharedCollection(share.fileId, key, fetcher as typeof fetch);
    expect(opened.collection.name).toBe('Lighthouses');
    expect(opened.cards[0].note).toBe('at dusk');
    await expect(loadSharedCollection(share.fileId, 'A'.repeat(22), fetcher as typeof fetch)).rejects.toThrow(/does not match/);

    await stopSharing(drive, rootId, share);
    await expect(loadSharedCollection(share.fileId, key, fetcher as typeof fetch)).rejects.toThrow(/turned off/);
    expect((await library(files)).shareKeys).toEqual({});
  });
});

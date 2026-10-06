// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardFromInput, createCollectionFromInput, defaultCanvasStyle, parseDriveLibrary, type CardRecord } from '@visual-library/shared';
import { cardDb, commitCanvasContent, deleteCollection, readCanvasState, removeCard, saveCard, saveCollection } from './cardDb';
import { driveClient, findOrCreateRoot, importDriveCaptures, syncLibrary } from './driveSync';
import { refreshShares } from './shareLinks';
import { listShares, loadSharedCollection, shareCollection, stopSharing } from './shareLinks';

// The browser API key share links use (normally from /api/config on the deployed site).
vi.mock('./googleConfig', () => ({ googleConfig: () => ({ clientId: '', apiKey: 'browser-key' }), loadGoogleConfig: async () => ({ clientId: '', apiKey: 'browser-key' }) }));

/** A tiny in-memory Google Drive that answers the REST calls Duckler makes. */
function fakeDrive() {
  type File = { id: string; name: string; parents: string[]; mimeType?: string; appProperties: Record<string, string>; body: Blob; version: number; anyone: boolean; createdTime: string };
  const files = new Map<string, File>();
  const hooks: { afterDownload?: (file: File) => void } = {};
  let next = 1;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const meta = (file: File) => ({ id: file.id, name: file.name, version: String(file.version), createdTime: file.createdTime, appProperties: file.appProperties });
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
      const file: File = { id: `file-${next++}`, name: String(metadata.name), parents: (metadata.parents as string[]) ?? [], mimeType: metadata.mimeType as string | undefined, appProperties: (metadata.appProperties as Record<string, string>) ?? {}, body, version: 1, anyone: false, createdTime: new Date().toISOString() };
      files.set(file.id, file);
      return json(meta(file));
    }
    const file = id ? files.get(id) : undefined;
    if (!file || (!signedIn && !file.anyone)) return json({ error: 'not found' }, 404);
    if (method === 'PATCH') {
      if (init.body instanceof FormData) { Object.assign(file.appProperties, JSON.parse(await (init.body.get('metadata') as Blob).text()).appProperties); file.body = init.body.get('file') as Blob; }
      else file.body = init.body as Blob;
      file.version++; return json(meta(file));
    }
    if (method === 'DELETE') { files.delete(file.id); return new Response(null, { status: 204 }); }
    if (url.searchParams.get('alt') === 'media') { const response = new Response(file.body, { status: 200 }); hooks.afterDownload?.(file); return response; }
    return json(meta(file));
  });
  return { files, fetcher, hooks };
}

const image = 'data:image/png;base64,' + Buffer.from('a picture').toString('base64');
const library = async (files: ReturnType<typeof fakeDrive>['files']) => parseDriveLibrary(await [...files.values()].find(file => file.appProperties.kind === 'library')!.body.text());
const wipeDevice = async () => { for (const table of [cardDb.cards, cardDb.collections, cardDb.tombstones, cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors, cardDb.canvasLayouts, cardDb.extensionReceipts]) await table.clear(); };

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

  it('skips all work when neither side changed, and syncs again after a change on either side', async () => {
    const { fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    await saveCard(createCardFromInput({ type: 'text', title: 'One' }));
    const first = await syncLibrary(drive, rootId);
    expect(first.skipped).toBe(false);

    fetcher.mockClear();
    const quiet = await syncLibrary(drive, rootId, { known: { version: first.version, localChanged: false } });
    expect(quiet.skipped).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1); // one listing, no downloads or writes

    expect((await syncLibrary(drive, rootId, { known: { version: first.version, localChanged: true } })).skipped).toBe(false);
    expect((await syncLibrary(drive, rootId, { known: { version: 'older', localChanged: false } })).skipped).toBe(false);
  });

  it('sweeps image files nothing points to, but not fresh uploads from another device', async () => {
    const { files, fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    await saveCard(createCardFromInput({ type: 'image', title: 'Kept', dataUrl: image }));
    await syncLibrary(drive, rootId);
    const orphan = await drive.create({ name: 'img-lost', parents: [rootId], appProperties: { kind: 'media', card: 'lost' } }, new Blob(['x']));
    const fresh = await drive.create({ name: 'img-new', parents: [rootId], appProperties: { kind: 'media', card: 'new' } }, new Blob(['y']));
    files.get(orphan.id)!.createdTime = new Date(Date.now() - 2 * 3600_000).toISOString();
    await syncLibrary(drive, rootId, { sweep: true });
    const media = [...files.values()].filter(file => file.appProperties.kind === 'media').map(file => file.id);
    expect(media).not.toContain(orphan.id);
    expect(media).toContain(fresh.id);
    expect(media).toHaveLength(2); // the kept card's image and the fresh upload
  });

  it('carries canvases to another device, newer edits back, and deletes them with their collection', async () => {
    const { fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const note = createCardFromInput({ type: 'text', title: 'Pinned' });
    const board = createCollectionFromInput({ name: 'Board', cardIds: [note.id] });
    await saveCard(note); await saveCollection(board);
    const state = await readCanvasState(board.id); // places the collection's card
    const text = { id: 'label', canvasId: board.id, kind: 'text' as const, x: 10, y: 20, width: 200, height: 80, rotation: 0, zIndex: 1, style: defaultCanvasStyle, text: 'Look here', fontSize: 18 };
    await commitCanvasContent(board.id, state.document.revision, { placements: state.placements, elements: [text], connectors: [] });
    await syncLibrary(drive, rootId);

    // Device B starts empty and receives the board with its drawing.
    await wipeDevice();
    await syncLibrary(drive, rootId);
    expect((await cardDb.canvasElements.where('canvasId').equals(board.id).toArray()).map(item => item.text)).toEqual(['Look here']);
    expect(await cardDb.canvasPlacements.where('canvasId').equals(board.id).count()).toBe(1);

    // B edits the label later; A (still on the old version) receives it.
    const onB = await readCanvasState(board.id);
    await new Promise(resolve => setTimeout(resolve, 5));
    await commitCanvasContent(board.id, onB.document.revision, { placements: onB.placements, elements: [{ ...text, text: 'Edited on B' }], connectors: [] });
    await syncLibrary(drive, rootId);
    await cardDb.canvasElements.put({ ...text, text: 'Look here' });
    await cardDb.canvases.put({ ...state.document, updatedAt: '2000-01-01T00:00:00.000Z' });
    await syncLibrary(drive, rootId);
    expect((await cardDb.canvasElements.get('label'))?.text).toBe('Edited on B');

    // Deleting the collection removes its canvas on the other device too.
    await deleteCollection(board.id);
    await syncLibrary(drive, rootId);
    await cardDb.canvases.put({ ...state.document });
    await cardDb.canvasElements.put(text);
    await syncLibrary(drive, rootId);
    expect(await cardDb.canvases.get(board.id)).toBeUndefined();
    expect(await cardDb.canvasElements.get('label')).toBeUndefined();
  });

  it('imports captures the extension sent to the account, once, and drops invalid ones', async () => {
    const { files, fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const capture = { id: 'cap-1', kind: 'bookmark', title: 'Read later', sourceUrl: 'https://example.com/post', note: 'From the extension', createdAt: '2026-10-07T10:00:00.000Z' };
    const put = (body: unknown, id: string) => drive.create({ name: `capture-${id}.json`, parents: [rootId], appProperties: { kind: 'capture', capture: id } }, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    await put(capture, 'cap-1');
    await put({ ...capture, id: 'cap-2', sourceUrl: 'javascript:alert(1)' }, 'cap-2'); // fails validation
    expect(await importDriveCaptures(drive, rootId)).toBe(1);
    const cards = await cardDb.cards.toArray();
    expect(cards.map(card => card.title)).toEqual(['Read later']);
    expect(cards[0].sourceUrl).toBe('https://example.com/post');
    expect([...files.values()].filter(file => file.appProperties.kind === 'capture')).toHaveLength(0); // both removed

    // The same capture arriving again (e.g. a retry) does not make a second card.
    await put(capture, 'cap-1');
    expect(await importDriveCaptures(drive, rootId)).toBe(0);
    expect(await cardDb.cards.count()).toBe(1);
  });

  it('encodes file ids in request paths', async () => {
    const { fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    await drive.remove('../about?x=1');
    expect(String(fetcher.mock.calls.at(-1)![0])).toContain('/files/..%2Fabout%3Fx%3D1');
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

  it('re-publishes a changed collection once, not on every sync', async () => {
    const { fetcher } = fakeDrive();
    const drive = driveClient('token', fetcher as typeof fetch);
    const rootId = await findOrCreateRoot(drive);
    const note = createCardFromInput({ type: 'text', title: 'Pier' });
    const collection = createCollectionFromInput({ name: 'Piers', cardIds: [note.id] });
    const { key } = await shareCollection(drive, rootId, collection, [note], { name: 'Paulo' }, {});
    const edited = { ...note, title: 'Pier at noon', updatedAt: new Date(Date.now() + 1000).toISOString() };
    const keys = { [collection.id]: key };
    const updates = () => fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH').length;

    const before = updates();
    vi.setSystemTime(Date.now() + 5000); // the refresh happens after the edit
    await refreshShares(drive, await listShares(drive, rootId), keys, [collection], [edited], { name: 'Paulo' });
    expect(updates()).toBe(before + 1);
    // The next sync reads the saved sharedAt back from Drive: nothing to re-publish.
    await refreshShares(drive, await listShares(drive, rootId), keys, [collection], [edited], { name: 'Paulo' });
    expect(updates()).toBe(before + 1);
    vi.useRealTimers();
  });

  it('refuses a link whose file is larger than any share can be', async () => {
    const huge = vi.fn(async () => new Response(new Uint8Array(16), { status: 200, headers: { 'Content-Length': String(61 * 1024 * 1024) } }));
    await expect(loadSharedCollection('abcdefghijkl', 'A'.repeat(22), huge as unknown as typeof fetch)).rejects.toThrow(/too large/);
  });
});

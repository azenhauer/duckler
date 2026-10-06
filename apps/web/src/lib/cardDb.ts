import Dexie, { type Table } from 'dexie';
import type { Tombstone, CardRecord, CollectionRecord, CanvasLayout, CanvasDocument, CanvasPlacement, CanvasElement, CanvasConnector, CanvasState, CanvasContent, CanvasBackup, LibraryBackup, SyncedCanvas } from '@visual-library/shared';
import { buildSearchText, createCardFromInput, createCollectionFromInput, createCanvasPlacement, canvasCardPosition, validateCanvasContent } from '@visual-library/shared';
import { type Capture, hashBytes, MAX_CAPTURE_BYTES, validateCapture } from '../../../../packages/shared/src/captureProtocol';

type ExtensionReceipt = { id: string; hash: string; libraryId: string; savedAt: string };

class VisualLibraryDatabase extends Dexie {
  cards!: Table<CardRecord, string>;
  collections!: Table<CollectionRecord, string>;
  extensionReceipts!: Table<ExtensionReceipt, string>;
  canvasLayouts!: Table<CanvasLayout, string>;
  canvases!: Table<CanvasDocument, string>;
  canvasPlacements!: Table<CanvasPlacement, string>;
  canvasElements!: Table<CanvasElement, string>;
  canvasConnectors!: Table<CanvasConnector, string>;
  /** Deleted cards and collections, so Drive sync can delete them on other devices too. */
  tombstones!: Table<Tombstone, string>;

  constructor(name = 'visual-library-db') {
    super(name);
    this.version(2).stores({
      cards: '&id, type, trashed, createdAt, updatedAt, searchText',
      collections: '&id, name, createdAt, updatedAt',
    });
    this.version(3).stores({ extensionReceipts: '&id, libraryId' });
    this.version(4).stores({ canvasLayouts: '&collectionId, updatedAt' });
    this.version(5).stores({ canvases: '&id, updatedAt', canvasPlacements: '&id, canvasId, cardId', canvasElements: '&id, canvasId, anchorPlacementId', canvasConnectors: '&id, canvasId, sourceId, targetId' });
    this.version(6).stores({ tombstones: '&id, deletedAt' });
  }
}

/**
 * One library per Google account on this device, plus the signed-out library. Without this, the
 * next person to sign in on a shared browser would get (and sync to their Drive) the previous
 * person's cards. Database names use a hash of the account, never the email itself.
 */
const LIBRARY_KEY = 'duckler-active-library';
const LOCAL_DB = 'visual-library-db';
const databaseName = (library: string) => (library ? `${LOCAL_DB}~${library}` : LOCAL_DB);
const storedLibrary = () => { try { return localStorage.getItem(LIBRARY_KEY) ?? ''; } catch { return ''; } };
let activeLibraryKey = storedLibrary();

/** The library on this device: a live binding, replaced when the account changes (see switchLibrary). */
export let cardDb = new VisualLibraryDatabase(databaseName(activeLibraryKey));

/** Fired (debounced) after the library changes on this device, so Drive sync can follow. Sync's own writes are silent. */
export const LIBRARY_CHANGED_EVENT = 'duckler-library-changed';
let applyingSync = false;
let changeTimer: ReturnType<typeof setTimeout> | undefined;
const changed = () => {
  if (applyingSync || typeof window === 'undefined') return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT)), 50);
};
function watchChanges(db: VisualLibraryDatabase) {
  for (const table of [db.cards, db.collections]) {
    table.hook('creating', () => { changed(); });
    table.hook('updating', (modifications: object) => {
      // Saving a grid thumbnail is a local cache, not an edit.
      if (!(Object.keys(modifications).length === 1 && 'thumb' in modifications)) changed();
    });
    table.hook('deleting', () => { changed(); });
  }
  // Every canvas edit rewrites its document (revision, updatedAt), so watching that table is enough.
  // Opening a canvas re-saves an unchanged document, which is not an edit.
  db.canvases.hook('creating', () => { changed(); });
  db.canvases.hook('updating', (modifications: object) => { if (Object.keys(modifications).length) changed(); });
}
watchChanges(cardDb);

/** A short, stable key for an account (SHA-256 of the lower-cased email). */
export async function libraryKeyFor(email: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase())));
  return Array.from(digest.slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
}
export const activeLibrary = () => activeLibraryKey;

const LIBRARY_TABLES = ['cards', 'collections', 'tombstones', 'canvases', 'canvasPlacements', 'canvasElements', 'canvasConnectors', 'canvasLayouts', 'extensionReceipts'] as const;
const hasContent = async (db: VisualLibraryDatabase) => (await db.cards.count()) + (await db.collections.count()) > 0;

/** Cards and collections in the signed-out library of this device (offered to an account on its first sign-in). */
export async function localLibrarySize(): Promise<number> {
  const local = activeLibraryKey ? new VisualLibraryDatabase(LOCAL_DB) : cardDb;
  try { return (await local.cards.count()) + (await local.collections.count()); } finally { if (local !== cardDb) local.close(); }
}
export async function libraryIsEmpty(library: string): Promise<boolean> {
  if (library === activeLibraryKey) return !(await hasContent(cardDb));
  if (!(await Dexie.exists(databaseName(library)))) return true;
  const db = new VisualLibraryDatabase(databaseName(library));
  try { return !(await hasContent(db)); } finally { db.close(); }
}

/**
 * Makes `library` ('' = signed out) the one this device shows. `bringLocal` moves the signed-out
 * library into it (first sign-in on a device that already had cards); otherwise each library keeps
 * its own data. `forget` deletes the library being left (signing out on a shared computer).
 */
export async function switchLibrary(library: string, options: { bringLocal?: boolean; forget?: boolean } = {}): Promise<void> {
  if (library === activeLibraryKey && !options.bringLocal) return;
  const leaving = cardDb, leavingKey = activeLibraryKey;
  const next = library === leavingKey ? leaving : new VisualLibraryDatabase(databaseName(library));
  if (options.bringLocal && library) {
    const local = leavingKey === '' ? leaving : new VisualLibraryDatabase(LOCAL_DB);
    applyingSync = true; // a move, not an edit; the next sync merges it with Drive
    try {
      for (const name of LIBRARY_TABLES) {
        const rows = await local.table(name).toArray();
        if (rows.length) await next.table(name).bulkPut(rows);
      }
      // Moved, not copied: the next person on this browser does not get them.
      await local.transaction('rw', LIBRARY_TABLES.map(name => local.table(name)), async () => { for (const name of LIBRARY_TABLES) await local.table(name).clear(); });
    } finally {
      applyingSync = false;
      if (local !== leaving) local.close();
    }
  }
  if (next !== leaving) {
    watchChanges(next);
    cardDb = next;
    activeLibraryKey = library;
    try { if (library) localStorage.setItem(LIBRARY_KEY, library); else localStorage.removeItem(LIBRARY_KEY); } catch { /* private mode: this session only */ }
    leaving.close();
    if (options.forget && leavingKey) await Dexie.delete(databaseName(leavingKey));
  }
}

export const readTombstones = () => cardDb.tombstones.toArray();

async function removeCanvasObjects(canvasId: string, withDocument: boolean) {
  await cardDb.canvasPlacements.where('canvasId').equals(canvasId).delete();
  await cardDb.canvasElements.where('canvasId').equals(canvasId).delete();
  await cardDb.canvasConnectors.where('canvasId').equals(canvasId).delete();
  if (withDocument) { await cardDb.canvases.delete(canvasId); await cardDb.canvasLayouts.delete(canvasId); }
}

/** Applies a Drive merge on this device in one transaction, without counting it as a local change. */
export async function applySyncedLibrary(change: { cardsToWrite: CardRecord[]; collectionsToWrite: CollectionRecord[]; cardsToDelete: string[]; collectionsToDelete: string[]; tombstones: Tombstone[]; canvasesToWrite?: SyncedCanvas[]; canvasesToDelete?: string[] }) {
  applyingSync = true;
  try {
    await cardDb.transaction('rw', [cardDb.cards, cardDb.collections, cardDb.tombstones, cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors, cardDb.canvasLayouts], async () => {
      for (const id of change.canvasesToDelete ?? []) await removeCanvasObjects(id, true);
      for (const canvas of change.canvasesToWrite ?? []) {
        const local = await cardDb.canvases.get(canvas.document.id);
        await removeCanvasObjects(canvas.document.id, false);
        await cardDb.canvasPlacements.bulkPut(canvas.placements);
        await cardDb.canvasElements.bulkPut(canvas.elements);
        await cardDb.canvasConnectors.bulkPut(canvas.connectors);
        // A new local revision, so a tab still showing the old board is told to reload instead of overwriting it.
        await cardDb.canvases.put({ ...canvas.document, revision: Math.max(canvas.document.revision, local?.revision ?? 0) + 1 });
      }
      if (change.cardsToDelete.length) await cardDb.cards.bulkDelete(change.cardsToDelete);
      if (change.collectionsToDelete.length) await cardDb.collections.bulkDelete(change.collectionsToDelete);
      if (change.cardsToWrite.length) await cardDb.cards.bulkPut(change.cardsToWrite.map(card => ({ ...card, searchText: buildSearchText(card) })));
      if (change.collectionsToWrite.length) await cardDb.collections.bulkPut(change.collectionsToWrite);
      await cardDb.tombstones.clear();
      if (change.tombstones.length) await cardDb.tombstones.bulkPut(change.tombstones);
    });
  } finally { applyingSync = false; }
}

// searchText is rebuilt on read so search always matches the card as stored (e.g. OCR that no longer
// matches its image, or restored/synced cards that carried a stale or empty index).
export const readCards = async (): Promise<CardRecord[]> =>
  (await cardDb.cards.orderBy('createdAt').reverse().toArray()).map(card => ({ ...card, searchText: buildSearchText(card) }));

export const readCollections = async (): Promise<CollectionRecord[]> =>
  cardDb.collections.orderBy('updatedAt').reverse().toArray();

/** Connects (or disconnects) two cards on both sides in one transaction; returns both stored cards. */
export const linkCards = async (aId: string, bId: string, connect = true): Promise<[CardRecord, CardRecord]> => {
  if (aId === bId) throw new Error('A card cannot connect to itself');
  return cardDb.transaction('rw', cardDb.cards, async () => {
    const [a, b] = await Promise.all([cardDb.cards.get(aId), cardDb.cards.get(bId)]);
    if (!a || !b) throw new Error('Card no longer exists');
    const now = new Date().toISOString();
    const update = (card: CardRecord, otherId: string): CardRecord => {
      const others = (card.links ?? []).filter(link => link.cardId !== otherId);
      return { ...card, links: connect ? [...others, { cardId: otherId, createdAt: now }] : others, updatedAt: now };
    };
    const next: [CardRecord, CardRecord] = [update(a, bId), update(b, aId)];
    await cardDb.cards.bulkPut(next);
    return next;
  });
};

export const saveCard = async (card: CardRecord): Promise<CardRecord> => {
  await cardDb.cards.put(card);
  return card;
};

/** Stores a card's grid thumbnail without touching anything else (it is a cache, not an edit). */
export const saveCardThumb = async (cardId: string, thumb: NonNullable<CardRecord['thumb']>): Promise<void> => {
  await cardDb.cards.update(cardId, { thumb });
};

export const saveCollection = async (collection: CollectionRecord): Promise<CollectionRecord> => {
  await cardDb.collections.put(collection);
  return collection;
};

export const removeCard = async (cardId: string): Promise<void> => {
  await cardDb.transaction('rw', cardDb.cards, cardDb.collections, cardDb.tombstones, async () => {
    await cardDb.cards.delete(cardId);
    await cardDb.tombstones.put({ id: cardId, kind: 'card', deletedAt: new Date().toISOString() });
    await cardDb.collections.filter(collection => collection.cardIds.includes(cardId)).modify(collection => {
      collection.cardIds = collection.cardIds.filter(id => id !== cardId);
      collection.updatedAt = new Date().toISOString();
    });
  });
};

/**
 * Undo for deleted cards: puts them back with a new updatedAt (newer than their deletion, so Drive
 * sync brings them back everywhere even if it already spread the deletion), drops their local
 * deletion records and returns them to the collections they were in that still exist.
 */
export const restoreCards = async (cards: CardRecord[], memberships: Record<string, string[]>): Promise<{ cards: CardRecord[]; collections: CollectionRecord[] }> =>
  cardDb.transaction('rw', cardDb.cards, cardDb.collections, cardDb.tombstones, async () => {
    const now = new Date().toISOString();
    const restored = cards.map(card => ({ ...card, updatedAt: now }));
    await cardDb.cards.bulkPut(restored);
    await cardDb.tombstones.bulkDelete(cards.map(card => card.id));
    const changed: CollectionRecord[] = [];
    for (const [collectionId, cardIds] of Object.entries(memberships)) {
      const collection = await cardDb.collections.get(collectionId);
      if (!collection) continue;
      const next = { ...collection, cardIds: [...new Set([...collection.cardIds, ...cardIds])], updatedAt: now };
      await cardDb.collections.put(next);
      changed.push(next);
    }
    return { cards: restored, collections: changed };
  });

// Change one relationship against current storage, never restore a collection snapshot.
export const setCardCollectionMembership = async (
  cardId: string, collectionId: string, included: boolean,
): Promise<CollectionRecord> => cardDb.transaction('rw', cardDb.cards, cardDb.collections, async () => {
  const card = await cardDb.cards.get(cardId);
  const collection = await cardDb.collections.get(collectionId);
  if (!card) throw new Error('Card no longer exists');
  if (!collection) throw new Error('Collection no longer exists');
  if (collection.cardIds.includes(cardId) === included) return collection;
  const updated = {
    ...collection,
    cardIds: included ? [...collection.cardIds, cardId] : collection.cardIds.filter(id => id !== cardId),
    updatedAt: new Date().toISOString(),
  };
  await cardDb.collections.put(updated);
  return updated;
});

export const deleteCollection = async (collectionId: string): Promise<void> => {
  await cardDb.transaction('rw', [cardDb.collections, cardDb.tombstones, cardDb.canvasLayouts, cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors], async () => {
    await cardDb.collections.delete(collectionId);
    await cardDb.tombstones.put({ id: collectionId, kind: 'collection', deletedAt: new Date().toISOString() });
    // Sub-collections of a deleted parent move to the top level; their cards are untouched.
    const children = await cardDb.collections.filter(item => item.parentId === collectionId).toArray();
    if (children.length) await cardDb.collections.bulkPut(children.map(({ parentId: _parent, ...rest }) => ({ ...rest, updatedAt: new Date().toISOString() })));
    await cardDb.canvasLayouts.delete(collectionId);
    await cardDb.canvases.delete(collectionId);
    await cardDb.canvasPlacements.where('canvasId').equals(collectionId).delete();
    await cardDb.canvasElements.where('canvasId').equals(collectionId).delete();
    await cardDb.canvasConnectors.where('canvasId').equals(collectionId).delete();
  });
};

export const readCanvasLayout = (collectionId: string) => cardDb.canvasLayouts.get(collectionId);
export const saveCanvasLayout = async (layout: CanvasLayout): Promise<void> => { await cardDb.canvasLayouts.put(layout); };

export const saveCardWithCollections = async (card: CardRecord, collections: CollectionRecord[]): Promise<void> => {
  await cardDb.transaction('rw', cardDb.cards, cardDb.collections, async () => {
    await cardDb.cards.put(card);
    if (collections.length) await cardDb.collections.bulkPut(collections);
  });
};

// Commit the Card and permanent receipt together; retries never overwrite edits or trash state.
export async function importExtensionBytes(bytes: Uint8Array, expected: { id: string; hash: string; libraryId: string }) {
  if (bytes.length > MAX_CAPTURE_BYTES || await hashBytes(bytes) !== expected.hash) throw new Error('Capture checksum does not match. The item remains in the extension.');
  const capture: Capture = validateCapture(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (capture.id !== expected.id) throw new Error('Capture ID does not match its envelope.');
  // Parse/render before opening the IndexedDB transaction: PDF work is asynchronous.
  let pdfContent: Awaited<ReturnType<typeof import('./pdf')['readPdfFile']>> | undefined;
  if (capture.kind === 'pdf' && !await cardDb.extensionReceipts.get(capture.id)) {
    const binary = atob(capture.payload!.split(',')[1]);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const { readPdfFile } = await import('./pdf');
    pdfContent = await readPdfFile(new File([bytes], `${capture.title.slice(0, 250)}.pdf`, { type: 'application/pdf' }));
  }
  return cardDb.transaction('rw', cardDb.cards, cardDb.collections, cardDb.extensionReceipts, async () => {
    const receipt = await cardDb.extensionReceipts.get(capture.id);
    if (receipt && (receipt.hash !== expected.hash || receipt.libraryId !== expected.libraryId)) throw new Error('This capture ID has a conflicting payload or library.');
    const existing = await cardDb.cards.get(capture.id);
    if (receipt) return { card: existing, duplicate: true };
    if (existing && existing.capturePayloadHash !== expected.hash) throw new Error('A different card already uses this capture ID.');
    const created = existing ?? {
      ...createCardFromInput({ id: capture.id, type: capture.kind === 'pdf' ? 'pdf' : capture.kind === 'image' || capture.kind === 'screenshot' ? 'image' : capture.kind === 'text' ? 'text' : 'bookmark',
        title: capture.title, sourceUrl: capture.sourceUrl, note: capture.note, caption: capture.caption, tags: capture.tags,
        dataUrl: pdfContent?.thumbnail ?? (['image', 'screenshot'].includes(capture.kind) ? capture.payload : undefined) }),
      ...(pdfContent ? { pdf: pdfContent.pdf } : {}),
      ...(capture.color ? { color: capture.color } : {}),
      createdAt: capture.createdAt, capturePayloadHash: expected.hash,
    };
    if (!existing) await cardDb.cards.add({ ...created, searchText: buildSearchText(created) });
    const selectedIds = new Set(capture.collectionIds ?? []);
    for (const collectionName of [...(capture.collectionNames ?? []), ...(capture.collectionName ? [capture.collectionName] : [])]) {
      const collection = await cardDb.collections.filter(item => item.name.toLowerCase() === collectionName.toLowerCase()).first();
      if (collection) selectedIds.add(collection.id);
      else {
        const createdCollection = createCollectionFromInput({ name: collectionName, cardIds: [created.id] });
        await cardDb.collections.put(createdCollection);
        selectedIds.add(createdCollection.id);
      }
    }
    for (const collectionId of selectedIds) {
      const collection = await cardDb.collections.get(collectionId);
      if (collection && !collection.cardIds.includes(created.id)) await cardDb.collections.put({ ...collection, cardIds: [...collection.cardIds, created.id], updatedAt: new Date().toISOString() });
    }
    await cardDb.extensionReceipts.add({ id: capture.id, hash: expected.hash, libraryId: expected.libraryId, savedAt: new Date().toISOString() });
    return { card: created, duplicate: Boolean(existing) };
  });
}


const canvasTables = () => [cardDb.collections, cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors, cardDb.canvasLayouts];
export async function readCanvasState(collectionId: string): Promise<CanvasState> {
  return cardDb.transaction('rw', canvasTables(), async () => {
    const collection = await cardDb.collections.get(collectionId);
    if (!collection) throw new Error('Collection no longer exists');
    const legacy = await cardDb.canvasLayouts.get(collectionId);
    const now = new Date().toISOString();
    let document = await cardDb.canvases.get(collectionId) ?? { id: collectionId, title: collection.name, createdAt: now, updatedAt: now, revision: 0, seenCardIds: [] };
    const placements = await cardDb.canvasPlacements.where('canvasId').equals(collectionId).toArray();
    const unseen = [...new Set(collection.cardIds)].filter(id => !document.seenCardIds.includes(id)).slice(0, Math.max(0, 200 - placements.length));
    const added = unseen.map((id, index) => createCanvasPlacement(collectionId, id, canvasCardPosition(id, placements.length + index, legacy)));
    if (added.length) {
      await cardDb.canvasPlacements.bulkPut(added);
      document = { ...document, seenCardIds: [...document.seenCardIds, ...unseen], revision: document.revision + 1, updatedAt: now };
    }
    document = { ...document, title: collection.name };
    await cardDb.canvases.put(document);
    const elements = await cardDb.canvasElements.where('canvasId').equals(collectionId).toArray();
    const connectors = await cardDb.canvasConnectors.where('canvasId').equals(collectionId).toArray();
    const content = { placements: [...placements, ...added], elements, connectors };
    validateCanvasContent(collectionId, content);
    const viewport = legacy?.viewport;
    return { document, ...content, viewport: viewport && [viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) && viewport.zoom >= .15 && viewport.zoom <= 2 ? viewport : undefined };
  });
}

// A complete gesture is one atomic command. Revision checks also protect undo against other tabs.
export async function commitCanvasContent(canvasId: string, expectedRevision: number, content: CanvasContent): Promise<CanvasDocument> {
  validateCanvasContent(canvasId, content);
  return cardDb.transaction('rw', canvasTables(), async () => {
    if (!await cardDb.collections.get(canvasId)) throw new Error('Collection no longer exists');
    const document = await cardDb.canvases.get(canvasId);
    if (!document || document.revision !== expectedRevision) throw new Error('Canvas changed elsewhere. Reload before changing it.');
    for (const [table, objects] of [
      [cardDb.canvasPlacements, content.placements], [cardDb.canvasElements, content.elements], [cardDb.canvasConnectors, content.connectors],
    ] as const) {
      // Preserve independent object records; write/delete only the objects changed by this command.
      const current = await table.where('canvasId').equals(canvasId).toArray();
      const incoming = new Map(objects.map(object => [object.id, object]));
      const deleted = current.filter(object => !incoming.has(object.id)).map(object => object.id);
      if (deleted.length) await table.bulkDelete(deleted);
      const previous = new Map(current.map(object => [object.id, JSON.stringify(object)]));
      for (const object of objects) {
        const other = await table.get(object.id);
        if (other && other.canvasId !== canvasId) throw new Error('Invalid canvas reference');
        if (previous.get(object.id) !== JSON.stringify(object)) await (table as Table<CanvasPlacement | CanvasElement | CanvasConnector, string>).put(object);
      }
    }
    const next = { ...document, revision: document.revision + 1, updatedAt: new Date().toISOString() };
    await cardDb.canvases.put(next);
    return next;
  });
}

export async function saveCanvasBackground(canvasId: string, background: string | undefined): Promise<void> {
  if (background !== undefined && !/^#[0-9a-f]{6}$/i.test(background)) throw new Error('Invalid board background');
  await cardDb.transaction('rw', cardDb.canvases, async () => {
    const document = await cardDb.canvases.get(canvasId);
    if (!document) throw new Error('Canvas no longer exists');
    const { background: _previous, ...rest } = document;
    const updated = { ...rest, updatedAt: new Date().toISOString() };
    await cardDb.canvases.put(background ? { ...updated, background } : updated);
  });
}

export async function saveCanvasViewport(canvasId: string, viewport: CanvasState['viewport']): Promise<void> {
  if (!viewport || ![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) || viewport.zoom < .15 || viewport.zoom > 2) throw new Error('Invalid canvas viewport');
  await cardDb.transaction('rw', cardDb.collections, cardDb.canvasLayouts, async () => {
    if (!await cardDb.collections.get(canvasId)) throw new Error('Collection no longer exists');
    const layout = await cardDb.canvasLayouts.get(canvasId);
    await cardDb.canvasLayouts.put({ ...layout, collectionId: canvasId, positions: layout?.positions ?? {}, viewport, updatedAt: new Date().toISOString() });
  });
}

/** Every canvas as Drive sync stores it: the backup form without the per-device viewport. */
export const readSyncCanvases = async (): Promise<SyncedCanvas[]> => (await readCanvasBackups()).map(({ viewport: _viewport, ...canvas }) => canvas);

/** Every stored canvas with its objects, for the native backup. */
export async function readCanvasBackups(): Promise<CanvasBackup[]> {
  return cardDb.transaction('r', [cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors, cardDb.canvasLayouts], async () => {
    const documents = await cardDb.canvases.toArray();
    return Promise.all(documents.map(async document => {
      const [placements, elements, connectors, layout] = await Promise.all([
        cardDb.canvasPlacements.where('canvasId').equals(document.id).toArray(),
        cardDb.canvasElements.where('canvasId').equals(document.id).toArray(),
        cardDb.canvasConnectors.where('canvasId').equals(document.id).toArray(),
        cardDb.canvasLayouts.get(document.id),
      ]);
      return { document, placements, elements, connectors, ...(layout?.viewport ? { viewport: layout.viewport } : {}) };
    }));
  });
}

export type RestoreReport = { cardsAdded: number; collectionsAdded: number; canvasesAdded: number; skipped: number };

/**
 * Additive restore: records whose ID already exists locally are kept as they are and counted as skipped.
 * A canvas is restored only as a whole and only when this device has no canvas with that ID.
 */
export async function restoreLibraryBackup(backup: LibraryBackup): Promise<RestoreReport> {
  const report: RestoreReport = { cardsAdded: 0, collectionsAdded: 0, canvasesAdded: 0, skipped: 0 };
  await cardDb.transaction('rw', [cardDb.cards, ...canvasTables()], async () => {
    for (const card of backup.cards) {
      if (await cardDb.cards.get(card.id)) { report.skipped++; continue; }
      await cardDb.cards.add(card); report.cardsAdded++;
    }
    for (const collection of backup.collections) {
      if (await cardDb.collections.get(collection.id)) { report.skipped++; continue; }
      await cardDb.collections.add(collection); report.collectionsAdded++;
    }
    for (const canvas of backup.canvases) {
      const id = canvas.document.id;
      const ids = [...canvas.placements, ...canvas.elements, ...canvas.connectors].map(object => object.id);
      const taken = await Promise.all([
        cardDb.canvases.get(id), cardDb.canvasPlacements.bulkGet(ids), cardDb.canvasElements.bulkGet(ids), cardDb.canvasConnectors.bulkGet(ids),
      ]);
      if (taken[0] || taken.slice(1).some(found => (found as unknown[]).some(Boolean))) { report.skipped++; continue; }
      await cardDb.canvases.add(canvas.document);
      await cardDb.canvasPlacements.bulkAdd(canvas.placements);
      await cardDb.canvasElements.bulkAdd(canvas.elements);
      await cardDb.canvasConnectors.bulkAdd(canvas.connectors);
      if (canvas.viewport) {
        const layout = await cardDb.canvasLayouts.get(id);
        await cardDb.canvasLayouts.put({ ...layout, collectionId: id, positions: layout?.positions ?? {}, viewport: canvas.viewport, updatedAt: new Date().toISOString() });
      }
      report.canvasesAdded++;
    }
  });
  return report;
}

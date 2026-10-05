import Dexie, { type Table } from 'dexie';
import type { CardRecord, CollectionRecord, CanvasLayout, CanvasDocument, CanvasPlacement, CanvasElement, CanvasConnector, CanvasState, CanvasContent, CanvasBackup, LibraryBackup } from '@visual-library/shared';
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

  constructor() {
    super('visual-library-db');
    this.version(2).stores({
      cards: '&id, type, trashed, createdAt, updatedAt, searchText',
      collections: '&id, name, createdAt, updatedAt',
    });
    this.version(3).stores({ extensionReceipts: '&id, libraryId' });
    this.version(4).stores({ canvasLayouts: '&collectionId, updatedAt' });
    this.version(5).stores({ canvases: '&id, updatedAt', canvasPlacements: '&id, canvasId, cardId', canvasElements: '&id, canvasId, anchorPlacementId', canvasConnectors: '&id, canvasId, sourceId, targetId' });
  }
}

export const cardDb = new VisualLibraryDatabase();

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

export const saveCollection = async (collection: CollectionRecord): Promise<CollectionRecord> => {
  await cardDb.collections.put(collection);
  return collection;
};

export const removeCard = async (cardId: string): Promise<void> => {
  await cardDb.transaction('rw', cardDb.cards, cardDb.collections, async () => {
    await cardDb.cards.delete(cardId);
    await cardDb.collections.filter(collection => collection.cardIds.includes(cardId)).modify(collection => {
      collection.cardIds = collection.cardIds.filter(id => id !== cardId);
      collection.updatedAt = new Date().toISOString();
    });
  });
};

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
  await cardDb.transaction('rw', [cardDb.collections, cardDb.canvasLayouts, cardDb.canvases, cardDb.canvasPlacements, cardDb.canvasElements, cardDb.canvasConnectors], async () => {
    await cardDb.collections.delete(collectionId);
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
    await cardDb.canvases.put(background ? { ...rest, background } : rest);
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

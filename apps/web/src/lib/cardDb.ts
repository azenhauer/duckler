import Dexie, { type Table } from 'dexie';
import type { CardRecord, CollectionRecord, CanvasLayout } from '@visual-library/shared';
import { createCardFromInput } from '@visual-library/shared';
import { type Capture, hashBytes, MAX_CAPTURE_BYTES, validateCapture } from '../../../../packages/shared/src/captureProtocol';

type ExtensionReceipt = { id: string; hash: string; libraryId: string; savedAt: string };

class VisualLibraryDatabase extends Dexie {
  cards!: Table<CardRecord, string>;
  collections!: Table<CollectionRecord, string>;
  extensionReceipts!: Table<ExtensionReceipt, string>;
  canvasLayouts!: Table<CanvasLayout, string>;

  constructor() {
    super('visual-library-db');
    this.version(2).stores({
      cards: '&id, type, trashed, createdAt, updatedAt, searchText',
      collections: '&id, name, createdAt, updatedAt',
    });
    this.version(3).stores({ extensionReceipts: '&id, libraryId' });
    this.version(4).stores({ canvasLayouts: '&collectionId, updatedAt' });
  }
}

export const cardDb = new VisualLibraryDatabase();

export const readCards = async (): Promise<CardRecord[]> =>
  cardDb.cards.orderBy('createdAt').reverse().toArray();

export const readCollections = async (): Promise<CollectionRecord[]> =>
  cardDb.collections.orderBy('updatedAt').reverse().toArray();

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

export const deleteCollection = async (collectionId: string): Promise<void> => {
  await cardDb.transaction('rw', cardDb.collections, cardDb.canvasLayouts, async () => {
    await cardDb.collections.delete(collectionId);
    await cardDb.canvasLayouts.delete(collectionId);
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
  return cardDb.transaction('rw', cardDb.cards, cardDb.extensionReceipts, async () => {
    const receipt = await cardDb.extensionReceipts.get(capture.id);
    if (receipt && (receipt.hash !== expected.hash || receipt.libraryId !== expected.libraryId)) throw new Error('This capture ID has a conflicting payload or library.');
    const existing = await cardDb.cards.get(capture.id);
    if (receipt) return { card: existing, duplicate: true };
    if (existing && existing.capturePayloadHash !== expected.hash) throw new Error('A different card already uses this capture ID.');
    const created = existing ?? {
      ...createCardFromInput({ id: capture.id, type: capture.kind === 'image' || capture.kind === 'screenshot' ? 'image' : capture.kind === 'text' ? 'text' : 'bookmark',
        title: capture.title, sourceUrl: capture.sourceUrl, note: capture.note, tags: capture.tags,
        dataUrl: ['image', 'screenshot'].includes(capture.kind) ? capture.payload : undefined }),
      createdAt: capture.createdAt, capturePayloadHash: expected.hash,
    };
    if (!existing) await cardDb.cards.add(created);
    await cardDb.extensionReceipts.add({ id: capture.id, hash: expected.hash, libraryId: expected.libraryId, savedAt: new Date().toISOString() });
    return { card: created, duplicate: Boolean(existing) };
  });
}

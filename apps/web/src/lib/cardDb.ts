import Dexie, { type Table } from 'dexie';
import type { CardRecord, CollectionRecord } from '@visual-library/shared';

class VisualLibraryDatabase extends Dexie {
  cards!: Table<CardRecord, string>;
  collections!: Table<CollectionRecord, string>;

  constructor() {
    super('visual-library-db');
    this.version(2).stores({
      cards: '&id, type, trashed, createdAt, updatedAt, searchText',
      collections: '&id, name, createdAt, updatedAt',
    });
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
  await cardDb.cards.delete(cardId);
};

export const deleteCollection = async (collectionId: string): Promise<void> => {
  await cardDb.collections.delete(collectionId);
};

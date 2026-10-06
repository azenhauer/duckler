import { z } from 'zod';
import { cardSchema, collectionSchema, type CardRecord, type CollectionRecord } from './index';
import { canvasBackupSchema, type CanvasBackup } from './backup';
import { validateCanvasContent, type CanvasContent } from './canvas';

/**
 * Drive sync model. The library lives in the owner's Drive as `library.json` (cards without their
 * image data, collections, deletions) plus one file per image. Merging is per record: the newer
 * `updatedAt` wins, and a deletion wins over any version older than it, so a card deleted on one
 * device is deleted everywhere, including its image file on Drive.
 *
 * Canvases travel whole (document + placements, drawings, connectors), like in the native backup:
 * the newer `document.updatedAt` wins. A canvas shares its collection's id and is deleted with it.
 * The viewport (zoom/pan) stays on each device.
 */
export const DRIVE_LIBRARY_FORMAT = 1;

export type Tombstone = { id: string; kind: 'card' | 'collection'; deletedAt: string };
/** An image stored as its own Drive file; `of` fingerprints the image data it holds. */
export type MediaRef = { fileId: string; of: string };
export type SyncedCard = Omit<CardRecord, 'dataUrl' | 'thumb'> & { media?: MediaRef };
export type SyncedCanvas = Omit<CanvasBackup, 'viewport'>;

export type DriveLibrary = {
  format: number;
  savedAt: string;
  cards: SyncedCard[];
  collections: CollectionRecord[];
  tombstones: Tombstone[];
  canvases: SyncedCanvas[];
  /** Keys of this owner's share links (collection id → key). Only in their private library file. */
  shareKeys: Record<string, string>;
};

const tombstoneSchema = z.object({ id: z.string().min(1).max(200), kind: z.enum(['card', 'collection']), deletedAt: z.string().max(40) });
const mediaSchema = z.object({ fileId: z.string().min(1).max(200), of: z.string().max(80) });
// Built lazily: this module and index.ts import each other (same as backup.ts).
const driveLibrarySchema = () => z.object({
  format: z.number().int().positive(),
  savedAt: z.string().max(40),
  cards: z.array(cardSchema.omit({ dataUrl: true, thumb: true }).extend({ media: mediaSchema.optional() })).max(100000),
  collections: z.array(collectionSchema).max(10000),
  tombstones: z.array(tombstoneSchema).max(200000).default([]),
  canvases: z.array(canvasBackupSchema).max(10000).default([]),
  shareKeys: z.record(z.string().max(200), z.string().regex(/^[A-Za-z0-9_-]{22}$/)).default({}),
});

export function parseDriveLibrary(json: string): DriveLibrary {
  const parsed = driveLibrarySchema().parse(JSON.parse(json));
  if (parsed.format > DRIVE_LIBRARY_FORMAT) throw new Error('This library was saved by a newer Duckler. Reload the app to update it.');
  // Same checks as a backup import: geometry, field allowlists and limits, objects on their own canvas.
  const canvases = parsed.canvases.map(({ document, placements, elements, connectors }) => {
    const content = { placements, elements, connectors } as unknown as CanvasContent;
    validateCanvasContent(document.id, content);
    return { document, ...content };
  });
  return { ...parsed, canvases };
}

export const emptyDriveLibrary = (): DriveLibrary => ({ format: DRIVE_LIBRARY_FORMAT, savedAt: new Date(0).toISOString(), cards: [], collections: [], tombstones: [], canvases: [], shareKeys: {} });

/** Identifies image data without hashing megabytes (same rule as the grid thumbnails). */
export const mediaFingerprint = (dataUrl: string) => `${dataUrl.length}:${dataUrl.slice(-40)}`;

type Local = { cards: CardRecord[]; collections: CollectionRecord[]; tombstones: Tombstone[]; canvases?: SyncedCanvas[] };

export type MergeResult = {
  cards: CardRecord[];
  collections: CollectionRecord[];
  tombstones: Tombstone[];
  /** Records to write on this device (new or newer on Drive). */
  cardsToWrite: CardRecord[];
  collectionsToWrite: CollectionRecord[];
  cardsToDelete: string[];
  collectionsToDelete: string[];
  canvases: SyncedCanvas[];
  /** Canvases to replace on this device (newer on Drive), and canvases whose collection is gone. */
  canvasesToWrite: SyncedCanvas[];
  canvasesToDelete: string[];
  /** Drive image file of each card whose image is already on Drive. */
  media: Map<string, MediaRef>;
  /** Cards whose image this device has and Drive does not (yet). */
  uploads: string[];
  /** Cards whose image is on Drive but not on this device. */
  downloads: string[];
  /** Image files on Drive that belong to deleted cards or replaced images. */
  mediaToDelete: string[];
  /** Share-link keys, kept for collections that still exist (share functions add and remove them). */
  shareKeys: Record<string, string>;
  /** True when library.json on Drive must be rewritten. */
  remoteChanged: boolean;
};

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);
// Deletions are kept for 180 days, long enough for every device to see them.
const TOMBSTONE_DAYS = 180;

export function mergeLibraries(local: Local, remote: DriveLibrary, now = new Date()): MergeResult {
  const stones = new Map<string, Tombstone>();
  for (const stone of [...local.tombstones, ...remote.tombstones]) {
    const known = stones.get(stone.id);
    if (!known || newer(stone.deletedAt, known.deletedAt)) stones.set(stone.id, stone);
  }
  const deleted = (id: string, updatedAt: string) => { const stone = stones.get(id); return Boolean(stone && !newer(updatedAt, stone.deletedAt)); };
  const result: MergeResult = { cards: [], collections: [], tombstones: [], cardsToWrite: [], collectionsToWrite: [], cardsToDelete: [], collectionsToDelete: [], canvases: [], canvasesToWrite: [], canvasesToDelete: [], media: new Map(), uploads: [], downloads: [], mediaToDelete: [], shareKeys: {}, remoteChanged: false };

  const localCards = new Map(local.cards.map(card => [card.id, card]));
  const remoteCards = new Map(remote.cards.map(card => [card.id, card]));
  for (const id of new Set([...localCards.keys(), ...remoteCards.keys()])) {
    const mine = localCards.get(id), theirs = remoteCards.get(id);
    const remoteWins = Boolean(theirs && (!mine || newer(theirs.updatedAt, mine.updatedAt)));
    if (deleted(id, remoteWins ? theirs!.updatedAt : mine!.updatedAt)) {
      if (mine) result.cardsToDelete.push(id);
      if (theirs) { result.remoteChanged = true; if (theirs.media) result.mediaToDelete.push(theirs.media.fileId); }
      continue;
    }
    stones.delete(id); // a version newer than the deletion brings the card back

    // The record itself: newer updatedAt wins.
    let card: CardRecord;
    if (remoteWins) {
      const { media: _media, ...fields } = theirs!;
      card = { ...fields };
      if (!mine || mine.updatedAt !== theirs!.updatedAt) result.cardsToWrite.push(card);
    } else {
      card = { ...mine! };
      if (!theirs || theirs.updatedAt !== mine!.updatedAt) result.remoteChanged = true;
    }

    // The image: Drive's file and this device's data either match, or the winner decides.
    const remoteMedia = theirs?.media;
    const localImage = mine?.dataUrl;
    const same = Boolean(localImage && remoteMedia && mediaFingerprint(localImage) === remoteMedia.of);
    if (same) {
      card = { ...card, dataUrl: localImage, ...(mine?.thumb ? { thumb: mine.thumb } : {}) };
      result.media.set(id, remoteMedia!);
    } else if (remoteMedia && (remoteWins || !localImage)) {
      // Drive has the current image (or the only one): fetch it. A missing local image never deletes Drive's.
      const { dataUrl: _old, thumb: _thumb, ...rest } = card;
      card = rest;
      result.media.set(id, remoteMedia);
      result.downloads.push(id);
    } else if (localImage) {
      // This device has the current image: upload it, and drop the file it replaces.
      card = { ...card, dataUrl: localImage, ...(mine?.thumb ? { thumb: mine.thumb } : {}) };
      result.uploads.push(id);
      if (remoteMedia) result.mediaToDelete.push(remoteMedia.fileId);
      result.remoteChanged = true;
    }
    result.cards.push(card);
  }

  const localCollections = new Map(local.collections.map(item => [item.id, item]));
  const remoteCollections = new Map(remote.collections.map(item => [item.id, item]));
  for (const id of new Set([...localCollections.keys(), ...remoteCollections.keys()])) {
    const mine = localCollections.get(id), theirs = remoteCollections.get(id);
    const remoteWins = Boolean(theirs && (!mine || newer(theirs.updatedAt, mine.updatedAt)));
    const winner = remoteWins ? theirs! : mine!;
    if (deleted(id, winner.updatedAt)) {
      if (mine) result.collectionsToDelete.push(id);
      if (theirs) result.remoteChanged = true;
      continue;
    }
    stones.delete(id);
    result.collections.push(winner);
    if (remoteWins && (!mine || mine.updatedAt !== theirs!.updatedAt)) result.collectionsToWrite.push(winner);
    if (!remoteWins && (!theirs || theirs.updatedAt !== mine!.updatedAt)) result.remoteChanged = true;
  }

  // Collections only list cards that still exist.
  const live = new Set(result.cards.map(card => card.id));
  result.collections = result.collections.map(item => {
    const cardIds = item.cardIds.filter(cardId => live.has(cardId));
    if (cardIds.length === item.cardIds.length) return item;
    const pruned = { ...item, cardIds };
    const queued = result.collectionsToWrite.indexOf(item);
    if (queued >= 0) result.collectionsToWrite[queued] = pruned; else result.collectionsToWrite.push(pruned);
    result.remoteChanged = true;
    return pruned;
  });

  // Canvases: whole records, newer wins; one whose collection no longer exists goes with it.
  const liveIds = new Set(result.collections.map(item => item.id));
  const localCanvases = new Map((local.canvases ?? []).map(item => [item.document.id, item]));
  const remoteCanvases = new Map(remote.canvases.map(item => [item.document.id, item]));
  for (const id of new Set([...localCanvases.keys(), ...remoteCanvases.keys()])) {
    const mine = localCanvases.get(id), theirs = remoteCanvases.get(id);
    if (!liveIds.has(id)) {
      if (mine) result.canvasesToDelete.push(id);
      if (theirs) result.remoteChanged = true;
      continue;
    }
    const remoteWins = Boolean(theirs && (!mine || newer(theirs.document.updatedAt, mine.document.updatedAt)));
    result.canvases.push(remoteWins ? theirs! : mine!);
    if (remoteWins && (!mine || mine.document.updatedAt !== theirs!.document.updatedAt)) result.canvasesToWrite.push(theirs!);
    if (!remoteWins && (!theirs || theirs.document.updatedAt !== mine!.document.updatedAt)) result.remoteChanged = true;
  }

  const oldest = now.getTime() - TOMBSTONE_DAYS * 86400000;
  result.tombstones = [...stones.values()].filter(stone => Date.parse(stone.deletedAt) >= oldest);
  const onDrive = new Set(remote.tombstones.map(stone => `${stone.id}@${stone.deletedAt}`));
  if (result.tombstones.some(stone => !onDrive.has(`${stone.id}@${stone.deletedAt}`))) result.remoteChanged = true;
  if (result.mediaToDelete.length) result.remoteChanged = true;
  const liveCollections = new Set(result.collections.map(item => item.id));
  for (const [collectionId, key] of Object.entries(remote.shareKeys ?? {})) {
    if (liveCollections.has(collectionId)) result.shareKeys[collectionId] = key; else result.remoteChanged = true;
  }
  return result;
}

/** The library as stored on Drive: no image data, no grid thumbnails, media references instead. */
export function toDriveLibrary(merged: Pick<MergeResult, 'cards' | 'collections' | 'tombstones' | 'media'> & { canvases?: SyncedCanvas[]; shareKeys?: Record<string, string> }, savedAt = new Date().toISOString()): DriveLibrary {
  return {
    format: DRIVE_LIBRARY_FORMAT,
    savedAt,
    cards: merged.cards.map(({ dataUrl: _dataUrl, thumb: _thumb, ...card }) => {
      const media = merged.media.get(card.id);
      return media ? { ...card, media } : card;
    }),
    collections: merged.collections,
    tombstones: merged.tombstones,
    canvases: merged.canvases ?? [],
    shareKeys: merged.shareKeys ?? {},
  };
}

import { z } from 'zod';
import { cardSchema, collectionSchema, normalizeSourceUrl, type CardRecord, type CollectionRecord } from './index';
import { validateCanvasContent, type CanvasContent, type CanvasDocument, type CanvasViewport } from './canvas';

export const LIBRARY_BACKUP_FORMAT = 2;
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;

export type CanvasBackup = CanvasContent & { document: CanvasDocument; viewport?: CanvasViewport };
export type LibraryBackup = {
  formatVersion: number;
  exportedAt: string;
  cards: CardRecord[];
  collections: CollectionRecord[];
  canvases: CanvasBackup[];
};

const canvasDocumentSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(500),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().nonnegative(),
  seenCardIds: z.array(z.string().min(1).max(200)).max(10000),
  background: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
}).strict();
const viewportSchema = z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(.15).max(2) }).strict();
// Geometry, field allowlists and limits are enforced by validateCanvasContent.
const canvasBackupSchema = z.object({
  document: canvasDocumentSchema,
  viewport: viewportSchema.optional(),
  placements: z.array(z.record(z.unknown())),
  elements: z.array(z.record(z.unknown())),
  connectors: z.array(z.record(z.unknown())),
}).strict();
// Built lazily: this module and index.ts import each other.
const backupSchema = () => z.object({
  formatVersion: z.number().int().positive().optional(),
  exportedAt: z.string().optional(),
  cards: z.array(cardSchema).max(100000),
  collections: z.array(collectionSchema).max(10000).default([]),
  canvases: z.array(canvasBackupSchema).max(10000).default([]),
});

export const createLibraryBackup = (cards: CardRecord[], collections: CollectionRecord[], canvases: CanvasBackup[] = [], exportedAt = new Date().toISOString()): LibraryBackup =>
  ({ formatVersion: LIBRARY_BACKUP_FORMAT, exportedAt, cards, collections, canvases });

/** Parses a v1 (cards/collections) or v2 (adds canvases) export. Throws on any invalid record. */
export function parseLibraryBackup(json: string): LibraryBackup {
  if (json.length > MAX_BACKUP_BYTES) throw new Error('Backup is too large');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Backup is not valid JSON'); }
  const parsed = backupSchema().safeParse(raw);
  if (!parsed.success) throw new Error('Backup contents are not valid');
  const { collections } = parsed.data;
  // Imported text is untrusted: keep only http(s) source links and raster image data URLs.
  const cards = parsed.data.cards.map(card => {
    if (card.dataUrl !== undefined && !/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(card.dataUrl)) throw new Error('Backup contains an unsupported image');
    return card.sourceUrl === undefined ? card : { ...card, sourceUrl: normalizeSourceUrl(card.sourceUrl) };
  });
  if ((parsed.data.formatVersion ?? 1) > LIBRARY_BACKUP_FORMAT) throw new Error('Backup was made by a newer version of Duckler');
  const collectionIds = new Set(collections.map(collection => collection.id));
  const canvases = parsed.data.canvases.map(canvas => {
    const id = canvas.document.id;
    if (!collectionIds.has(id)) throw new Error('Backup canvas has no matching collection');
    const content = { placements: canvas.placements, elements: canvas.elements, connectors: canvas.connectors } as unknown as CanvasContent;
    validateCanvasContent(id, content);
    return { document: canvas.document, viewport: canvas.viewport, ...content };
  });
  if (new Set(cards.map(card => card.id)).size !== cards.length || collectionIds.size !== collections.length || new Set(canvases.map(canvas => canvas.document.id)).size !== canvases.length) throw new Error('Backup contains duplicate IDs');
  return { formatVersion: parsed.data.formatVersion ?? 1, exportedAt: parsed.data.exportedAt ?? '', cards, collections, canvases };
}

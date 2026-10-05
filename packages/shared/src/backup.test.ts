import { describe, expect, it } from 'vitest';
import { createLibraryBackup, parseLibraryBackup } from './backup';
import { createCanvasPlacement } from './canvas';
import type { CardRecord, CollectionRecord } from './index';

const now = '2026-10-04T00:00:00.000Z';
const card: CardRecord = { id: 'card-1', type: 'text', title: 'Card', note: '', tags: [], createdAt: now, updatedAt: now, trashed: false, searchText: 'card' };
const collection: CollectionRecord = { id: 'col-1', name: 'Board', description: '', cardIds: ['card-1'], createdAt: now, updatedAt: now };
const placement = createCanvasPlacement('col-1', 'card-1', { x: 10, y: 20 }, 'p-1');
const canvas = {
  document: { id: 'col-1', title: 'Board', createdAt: now, updatedAt: now, revision: 3, seenCardIds: ['card-1'] },
  viewport: { x: 0, y: 0, zoom: 1 },
  placements: [placement],
  elements: [{ id: 'e-1', canvasId: 'col-1', kind: 'rectangle' as const, x: 0, y: 0, width: 40, height: 40, rotation: 0, zIndex: 1, style: { color: '#ff0000', fill: 'none', strokeWidth: 2, opacity: 1 } }],
  connectors: [{ id: 'c-1', canvasId: 'col-1', sourceId: 'p-1', targetId: 'e-1', label: 'link', color: '#00ff00' }],
};

describe('library backup', () => {
  it('round-trips cards, collections and canvases', () => {
    const json = JSON.stringify(createLibraryBackup([card], [collection], [canvas], now));
    const parsed = parseLibraryBackup(json);
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.canvases[0]).toEqual(canvas);
    expect(parsed.cards).toEqual([card]);
  });

  it('leaves grid thumbnails out of backups (they are a local cache)', () => {
    const withThumb: CardRecord = { ...card, type: 'image', dataUrl: 'data:image/png;base64,AA==', thumb: { url: 'data:image/webp;base64,BB==', of: '22:AA==' } };
    const backup = createLibraryBackup([withThumb], [collection], [], now);
    expect(backup.cards[0]).not.toHaveProperty('thumb');
    expect(backup.cards[0].dataUrl).toBe(withThumb.dataUrl);
    expect(withThumb.thumb).toBeDefined(); // the library's own card is untouched
  });

  it('accepts v1 exports without canvases', () => {
    const parsed = parseLibraryBackup(JSON.stringify({ exportedAt: now, cards: [card], collections: [collection] }));
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.canvases).toEqual([]);
  });

  it('rejects invalid canvas geometry, unknown fields and orphan canvases', () => {
    const bad = (canvases: unknown[]) => JSON.stringify({ formatVersion: 2, cards: [card], collections: [collection], canvases });
    expect(() => parseLibraryBackup(bad([{ ...canvas, placements: [{ ...placement, x: Number.MAX_VALUE }] }]))).toThrow();
    expect(() => parseLibraryBackup(bad([{ ...canvas, placements: [{ ...placement, html: '<img onerror=x>' }] }]))).toThrow();
    expect(() => parseLibraryBackup(bad([{ ...canvas, document: { ...canvas.document, id: 'missing' } }]))).toThrow();
  });

  it('drops executable source links and rejects non-raster image data', () => {
    const parsed = parseLibraryBackup(JSON.stringify({ cards: [{ ...card, sourceUrl: 'javascript:alert(1)' }] }));
    expect(parsed.cards[0].sourceUrl).toBe('');
    expect(() => parseLibraryBackup(JSON.stringify({ cards: [{ ...card, type: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }] }))).toThrow(/image/);
  });

  it('rejects newer formats, duplicates and malformed JSON', () => {
    expect(() => parseLibraryBackup(JSON.stringify({ formatVersion: 99, cards: [] }))).toThrow(/newer/);
    expect(() => parseLibraryBackup(JSON.stringify({ cards: [card, card] }))).toThrow(/duplicate/);
    expect(() => parseLibraryBackup('{nope')).toThrow(/JSON/);
  });
});

describe('collection hierarchy', () => {
  it('keeps one valid nesting level and drops deeper or dangling parents on restore', async () => {
    const { collectionParentError, orderCollectionTree } = await import('./index');
    const root = { ...collection, id: 'root', name: 'Root', cardIds: [] };
    const child = { ...collection, id: 'child', name: 'Child', cardIds: [], parentId: 'root' };
    const grandchild = { ...collection, id: 'grand', name: 'Grand', cardIds: [], parentId: 'child' };
    const orphan = { ...collection, id: 'orphan', name: 'Orphan', cardIds: [], parentId: 'missing' };
    const parsed = parseLibraryBackup(JSON.stringify({ cards: [], collections: [root, child, grandchild, orphan] }));
    expect(parsed.collections.find(item => item.id === 'child')?.parentId).toBe('root');
    expect(parsed.collections.find(item => item.id === 'grand')?.parentId).toBeUndefined();
    expect(parsed.collections.find(item => item.id === 'orphan')?.parentId).toBeUndefined();
    expect(collectionParentError([root, child], 'root', 'child')).toMatch(/one level/);
    expect(collectionParentError([root, child], 'child', 'child')).toMatch(/itself/);
    expect(collectionParentError([root, { ...child, parentId: undefined }], 'child', 'root')).toBeNull();
    expect(orderCollectionTree([child, root]).map(item => `${item.depth}:${item.collection.id}`)).toEqual(['0:root', '1:child']);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardFromInput, createCollectionFromInput } from '@visual-library/shared';
import { cardDb, saveCardWithCollections, saveCanvasLayout, readCanvasLayout, deleteCollection } from './cardDb';

beforeEach(async () => { await cardDb.cards.clear(); await cardDb.collections.clear(); await cardDb.canvasLayouts.clear(); });

describe('composer save', () => {
  it('saves the note and selected collections together', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Thought', note: 'A small observation' });
    const collection = createCollectionFromInput({ name: 'Ideas', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    expect(await cardDb.cards.get(card.id)).toEqual(card);
    expect((await cardDb.collections.get(collection.id))?.cardIds).toEqual([card.id]);
  });

  it('rolls back the note if collection storage fails', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Keep the draft' });
    const collection = createCollectionFromInput({ name: 'Ideas', cardIds: [card.id] });
    const failure = vi.spyOn(cardDb.collections, 'bulkPut').mockRejectedValueOnce(new Error('Storage full'));
    try { await expect(saveCardWithCollections(card, [collection])).rejects.toThrow('Storage full'); }
    finally { failure.mockRestore(); }
    expect(await cardDb.cards.get(card.id)).toBeUndefined();
    expect(await cardDb.collections.get(collection.id)).toBeUndefined();
  });
});

describe('canvas storage', () => {
  it('persists positions and viewport independently for two collections sharing a card', async () => {
    const one = { collectionId: 'one', positions: { shared: { x: 25, y: 90 } }, viewport: { x: 10, y: 20, zoom: .8 }, updatedAt: 'today' };
    const two = { collectionId: 'two', positions: { shared: { x: 800, y: -20 } }, viewport: { x: 40, y: -10, zoom: 1.2 }, updatedAt: 'today' };
    await saveCanvasLayout(one); await saveCanvasLayout(two);
    expect(await readCanvasLayout('one')).toEqual(one);
    expect(await readCanvasLayout('two')).toEqual(two);
    expect(await cardDb.cards.get('shared')).toBeUndefined();
  });

  it('removes only the deleted collection’s layout without deleting its shared cards', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Shared note' });
    const collection = createCollectionFromInput({ name: 'Ideas', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    await saveCanvasLayout({ collectionId: collection.id, positions: {}, updatedAt: '' });
    await saveCanvasLayout({ collectionId: 'other', positions: {}, updatedAt: '' });
    await deleteCollection(collection.id);
    expect(await cardDb.collections.get(collection.id)).toBeUndefined();
    expect(await readCanvasLayout(collection.id)).toBeUndefined();
    expect(await readCanvasLayout('other')).toBeDefined();
    expect(await cardDb.cards.get(card.id)).toEqual(card);
  });
});

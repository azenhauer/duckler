// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCardFromInput, createCollectionFromInput, createCanvasPlacement, defaultCanvasStyle, mediaFingerprint, type CanvasContent } from '@visual-library/shared';
import { cardDb, linkCards, readCards, saveCardWithCollections, saveCanvasLayout, readCanvasLayout, deleteCollection, setCardCollectionMembership, readCanvasState, commitCanvasContent } from './cardDb';

beforeEach(async () => { await cardDb.cards.clear(); await cardDb.collections.clear(); await cardDb.canvasLayouts.clear(); await cardDb.canvases.clear(); await cardDb.canvasPlacements.clear(); await cardDb.canvasElements.clear(); await cardDb.canvasConnectors.clear(); });

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


describe('individual collection relationships', () => {
  it('removes only the selected relationship and preserves the card and other memberships', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Shared thought' });
    const first = createCollectionFromInput({ name: 'First', cardIds: [card.id] });
    const second = createCollectionFromInput({ name: 'Second', cardIds: [card.id] });
    await saveCardWithCollections(card, [first, second]);
    await setCardCollectionMembership(card.id, first.id, false);
    expect((await cardDb.collections.get(first.id))?.cardIds).toEqual([]);
    expect((await cardDb.collections.get(second.id))?.cardIds).toEqual([card.id]);
    expect(await cardDb.cards.get(card.id)).toEqual(card);
  });

  it('Undo preserves collection edits and relationships added after removal, without duplicates', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Original' });
    const later = createCardFromInput({ type: 'text', title: 'Later' });
    const collection = createCollectionFromInput({ name: 'Before', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    await cardDb.cards.put(later);
    await setCardCollectionMembership(card.id, collection.id, false);
    await cardDb.collections.update(collection.id, { name: 'After', cardIds: [later.id] });
    await setCardCollectionMembership(card.id, collection.id, true);
    await setCardCollectionMembership(card.id, collection.id, true);
    const stored = await cardDb.collections.get(collection.id);
    expect(stored?.name).toBe('After');
    expect(stored?.cardIds).toEqual([later.id, card.id]);
  });

  it('does not resurrect a deleted collection or create a dangling reference to a deleted card', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Original' });
    const collection = createCollectionFromInput({ name: 'Before', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    await cardDb.cards.delete(card.id);
    await expect(setCardCollectionMembership(card.id, collection.id, true)).rejects.toThrow('Card no longer exists');
    await cardDb.cards.put(card);
    await deleteCollection(collection.id);
    await expect(setCardCollectionMembership(card.id, collection.id, true)).rejects.toThrow('Collection no longer exists');
    expect(await cardDb.collections.get(collection.id)).toBeUndefined();
  });

  it('keeps the stored relationship when persistence fails', async () => {
    const card = createCardFromInput({ type: 'text', title: 'Keep' });
    const collection = createCollectionFromInput({ name: 'Ideas', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    const failure = vi.spyOn(cardDb.collections, 'put').mockRejectedValueOnce(new Error('Storage full'));
    try { await expect(setCardCollectionMembership(card.id, collection.id, false)).rejects.toThrow('Storage full'); }
    finally { failure.mockRestore(); }
    expect((await cardDb.collections.get(collection.id))?.cardIds).toEqual([card.id]);
  });
});


describe('canvas commands and legacy upgrade', () => {
  async function fixture() {
    const card = createCardFromInput({ id: 'source', type: 'text', title: 'Source card' });
    const collection = createCollectionFromInput({ id: 'board', name: 'Board', cardIds: [card.id] });
    await saveCardWithCollections(card, [collection]);
    return { card, collection, state: await readCanvasState(collection.id) };
  }
  const content = (state: CanvasContent): CanvasContent => ({ placements: state.placements, elements: state.elements, connectors: state.connectors });
  it('lazily upgrades legacy positions without destroying viewport or source content', async () => {
    const { card, collection } = await fixture();
    await cardDb.canvases.clear(); await cardDb.canvasPlacements.clear();
    await saveCanvasLayout({ collectionId: collection.id, positions: { [card.id]: { x: 44, y: -88 } }, viewport: { x: 30, y: 40, zoom: .7 }, updatedAt: '' });
    const upgraded = await readCanvasState(collection.id);
    expect(upgraded.placements[0]).toMatchObject({ cardId: card.id, x: 44, y: -88, width: 210, height: 194, rotation: 0 });
    expect(upgraded.viewport).toEqual({ x: 30, y: 40, zoom: .7 });
    expect((await readCanvasState(collection.id)).placements).toEqual(upgraded.placements);
    expect(await cardDb.cards.get(card.id)).toEqual(card);
  });
  it('keeps repeated references independent, preserves removed annotations, and persists only IDs and geometry', async () => {
    const { state, card } = await fixture();
    const duplicate = createCanvasPlacement('board', card.id, { x: 400, y: 600 });
    const annotation = { id: 'annotation', canvasId: 'board', kind: 'text' as const, x: 30, y: 40, width: 200, height: 100, rotation: 0, zIndex: 1,
      anchorPlacementId: state.placements[0].id, style: defaultCanvasStyle, text: 'Private annotation', fontSize: 18 };
    const next = { ...content(state), placements: [...state.placements, duplicate], elements: [annotation] };
    const document = await commitCanvasContent('board', state.document.revision, next);
    const removed = { ...next, placements: next.placements.map(item => item.id === state.placements[0].id ? { ...item, removed: true } : item) };
    await commitCanvasContent('board', document.revision, removed);
    const stored = await readCanvasState('board');
    expect(stored.placements).toHaveLength(2);
    expect(stored.elements).toEqual([annotation]);
    expect(stored.placements.find(item => item.id === duplicate.id)).toEqual(duplicate);
    expect(stored.placements[0]).not.toHaveProperty('title');
    expect(await cardDb.cards.get(card.id)).toEqual(card);
    expect((await cardDb.collections.get('board'))?.cardIds).toEqual([card.id]);
  });
  it('rejects stale commands and undo before changing stored geometry', async () => {
    const { state } = await fixture();
    const moved = { ...content(state), placements: state.placements.map(item => ({ ...item, x: 88, width: 400, rotation: 15 })) };
    await commitCanvasContent('board', state.document.revision, moved);
    await expect(commitCanvasContent('board', state.document.revision, content(state))).rejects.toThrow('Canvas changed elsewhere');
    expect((await readCanvasState('board')).placements[0]).toMatchObject({ x: 88, width: 400, rotation: 15 });
  });
  it('rolls back all objects in a multi-object move when a later object write fails', async () => {
    const { state } = await fixture();
    const other = createCanvasPlacement('board', 'source', { x: 250, y: 0 });
    let document = await commitCanvasContent('board', state.document.revision, { ...content(state), placements: [...state.placements, other] });
    const before = await readCanvasState('board');
    let count = 0;
    const original = cardDb.canvasPlacements.put.bind(cardDb.canvasPlacements);
    const fail = vi.spyOn(cardDb.canvasPlacements, 'put').mockImplementation((...args) => { if (++count === 2) throw new Error('Quota full'); return original(...args); });
    try { await expect(commitCanvasContent('board', document.revision, { ...content(before), placements: before.placements.map(item => ({ ...item, x: item.x + 100 })) })).rejects.toThrow('Quota full'); }
    finally { fail.mockRestore(); }
    expect((await readCanvasState('board')).placements).toEqual(before.placements);
    document = (await readCanvasState('board')).document;
    expect(document.revision).toBe(before.document.revision);
  });
  it('cleans canvas records on collection deletion while preserving the referenced card', async () => {
    const { state, card } = await fixture();
    await commitCanvasContent('board', state.document.revision, content(state));
    await deleteCollection('board');
    expect(await cardDb.canvases.get('board')).toBeUndefined();
    expect(await cardDb.canvasPlacements.toArray()).toEqual([]);
    expect(await cardDb.cards.get(card.id)).toEqual(card);
    await expect(readCanvasState('board')).rejects.toThrow('Collection no longer exists');
  });
});

describe('connected cards', () => {
  it('connects and disconnects two cards on both sides, without duplicates', async () => {
    const a = createCardFromInput({ type: 'text', title: 'A' }), b = createCardFromInput({ type: 'image', title: 'B' });
    await cardDb.cards.bulkPut([a, b]);
    await linkCards(a.id, b.id); await linkCards(b.id, a.id);
    expect((await cardDb.cards.get(a.id))?.links?.map(link => link.cardId)).toEqual([b.id]);
    expect((await cardDb.cards.get(b.id))?.links?.map(link => link.cardId)).toEqual([a.id]);
    await linkCards(a.id, b.id, false);
    expect((await cardDb.cards.get(a.id))?.links).toEqual([]);
    expect((await cardDb.cards.get(b.id))?.links).toEqual([]);
    await expect(linkCards(a.id, a.id)).rejects.toThrow('itself');
    await expect(linkCards(a.id, 'missing')).rejects.toThrow('no longer exists');
  });
});

describe('reading cards', () => {
  it('rebuilds the search index so stale OCR and missing indexes match the stored card', async () => {
    const image = 'data:image/png;base64,QUJD';
    const ocr = { text: 'Pineapple', sourceHash: mediaFingerprint(image), languages: ['eng'], engine: 'tesseract.js', engineVersion: '7', createdAt: 'now', editedByUser: false };
    const base = createCardFromInput({ type: 'image', title: 'Scan', dataUrl: 'data:image/png;base64,REVG' });
    await cardDb.cards.put({ ...base, ocr, searchText: 'scan pineapple' });
    const pdf = createCardFromInput({ type: 'pdf', title: 'Report' });
    await cardDb.cards.put({ ...pdf, pdf: { fileName: 'r.pdf', pageCount: 1, data: 'data:application/pdf;base64,JVBERg==', text: 'Zebracorn' }, searchText: '' });
    const cards = await readCards();
    expect(cards.find(card => card.id === base.id)?.searchText).not.toContain('pineapple');
    expect(cards.find(card => card.id === pdf.id)?.searchText).toContain('zebracorn');
  });
});

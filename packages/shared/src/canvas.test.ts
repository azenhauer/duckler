import { describe, expect, it } from 'vitest';
import { createCardFromInput, createCollectionFromInput, collectionCanvasCards, canvasCardPosition, type CanvasLayout } from './index';

describe('collection canvases', () => {
  it('only includes unique, live members of the selected collection', () => {
    const a = createCardFromInput({ type: 'text', title: 'A' });
    const b = createCardFromInput({ type: 'text', title: 'B', trashed: true });
    const c = createCardFromInput({ type: 'text', title: 'Another collection' });
    const collection = createCollectionFromInput({ name: 'Ideas', cardIds: [a.id, b.id, 'missing', a.id] });
    expect(collectionCanvasCards(collection, [a, b, c])).toEqual([a]);
  });

  it('uses each collection’s independent layout for shared cards', () => {
    const one: CanvasLayout = { collectionId: 'one', positions: { shared: { x: 20, y: 80 } }, updatedAt: '' };
    const two: CanvasLayout = { collectionId: 'two', positions: { shared: { x: 700, y: -50 } }, updatedAt: '' };
    expect(canvasCardPosition('shared', 0, one)).toEqual({ x: 20, y: 80 });
    expect(canvasCardPosition('shared', 0, two)).toEqual({ x: 700, y: -50 });
    expect(canvasCardPosition('new', 4, one)).toEqual({ x: 260, y: 240 });
  });

  it('falls back to a safe layout for invalid saved coordinates', () => {
    expect(canvasCardPosition('bad', 1, { collectionId: 'one', positions: { bad: { x: NaN, y: Infinity } }, updatedAt: '' })).toEqual({ x: 260, y: 0 });
  });
});

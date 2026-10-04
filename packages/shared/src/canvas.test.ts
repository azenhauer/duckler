import { describe, expect, it } from 'vitest';
import { createCardFromInput, createCollectionFromInput, collectionCanvasCards, canvasCardPosition, type CanvasLayout, createCanvasPlacement, canvasAnchorPoint, canvasGestureElement, defaultCanvasStyle, validateCanvasContent, visibleCanvasElements, visibleCanvasConnectors, type CanvasContent } from './index';

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


describe('canvas drawing and reference validation', () => {
  it('converts drawing coordinates to a rotated placement-local box', () => {
    const placement = { ...createCanvasPlacement('board', 'card', { x: 100, y: 200 }), width: 200, height: 100, rotation: 90 };
    expect(canvasAnchorPoint({ x: 200, y: 250 }, placement)).toEqual({ x: 500, y: 500 });
    const right = canvasAnchorPoint({ x: 200, y: 350 }, placement);
    expect(right.x).toBeCloseTo(1000); expect(right.y).toBeCloseTo(500);
  });
  it('normalizes freehand points to the stroke box and cancels empty gestures', () => {
    const element = canvasGestureElement('board', 'stroke', [{ x: -20, y: 80 }, { x: 30, y: 20 }, { x: 50, y: 90 }], defaultCanvasStyle)!;
    expect(element).toMatchObject({ x: -20, y: 20, width: 70, height: 70, points: [{ x: 0, y: 60 }, { x: 50, y: 0 }, { x: 70, y: 70 }] });
    expect(canvasGestureElement('board', 'stroke', [{ x: 0, y: 0 }], defaultCanvasStyle)).toBeNull();
    expect(canvasGestureElement('board', 'rectangle', [{ x: 0, y: 0 }, { x: 0, y: 0 }], defaultCanvasStyle)).toBeNull();
  });
  it('hides anchored objects and connectors reversibly when a placement is removed', () => {
    const one = createCanvasPlacement('board', 'card', { x: 0, y: 0 }, 'one');
    const two = createCanvasPlacement('board', 'card', { x: 300, y: 0 }, 'two');
    const annotation = canvasGestureElement('board', 'rectangle', [{ x: 10, y: 20 }, { x: 100, y: 60 }], defaultCanvasStyle, one)!;
    const content: CanvasContent = { placements: [{ ...one, removed: true }, two], elements: [annotation], connectors: [{ id: 'line', canvasId: 'board', sourceId: 'one', targetId: 'two', label: '', color: '#7cbcff' }] };
    validateCanvasContent('board', content);
    expect(visibleCanvasElements(content)).toEqual([]); expect(visibleCanvasConnectors(content)).toEqual([]);
    content.placements[0].removed = false;
    expect(visibleCanvasElements(content)).toEqual([annotation]); expect(visibleCanvasConnectors(content)).toHaveLength(1);
  });
  it('rejects invalid dimensions, cross-canvas references, duplicates, arbitrary payloads and oversized content', () => {
    const placement = createCanvasPlacement('board', 'card', { x: 0, y: 0 });
    const valid: CanvasContent = { placements: [placement], elements: [], connectors: [] };
    validateCanvasContent('board', valid);
    for (const modified of [{ ...placement, x: NaN }, { ...placement, width: 119 }, { ...placement, rotation: Infinity }, { ...placement, canvasId: 'other' }]) {
      expect(() => validateCanvasContent('board', { ...valid, placements: [modified] })).toThrow();
    }
    expect(() => validateCanvasContent('board', { ...valid, placements: [placement, placement] })).toThrow();
    expect(() => validateCanvasContent('board', { ...valid, placements: [{ ...placement, cardContent: 'do not duplicate' } as typeof placement] })).toThrow('Unexpected canvas field');
    expect(() => validateCanvasContent('board', { ...valid, connectors: [{ id: 'bad', canvasId: 'board', sourceId: placement.id, targetId: 'missing', label: '', color: '#000000' }] })).toThrow();
    expect(() => validateCanvasContent('board', { ...valid, placements: Array.from({ length: 201 }, (_, index) => ({ ...placement, id: String(index) })) })).toThrow('Canvas object limit');
  });
});

import type { CardRecord, CollectionRecord } from './index';

export type CanvasPoint = { x: number; y: number };
export type CanvasViewport = CanvasPoint & { zoom: number };
export type CanvasLayout = {
  collectionId: string;
  positions: Record<string, CanvasPoint>;
  viewport?: CanvasViewport;
  updatedAt: string;
};

export function collectionCanvasCards(collection: CollectionRecord, cards: CardRecord[]): CardRecord[] {
  const byId = new Map(cards.filter(card => !card.trashed).map(card => [card.id, card]));
  return [...new Set(collection.cardIds)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}

export function canvasCardPosition(cardId: string, index: number, layout?: CanvasLayout): CanvasPoint {
  const saved = layout?.positions[cardId];
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved;
  return { x: (index % 3) * 260, y: Math.floor(index / 3) * 240 };
}

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


export type CanvasDocument = {
  id: string; title: string; createdAt: string; updatedAt: string;
  revision: number; seenCardIds: string[];
};
export type CanvasGeometry = CanvasPoint & { width: number; height: number; rotation: number; zIndex: number };
export type CanvasPlacement = CanvasGeometry & { id: string; canvasId: string; cardId: string; removed?: boolean };
export type CanvasStyle = { color: string; fill: string; strokeWidth: number; opacity: number };
export type CanvasElement = CanvasGeometry & {
  id: string; canvasId: string; kind: 'stroke' | 'rectangle' | 'ellipse' | 'text';
  style: CanvasStyle; points?: CanvasPoint[]; text?: string; fontSize?: number;
  anchorPlacementId?: string; sourceRevision?: string;
};
export type CanvasConnector = {
  id: string; canvasId: string; sourceId: string; targetId: string; label: string; color: string;
};
export type CanvasContent = { placements: CanvasPlacement[]; elements: CanvasElement[]; connectors: CanvasConnector[] };
export type CanvasState = CanvasContent & { document: CanvasDocument; viewport?: CanvasViewport };
export const CANVAS_CARD_MIME = 'application/x-duckler-card-id';
export const CANVAS_LIMITS = { placements: 200, elements: 500, connectors: 200, points: 5000, text: 20000 };
export const defaultCanvasStyle: CanvasStyle = { color: '#7cbcff', fill: 'none', strokeWidth: 3, opacity: 1 };
export const normalizeRotation = (degrees: number) => ((degrees % 360) + 360) % 360;

export function createCanvasPlacement(canvasId: string, cardId: string, point: CanvasPoint, id: string = crypto.randomUUID()): CanvasPlacement {
  return { id, canvasId, cardId, ...point, width: 210, height: 194, rotation: 0, zIndex: 0 };
}
export function validateCanvasContent(canvasId: string, content: CanvasContent): void {
  if (content.placements.length > CANVAS_LIMITS.placements || content.elements.length > CANVAS_LIMITS.elements || content.connectors.length > CANVAS_LIMITS.connectors) throw new Error('Canvas object limit reached');
  const objects = [...content.placements, ...content.elements];
  const ids = new Set<string>();
  const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200;
  for (const object of objects) {
    if (object.canvasId !== canvasId || !validId(object.id) || ids.has(object.id)) throw new Error('Invalid canvas reference');
    ids.add(object.id);
    const values = [object.x, object.y, object.width, object.height, object.rotation, object.zIndex];
    if (values.some(value => !Number.isFinite(value)) || Math.abs(object.x) > 1000000 || Math.abs(object.y) > 1000000 || object.width < 1 || object.height < 1 || object.width > 10000 || object.height > 10000 || object.rotation < 0 || object.rotation >= 360 || Math.abs(object.zIndex) > 10000) throw new Error('Invalid canvas geometry');
  }
  const geometryFields = ['id', 'canvasId', 'x', 'y', 'width', 'height', 'rotation', 'zIndex'];
  const strictFields = (object: object, allowed: string[]) => { if (Object.keys(object).some(key => !allowed.includes(key))) throw new Error('Unexpected canvas field'); };
  const placementIds = new Set(content.placements.map(item => item.id));
  for (const placement of content.placements) {
    strictFields(placement, [...geometryFields, 'cardId', 'removed']);
    if (!validId(placement.cardId) || placement.width < 120 || placement.height < 80 || (placement.removed !== undefined && typeof placement.removed !== 'boolean')) throw new Error('Invalid card placement');
  }
  for (const element of content.elements) {
    strictFields(element, [...geometryFields, 'kind', 'style', 'points', 'text', 'fontSize', 'anchorPlacementId', 'sourceRevision']);
    if (!['stroke', 'rectangle', 'ellipse', 'text'].includes(element.kind)) throw new Error('Invalid canvas element');
    if (element.anchorPlacementId && !placementIds.has(element.anchorPlacementId)) throw new Error('Invalid annotation anchor');
    const style = element.style;
    if (style) strictFields(style, ['color', 'fill', 'strokeWidth', 'opacity']);
    if (!style || !/^#[0-9a-f]{6}$/i.test(style.color) || !(style.fill === 'none' || /^#[0-9a-f]{6}$/i.test(style.fill)) || !Number.isFinite(style.strokeWidth) || style.strokeWidth < 1 || style.strokeWidth > 32 || !Number.isFinite(style.opacity) || style.opacity < .05 || style.opacity > 1) throw new Error('Invalid canvas style');
    if (element.kind === 'stroke' && (!element.points || element.points.length < 2 || element.points.length > CANVAS_LIMITS.points || element.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1000000 || Math.abs(point.y) > 1000000))) throw new Error('Invalid canvas stroke');
    if (element.kind === 'text' && (typeof element.text !== 'string' || element.text.length > CANVAS_LIMITS.text || !Number.isFinite(element.fontSize) || element.fontSize! < 8 || element.fontSize! > 100)) throw new Error('Invalid canvas text');
  }
  const endpointIds = new Set(ids);
  for (const connector of content.connectors) {
    strictFields(connector, ['id', 'canvasId', 'sourceId', 'targetId', 'label', 'color']);
    if (connector.canvasId !== canvasId || !validId(connector.id) || ids.has(connector.id) || !endpointIds.has(connector.sourceId) || !endpointIds.has(connector.targetId) || connector.sourceId === connector.targetId || typeof connector.label !== 'string' || connector.label.length > 1000 || !/^#[0-9a-f]{6}$/i.test(connector.color)) throw new Error('Invalid canvas connector');
    ids.add(connector.id);
  }
}

// Placement-local annotations use a fixed 1000-unit box and inherit position, size and rotation.
export function canvasAnchorPoint(point: CanvasPoint, placement: CanvasPlacement): CanvasPoint {
  const radians = placement.rotation * Math.PI / 180;
  const cx = placement.x + placement.width / 2, cy = placement.y + placement.height / 2;
  const dx = point.x - cx, dy = point.y - cy;
  return { x: (Math.cos(radians) * dx + Math.sin(radians) * dy + placement.width / 2) / placement.width * 1000,
    y: (-Math.sin(radians) * dx + Math.cos(radians) * dy + placement.height / 2) / placement.height * 1000 };
}

export function canvasStrokePath(points: CanvasPoint[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}
export function canvasGestureElement(canvasId: string, kind: CanvasElement['kind'], points: CanvasPoint[], style: CanvasStyle, anchor?: CanvasPlacement, sourceRevision?: string): CanvasElement | null {
  if (points.length < 2) return null;
  const local = anchor ? points.map(point => canvasAnchorPoint(point, anchor)) : points;
  const start = local[0], end = local[local.length - 1];
  const used = kind === 'stroke' ? local : [start, end];
  const x = Math.min(...used.map(point => point.x)), y = Math.min(...used.map(point => point.y));
  const width = Math.max(...used.map(point => point.x)) - x, height = Math.max(...used.map(point => point.y)) - y;
  if (width < 1 && height < 1) return null;
  return { id: crypto.randomUUID(), canvasId, kind, x, y, width: Math.max(width, 1), height: Math.max(height, 1), rotation: 0, zIndex: 1,
    style: { ...style }, ...(kind === 'stroke' ? { points: used.map(point => ({ x: point.x - x, y: point.y - y })) } : {}),
    ...(anchor ? { anchorPlacementId: anchor.id, sourceRevision } : {}) };
}
export function visibleCanvasElements(content: CanvasContent): CanvasElement[] {
  const active = new Set(content.placements.filter(item => !item.removed).map(item => item.id));
  return content.elements.filter(element => !element.anchorPlacementId || active.has(element.anchorPlacementId));
}
export function visibleCanvasConnectors(content: CanvasContent): CanvasConnector[] {
  const active = new Set([...content.placements.filter(item => !item.removed).map(item => item.id), ...visibleCanvasElements(content).map(item => item.id)]);
  return content.connectors.filter(connector => active.has(connector.sourceId) && active.has(connector.targetId));
}

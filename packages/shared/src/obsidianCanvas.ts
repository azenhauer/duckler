import type { CardRecord } from './index';
import type { CanvasBackup } from './backup';
import type { CanvasElement, CanvasPlacement } from './canvas';
import { canvasStrokePath } from './canvas';

type ArchiveLike = { files: { path: string; content: string | Uint8Array }[] };

const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
const md = (value: string) => value.replace(/\r?\n/g, ' ').replace(/([\\`*_[\]<>#|])/g, '\\$1');
const stem = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'canvas';
const hex = (value: string | undefined, fallback: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** Place an element in world coordinates; anchored elements live in a 1000-unit box on their card. */
function worldBox(element: CanvasElement, placements: Map<string, CanvasPlacement>) {
  const anchor = element.anchorPlacementId ? placements.get(element.anchorPlacementId) : undefined;
  if (!anchor) return { x: element.x, y: element.y, sx: 1, sy: 1 };
  const sx = anchor.width / 1000, sy = anchor.height / 1000;
  return { x: anchor.x + element.x * sx, y: anchor.y + element.y * sy, sx, sy };
}

/** A static SVG picture of a canvas: card frames with titles, drawings, shapes, text and connectors. */
export function canvasPreviewSvg(canvas: CanvasBackup, cards: Map<string, CardRecord>): string {
  const placements = canvas.placements.filter(item => !item.removed);
  const byId = new Map(placements.map(item => [item.id, item]));
  const elements = canvas.elements.filter(item => !item.anchorPlacementId || byId.has(item.anchorPlacementId));
  const boxes = [...placements.map(item => ({ x: item.x, y: item.y, w: item.width, h: item.height })),
    ...elements.map(item => { const box = worldBox(item, byId); return { x: box.x, y: box.y, w: item.width * box.sx, h: item.height * box.sy }; })];
  const minX = Math.min(0, ...boxes.map(item => item.x)) - 40, minY = Math.min(0, ...boxes.map(item => item.y)) - 40;
  const maxX = Math.max(400, ...boxes.map(item => item.x + item.w)) + 40, maxY = Math.max(300, ...boxes.map(item => item.y + item.h)) + 40;
  const centre = (id: string) => {
    const placement = byId.get(id); if (placement) return { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 };
    const element = elements.find(item => item.id === id); if (!element) return null;
    const box = worldBox(element, byId); return { x: box.x + element.width * box.sx / 2, y: box.y + element.height * box.sy / 2 };
  };
  const parts: string[] = [];
  parts.push(`<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${hex(canvas.document.background, '#04060b')}"/>`);
  for (const connector of canvas.connectors) {
    const a = centre(connector.sourceId), b = centre(connector.targetId); if (!a || !b) continue;
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${hex(connector.color, '#3cc8ff')}" stroke-width="2"${connector.arrow && connector.arrow !== 'none' ? ' marker-end="url(#arrow)"' : ''}/>`);
    if (connector.label) parts.push(`<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}" fill="#e6f6ff" font-family="Arial" font-size="13" text-anchor="middle">${xml(connector.label)}</text>`);
  }
  for (const placement of placements) {
    const card = cards.get(placement.cardId);
    const transform = placement.rotation ? ` transform="rotate(${placement.rotation} ${placement.x + placement.width / 2} ${placement.y + placement.height / 2})"` : '';
    parts.push(`<g${transform}><rect x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" fill="${hex(card?.color, '#0c1424')}" fill-opacity="${card?.color ? .35 : 1}" stroke="#2fb8f0"/>`
      + `<text x="${placement.x + 10}" y="${placement.y + placement.height - 12}" fill="#e6f6ff" font-family="Arial" font-size="13">${xml((card?.title ?? 'Missing card').slice(0, 40))}</text></g>`);
  }
  for (const element of elements) {
    const box = worldBox(element, byId);
    const stroke = hex(element.style?.color, '#3cc8ff'), fill = element.style?.fill && element.style.fill !== 'none' ? element.style.fill : 'none';
    const common = `stroke="${stroke}" stroke-width="${element.style?.strokeWidth ?? 2}" stroke-opacity="${element.style?.opacity ?? 1}" fill="${fill}"`;
    const at = `translate(${box.x} ${box.y}) scale(${box.sx} ${box.sy})`;
    if (element.kind === 'stroke' && element.points) parts.push(`<path transform="${at}" d="${canvasStrokePath(element.points)}" ${common} stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
    if (element.kind === 'rectangle') parts.push(`<rect transform="${at}" width="${element.width}" height="${element.height}" ${common}/>`);
    if (element.kind === 'ellipse') parts.push(`<ellipse transform="${at}" cx="${element.width / 2}" cy="${element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" ${common}/>`);
    if (element.kind === 'text' && element.text) parts.push(`<text transform="${at}" y="${element.fontSize ?? 18}" fill="${stroke}" font-family="Arial" font-size="${element.fontSize ?? 18}">${xml(element.text.slice(0, 400))}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${Math.round(Math.min(2400, maxX - minX))}">`
    + `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3cc8ff"/></marker></defs>${parts.join('')}</svg>\n`;
}

/** Adds one note per canvas (preview image, cards on it and its text annotations) to an Obsidian export. */
export function appendCanvasesToObsidianArchive<T extends ArchiveLike>(archive: T, canvases: CanvasBackup[], cards: CardRecord[]): T {
  const cardMap = new Map(cards.map(card => [card.id, card]));
  for (const canvas of canvases) {
    const name = `${stem(canvas.document.title)}--${encodeURIComponent(canvas.document.id)}`;
    archive.files.push({ path: `canvases/${name}.svg`, content: canvasPreviewSvg(canvas, cardMap) });
    const cardsOnBoard = [...new Set(canvas.placements.filter(item => !item.removed).map(item => item.cardId))].map(id => cardMap.get(id)).filter((card): card is CardRecord => Boolean(card && !card.trashed));
    const texts = canvas.elements.filter(item => item.kind === 'text' && item.text?.trim());
    const lines = ['---', `canvas_id: ${JSON.stringify(canvas.document.id)}`, `updated_at: ${JSON.stringify(canvas.document.updatedAt)}`, '---', '', `# ${md(canvas.document.title)}`, '',
      `![${md(canvas.document.title)} canvas](${name}.svg)`, '', '## Cards on this canvas', '',
      ...(cardsOnBoard.length ? cardsOnBoard.map(card => `- ${md(card.title)}`) : ['_No cards_']), '', '## Text annotations', '',
      ...(texts.length ? texts.map(item => `- ${md(item.text!)}${item.anchorPlacementId ? ` _(on ${md(cardMap.get(byPlacement(canvas, item.anchorPlacementId) ?? '')?.title ?? 'a card')})_` : ''}`) : ['_None_']), '',
      '_Exact drawings, connectors and rotation are kept in the Duckler backup; this note is a preview._', ''];
    archive.files.push({ path: `canvases/${name}.md`, content: lines.join('\n') });
  }
  return archive;
}
const byPlacement = (canvas: CanvasBackup, placementId: string) => canvas.placements.find(item => item.id === placementId)?.cardId;

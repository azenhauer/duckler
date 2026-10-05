import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { CanvasArtwork } from './CanvasArtwork';
import { canvasCardPosition, collectionCanvasCards, type CanvasLayout, type CardRecord, type CollectionRecord, type CanvasPlacement, type CanvasElement } from '@visual-library/shared';
import { cardDb } from '../lib/cardDb';
import { NavigationIcon } from './NavigationIcon';

function CanvasPreview({ cards, layout, placements, elements = [] }: { cards: CardRecord[]; layout?: CanvasLayout; placements?: CanvasPlacement[]; elements?: CanvasElement[] }) {
  const byId = new Map(cards.map(card => [card.id, card]));
  const positioned = placements ? placements.filter(item => !item.removed).slice(0, 24).map(item => ({ ...item, card: byId.get(item.cardId) }))
    : cards.slice(0, 24).map((card, index) => ({ id: card.id, card, ...canvasCardPosition(card.id, index, layout), width: 210, height: 194, rotation: 0 }));
  const globalElements = elements.filter(item => !item.anchorPlacementId).slice(0, 40);
  const objects = [...positioned, ...globalElements];
  if (!objects.length) return <div className="canvas-thumbnail is-empty"><NavigationIcon name="canvas" expanded /></div>;
  const left = Math.min(...objects.map(item => item.x - Math.max(item.width, item.height) / 2)) - 40;
  const top = Math.min(...objects.map(item => item.y - Math.max(item.width, item.height) / 2)) - 40;
  const width = Math.max(...objects.map(item => item.x + Math.max(item.width, item.height) * 1.5)) - left + 40;
  const height = Math.max(...objects.map(item => item.y + Math.max(item.width, item.height) * 1.5)) - top + 40;
  return <div className="canvas-thumbnail"><svg viewBox={`${left} ${top} ${width} ${height}`} aria-hidden="true">
    {positioned.map(({ card, ...item }) => <g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`}>
      <svg width={item.width} height={item.height} viewBox="0 0 210 194" preserveAspectRatio="none">
        <rect width="210" height="194" rx="12" fill="white" stroke="#dce1e7" strokeWidth="2" />
        {(card?.type === 'image' || card?.type === 'pdf') && card.dataUrl && !card.trashed ? <image href={card.dataUrl} x="8" y="8" width="194" height="132" preserveAspectRatio="xMidYMid meet" /> : <>
          <rect x="12" y="12" width="186" height="112" rx="8" fill="#edf0f4" />
          <text x="24" y="46" fontSize="15" fill="#464d55">{card?.trashed ? 'Card in trash' : card?.title.slice(0, 20) ?? 'Missing card'}</text>
        </>}
        <text x="14" y="161" fontSize="14" fontWeight="600" fill="#303741">{card?.title.slice(0, 22) ?? 'Missing card'}</text>
      </svg>
      {elements.filter(element => element.anchorPlacementId === item.id).slice(0, 40).map(element => <svg key={element.id} width={item.width} height={item.height} viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <g transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}><svg width={element.width} height={element.height}><CanvasArtwork element={element} /></svg></g>
      </svg>)}
    </g>)}
    {globalElements.map(element => <g key={element.id} transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}>
      <svg width={element.width} height={element.height}><CanvasArtwork element={element} /></svg>
    </g>)}
  </svg></div>;
}

export function CanvasGallery({ collections, cards, search, onOpen, onCreateCollection }: {
  collections: CollectionRecord[]; cards: CardRecord[]; search: string;
  onOpen: (collectionId: string) => void; onCreateCollection: () => void;
}) {
  const [layouts, setLayouts] = useState<CanvasLayout[]>([]);
  const [error, setError] = useState('');
  const [placements, setPlacements] = useState<CanvasPlacement[]>([]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [canvasIds, setCanvasIds] = useState<string[]>([]);
  useEffect(() => {
    const subscription = liveQuery(async () => ({ layouts: await cardDb.canvasLayouts.toArray(), placements: await cardDb.canvasPlacements.toArray(),
      elements: await cardDb.canvasElements.toArray(), canvases: await cardDb.canvases.toArray() })).subscribe({
      next: result => { setLayouts(result.layouts); setPlacements(result.placements); setElements(result.elements); setCanvasIds(result.canvases.map(item => item.id)); },
      error: () => setError('Canvas previews could not be loaded.'),
    });
    return () => subscription.unsubscribe();
  }, []);
  const query = search.trim().toLocaleLowerCase();
  const visible = collections.filter(collection => collection.name.toLocaleLowerCase().includes(query) || cards.some(card => (collection.cardIds.includes(card.id) || placements.some(item => item.canvasId === collection.id && !item.removed && item.cardId === card.id)) && !card.trashed && card.searchText.toLocaleLowerCase().includes(query)));
  return <div className="canvas-gallery" aria-label="Collection canvases" data-single={visible.length === 1}>
    {error && <p role="alert">{error}</p>}
    {visible.map(collection => <button className="canvas-gallery-tile" type="button" key={collection.id} aria-label={`Open canvas ${collection.name}`} onClick={() => onOpen(collection.id)}>
      <CanvasPreview cards={canvasIds.includes(collection.id) ? cards : collectionCanvasCards(collection, cards)} layout={layouts.find(layout => layout.collectionId === collection.id)} placements={canvasIds.includes(collection.id) ? placements.filter(item => item.canvasId === collection.id) : undefined} elements={elements.filter(item => item.canvasId === collection.id)} />
      <span className="canvas-gallery-caption">{collection.name}</span>
    </button>)}
    {!visible.length && <div className="empty-view"><NavigationIcon name="canvas" />
      <p>{collections.length ? 'No matches' : 'No canvases yet'}</p>
      {!collections.length && <button type="button" className="secondary-button" onClick={onCreateCollection}>Create a collection</button>}
    </div>}
  </div>;
}

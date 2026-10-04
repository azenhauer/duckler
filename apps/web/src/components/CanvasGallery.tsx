import { useEffect, useState } from 'react';
import { canvasCardPosition, collectionCanvasCards, type CanvasLayout, type CardRecord, type CollectionRecord } from '@visual-library/shared';
import { cardDb } from '../lib/cardDb';
import { NavigationIcon } from './NavigationIcon';

function CanvasPreview({ cards, layout }: { cards: CardRecord[]; layout?: CanvasLayout }) {
  if (!cards.length) return <div className="canvas-thumbnail is-empty"><NavigationIcon name="canvas" expanded /></div>;
  const positioned = cards.slice(0, 24).map((card, index) => ({ card, ...canvasCardPosition(card.id, index, layout) }));
  const left = Math.min(...positioned.map(card => card.x)) - 40;
  const top = Math.min(...positioned.map(card => card.y)) - 40;
  const width = Math.max(...positioned.map(card => card.x)) - left + 250;
  const height = Math.max(...positioned.map(card => card.y)) - top + 240;
  return <div className="canvas-thumbnail"><svg viewBox={`${left} ${top} ${width} ${height}`} aria-hidden="true">
    {positioned.map(({ card, x, y }) => <g key={card.id} transform={`translate(${x} ${y})`}>
      <rect width="210" height="194" rx="12" fill="white" stroke="#dce1e7" strokeWidth="2" />
      {card.type === 'image' && card.dataUrl ? <image href={card.dataUrl} x="8" y="8" width="194" height="132" preserveAspectRatio="xMidYMid slice" /> : <>
        <rect x="12" y="12" width="186" height="112" rx="8" fill={card.type === 'text' ? '#e4eadc' : '#edf0f4'} />
        <text x="24" y="46" fontSize="15" fill="#464d55">{card.title.slice(0, 20)}</text>
        <text x="24" y="72" fontSize="12" fill="#69737e">{card.note.slice(0, 25)}</text>
      </>}
      <text x="14" y="161" fontSize="14" fontWeight="600" fill="#303741">{card.title.slice(0, 22)}</text>
      <rect x="14" y="176" width="76" height="3" rx="1.5" fill="#d4dbe3" />
    </g>)}
  </svg></div>;
}

export function CanvasGallery({ collections, cards, search, onOpen, onCreateCollection }: {
  collections: CollectionRecord[]; cards: CardRecord[]; search: string;
  onOpen: (collectionId: string) => void; onCreateCollection: () => void;
}) {
  const [layouts, setLayouts] = useState<CanvasLayout[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    void cardDb.canvasLayouts.toArray().then(result => { if (!disposed) setLayouts(result); }, () => { if (!disposed) setError('Canvas previews could not be loaded.'); });
    return () => { disposed = true; };
  }, []);
  const query = search.trim().toLocaleLowerCase();
  const visible = collections.filter(collection => collection.name.toLocaleLowerCase().includes(query) || collectionCanvasCards(collection, cards).some(card => card.searchText.toLocaleLowerCase().includes(query)));
  return <div className="canvas-gallery" aria-label="Collection canvases" data-single={visible.length === 1}>
    {error && <p role="alert">{error}</p>}
    {visible.map(collection => <button className="canvas-gallery-tile" type="button" key={collection.id} aria-label={`Open canvas ${collection.name}`} onClick={() => onOpen(collection.id)}>
      <CanvasPreview cards={collectionCanvasCards(collection, cards)} layout={layouts.find(layout => layout.collectionId === collection.id)} />
      <span className="canvas-gallery-caption">{collection.name}</span>
    </button>)}
    {!visible.length && <div className="empty-view"><NavigationIcon name="canvas" />
      <p>{collections.length ? 'No matches' : 'No canvases yet'}</p>
      {!collections.length && <button type="button" className="secondary-button" onClick={onCreateCollection}>Create a collection</button>}
    </div>}
  </div>;
}

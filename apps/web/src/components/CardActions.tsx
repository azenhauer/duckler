import { useState } from 'react';
import type { CollectionRecord } from '@visual-library/shared';
import { InterfaceIcon } from './InterfaceIcon';
import { useHoverIntent } from '../lib/hoverIntent';

/** Drag payload for connecting cards: drop the connect icon on another card. */
export const CONNECT_MIME = 'application/x-duckler-connect';

export function CardActions({ cardId, title, collections, onEdit, onMove, onDelete, onConnect }: { cardId?: string; title: string; collections: CollectionRecord[]; onEdit: () => void; onMove: (id: string) => Promise<void>; onDelete: () => void; onConnect?: () => void }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const hover = useHoverIntent(setOpen);
  return <div className={`card-external-actions ${open ? 'is-open' : ''}`} role="group" aria-label={`Actions for ${title}`}>
    <button type="button" aria-label={`Edit ${title}`} title="Edit" onClick={onEdit}><InterfaceIcon name="edit" /></button>
    {onConnect && <button type="button" aria-label={`Connect ${title}`} title="Connect to another card (click, then pick a card — or drag onto it)" onClick={onConnect}
      draggable={!!cardId} onDragStart={event => { if (!cardId) return; event.dataTransfer.setData(CONNECT_MIME, cardId); event.dataTransfer.effectAllowed = 'link'; }}><InterfaceIcon name="connect" /></button>}
    <div className="card-move-control" {...hover}>
      <button type="button" aria-label={`Move ${title} to collection`} title="Move to collection" aria-expanded={open} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}><InterfaceIcon name="move" /></button>
      {open && <div className="card-move-menu">
        {collections.length === 0 && <span>Create a collection first.</span>}
        {collections.map(collection => <button type="button" key={collection.id} disabled={moving} onClick={async () => {
          setMoving(true); setError(''); try { await onMove(collection.id); setOpen(false); } catch { setError('Could not move this card. Try again.'); } finally { setMoving(false); }
        }}>{collection.name}</button>)}
        {error && <span role="alert">{error}</span>}
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>}
    </div>
    <button type="button" aria-label="Delete permanently" title="Delete permanently" onClick={onDelete}><InterfaceIcon name="trash" /></button>
  </div>;
}

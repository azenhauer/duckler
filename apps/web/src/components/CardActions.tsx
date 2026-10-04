import { useState } from 'react';
import type { CollectionRecord } from '@visual-library/shared';
import { InterfaceIcon } from './InterfaceIcon';

export function CardActions({ title, collections, onEdit, onMove, onDelete }: { title: string; collections: CollectionRecord[]; onEdit: () => void; onMove: (id: string) => Promise<void>; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  return <div className="card-external-actions" role="group" aria-label={`Actions for ${title}`}>
    <button type="button" aria-label={`Edit ${title}`} title="Edit" onClick={onEdit}><InterfaceIcon name="edit" /></button>
    <div className="card-move-control">
      <button type="button" aria-label={`Move ${title} to collection`} title="Move to collection" aria-expanded={open} onClick={() => setOpen(!open)}><InterfaceIcon name="move" /></button>
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

import { useState } from 'react';
import type { CollectionRecord } from '@visual-library/shared';
import { NavigationIcon } from './NavigationIcon';

export function CollectionBadge({ collection, onOpen, onRemove }: {
  collection: CollectionRecord;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <span className="collection-badge-wrap" onMouseLeave={() => setOpen(false)}>
    <button type="button" className="collection-badge" aria-label={`Collection ${collection.name}`} aria-expanded={open} onClick={event => { event.stopPropagation(); setOpen(current => !current); }}>
      <NavigationIcon name="collections" />{collection.name}
    </button>
    {open && <span className="collection-badge-popover" role="menu" aria-label={`Actions for ${collection.name}`}>
      <strong><NavigationIcon name="collections" />{collection.name}</strong>
      <button type="button" role="menuitem" onClick={event => { event.stopPropagation(); onOpen(); setOpen(false); }}>Open collection</button>
      <button type="button" role="menuitem" onClick={event => { event.stopPropagation(); onRemove(); setOpen(false); }}>Remove from collection</button>
    </span>}
  </span>;
}

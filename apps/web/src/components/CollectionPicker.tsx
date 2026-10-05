import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CollectionRecord } from '@visual-library/shared';
import { NavigationIcon } from './NavigationIcon';
import { useHoverIntent } from '../lib/hoverIntent';
import { useExitAnimation } from '../lib/exitAnimation';

/** Case-insensitive filter with exact, then prefix, then substring matches. Exported for tests. */
export function rankCollections(collections: CollectionRecord[], query: string): CollectionRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return collections;
  const score = (name: string) => name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
  return collections
    .map(collection => ({ collection, rank: score(collection.name.toLocaleLowerCase()) }))
    .filter(item => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.collection.name.localeCompare(b.collection.name))
    .map(item => item.collection);
}

/** Duplicate display names get an item count so IDs, not names, stay visible to the user. */
export function collectionLabel(collection: CollectionRecord, all: CollectionRecord[]): string {
  const duplicates = all.filter(item => item.name.trim().toLocaleLowerCase() === collection.name.trim().toLocaleLowerCase()).length > 1;
  return duplicates ? `${collection.name} · ${collection.cardIds.length} item${collection.cardIds.length === 1 ? '' : 's'}` : collection.name;
}

type PickerProps = {
  autoFocus?: boolean;
  collections: CollectionRecord[];
  selectedIds: string[];
  onToggle: (collectionId: string, included: boolean) => void;
  onCreate: (name: string) => Promise<void> | void;
  onOpenCollection?: (collectionId: string) => void;
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
};

export function CollectionPickerPopover({ autoFocus = true, collections, selectedIds, onToggle, onCreate, onOpenCollection, anchor, onClose, label }: PickerProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const exitRef = useExitAnimation<HTMLDivElement>();
  const setPanel = useCallback((node: HTMLDivElement | null) => { panelRef.current = node; exitRef(node); }, [exitRef]);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const visible = useMemo(() => rankCollections(collections, query), [collections, query]);

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const openAbove = below < 260 && above > below;
      const maxHeight = Math.max(180, Math.min(380, openAbove ? above : below));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = openAbove ? Math.max(12, rect.top - 8 - Math.min(maxHeight, panelRef.current?.offsetHeight ?? maxHeight)) : rect.bottom + 8;
      setPosition({ left, top, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor, visible.length, creating]);

  // Focus search only when opened deliberately (click/keyboard), not when a hover reveals the picker.
  useEffect(() => { if (autoFocus) searchRef.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [anchor, onClose]);

  const close = () => { onClose(); (anchor.matches('button') ? anchor : anchor.querySelector<HTMLElement>('button'))?.focus(); };
  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const boxes = [...(panelRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])];
    if (!boxes.length) return;
    event.preventDefault();
    const index = boxes.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % boxes.length : index <= 0 ? boxes.length - 1 : index - 1;
    boxes[next]?.focus();
  };
  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreateError('');
    try {
      await onCreate(name);
      setNewName(''); setCreating(false); setQuery('');
    } catch {
      setCreateError("Couldn't create collection");
    }
  };

  // Portal into the app shell so it inherits the active theme's custom properties.
  return createPortal(<div ref={setPanel} className="collection-picker" role="dialog" aria-labelledby={titleId} onKeyDown={moveFocus}
    style={position ? { left: position.left, top: position.top, maxHeight: position.maxHeight } : { visibility: 'hidden' }}
    onClick={event => event.stopPropagation()}>
    <span id={titleId} className="collection-picker-title">{label}</span>
    <input ref={searchRef} type="search" className="collection-picker-search" placeholder="Search collections" aria-label="Search collections" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="collection-picker-list" role="group" aria-label="Collections">
      {collections.length === 0 && <p className="collection-picker-empty">No collections yet</p>}
      {collections.length > 0 && visible.length === 0 && <p className="collection-picker-empty">No collections match “{query.trim()}”</p>}
      {visible.map(collection => {
        const checked = selectedIds.includes(collection.id);
        const name = collectionLabel(collection, collections);
        return <div key={collection.id} className="collection-picker-row" data-checked={checked || undefined}>
          <label>
            <input type="checkbox" checked={checked} onChange={() => onToggle(collection.id, !checked)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onToggle(collection.id, !checked); } }} />
            <span className="collection-picker-check" aria-hidden="true" />
            <span className="collection-picker-name">{name}</span>
          </label>
          {onOpenCollection && <button type="button" className="collection-picker-open" aria-label={`Open collection ${collection.name}`} title="Open collection"
            onClick={() => { onClose(); onOpenCollection(collection.id); }}>Open<span aria-hidden="true"> ›</span></button>}
        </div>;
      })}
    </div>
    {creating ? <div className="collection-picker-create">
      <input autoFocus aria-label="New collection name" placeholder="Collection name" maxLength={120} value={newName}
        onChange={event => setNewName(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submitCreate(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCreating(false); } }} />
      <button type="button" onClick={() => void submitCreate()} disabled={!newName.trim()}>Create</button>
      {createError && <span role="alert" className="collection-picker-error">{createError}</span>}
    </div> : <button type="button" className="collection-picker-new" onClick={() => { setCreating(true); setNewName(query.trim()); }}>+ Create new collection</button>}
  </div>, anchor.closest('.app-shell') ?? document.body);
}

/** The collection controls under a card: one badge per membership, each opening the shared picker. */
export function CardCollectionControls({ cardId, collections, onToggle, onCreate, onOpenCollection }: {
  cardId: string;
  collections: CollectionRecord[];
  onToggle: (collectionId: string, included: boolean) => void;
  onCreate: (name: string) => Promise<void> | void;
  onOpenCollection: (collectionId: string) => void;
}): ReactNode {
  // The picker anchors to the row, not a badge, so it stays open while badges are added or removed.
  const rowRef = useRef<HTMLDivElement>(null);
  const [openFrom, setOpenFrom] = useState<string | null>(null);
  const memberships = collections.filter(collection => collection.cardIds.includes(cardId));
  // Hovering the badge row opens the same picker a click does; it waits before closing so it can be reached.
  const hover = useHoverIntent(useCallback((open: boolean) => setOpenFrom(current => open ? current ?? 'hover' : current === 'hover' ? null : current), []), { openDelay: 220 });
  const toggleFrom = (source: string) => (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    // A click pins a hover-opened picker (so leaving no longer closes it); a second click closes it.
    setOpenFrom(current => current && current !== 'hover' ? null : source);
  };
  return <div ref={rowRef} className="card-collection-pills" onPointerEnter={hover.onPointerEnter} onPointerLeave={hover.onPointerLeave}>
    {memberships.map(collection => <button key={collection.id} type="button" className="collection-badge" aria-haspopup="dialog"
      aria-expanded={openFrom === collection.id}
      aria-label={`Collection ${collection.name}`} title="Manage collections" onClick={toggleFrom(collection.id)}>
      <NavigationIcon name="collections" />{collectionLabel(collection, collections)}
    </button>)}
    {memberships.length === 0 && <button type="button" className="collection-badge collection-badge-add" aria-haspopup="dialog" aria-expanded={openFrom !== null} onClick={toggleFrom('add')}>
      <NavigationIcon name="collections" />Add to collection
    </button>}
    {openFrom && rowRef.current && <CollectionPickerPopover label="Collections for this card" collections={collections} selectedIds={memberships.map(item => item.id)}
      onToggle={onToggle} onCreate={onCreate} onOpenCollection={onOpenCollection} anchor={rowRef.current} onClose={() => setOpenFrom(null)} autoFocus={openFrom !== 'hover'} />}
  </div>;
}

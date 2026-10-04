import { useRef, useState } from 'react';
import type { CardRecord, CollectionRecord } from '@visual-library/shared';
import { Dialog } from './Dialog';
import { InterfaceIcon } from './InterfaceIcon';
import { NavigationIcon } from './NavigationIcon';

export function CardEditor({ card, collections, onClose, onSave, onTrash, onDelete }: {
  card: CardRecord; collections: CollectionRecord[]; onClose: () => void;
  onSave: (card: CardRecord, collectionIds: string[]) => Promise<void>;
  onTrash: () => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState(card);
  const [memberships, setMemberships] = useState(collections.filter(item => item.cardIds.includes(card.id)).map(item => item.id));
  const [sourceOpen, setSourceOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const note = useRef<HTMLTextAreaElement>(null);
  return <Dialog label="Card details" className="card-editor" onClose={() => { if (!saving) onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); if (saving) return;
      if (!draft.title.trim()) { setError('Enter a title.'); return; }
      if (draft.sourceUrl) { try { if (!['http:', 'https:'].includes(new URL(draft.sourceUrl).protocol)) throw new Error(); } catch { setError('Enter a valid website address.'); return; } }
      setSaving(true); setError('');
      try { await onSave({ ...draft, title: draft.title.trim() }, memberships); onClose(); }
      catch { setError('Could not save your changes. Try again.'); }
      finally { setSaving(false); }
    }}>
      <header className="editor-topbar">
        <button type="button" className="editor-close" aria-label="Close details" disabled={saving} onClick={onClose}>×</button>
        <div className="editor-toolbar">
          <button type="button" aria-pressed={sourceOpen} onClick={() => setSourceOpen(!sourceOpen)}><InterfaceIcon name="link" />Source</button>
          <button type="button" onClick={() => note.current?.focus()}><InterfaceIcon name="note" />Note</button>
          <button type="button" aria-expanded={collectionsOpen} onClick={() => setCollectionsOpen(!collectionsOpen)}><NavigationIcon name="collections" />Collections{memberships.length ? ` · ${memberships.length}` : ''}</button>
          <button type="submit" className="editor-save" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </header>
      <div className="editor-content">
        {error && <p role="alert">{error}</p>}
        {card.type === 'image' && card.dataUrl && <img className="editor-image" src={card.dataUrl} alt={card.title} />}
        <input aria-label="Title" className="editor-title" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Untitled" maxLength={1000} />
        {sourceOpen && <input aria-label="Source" value={draft.sourceUrl ?? ''} placeholder="Paste a link" onChange={event => setDraft({ ...draft, sourceUrl: event.target.value || undefined })} />}
        {collectionsOpen && <div className="editor-collections">{collections.length ? collections.map(collection => <label key={collection.id}>
          <input type="checkbox" checked={memberships.includes(collection.id)} onChange={() => setMemberships(current => current.includes(collection.id) ? current.filter(id => id !== collection.id) : [...current, collection.id])} />{collection.name}
        </label>) : <span>No collections yet</span>}</div>}
        <textarea ref={note} aria-label="Note" placeholder="Type here…" value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} />
        <input aria-label="Tags" placeholder="Tags" value={draft.tags.join(', ')} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} />
        <div className="editor-delete-actions"><button type="button" disabled={saving} onClick={onTrash}>{card.trashed ? 'Restore' : 'Move to trash'}</button><button type="button" className="danger" disabled={saving} onClick={onDelete}>Delete permanently</button></div>
      </div>
    </form>
  </Dialog>;
}

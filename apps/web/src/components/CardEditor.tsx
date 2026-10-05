import { useState } from 'react';
import type { CardRecord, CollectionRecord } from '@visual-library/shared';
import { Dialog } from './Dialog';
import { InterfaceIcon } from './InterfaceIcon';

/** PS2-palette tints for a single card; "none" falls back to the global card style. */
export const CARD_TINTS = ['#3cc8ff', '#2a2ca6', '#f2d33d', '#3ddc84', '#ff4b4b', '#ff7ad9', '#9aa6ff', '#e6f6ff'];

export function CardEditor({ card, collections, onClose, onSave, onTrash, onDelete }: {
  card: CardRecord; collections: CollectionRecord[]; onClose: () => void;
  onSave: (card: CardRecord, collectionIds: string[]) => Promise<void>;
  onTrash: () => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState(card);
  const [memberships, setMemberships] = useState(collections.filter(item => item.cardIds.includes(card.id)).map(item => item.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kind = card.type === 'image' ? 'Image' : card.type === 'text' ? 'Note' : 'Link';
  const toggleMembership = (id: string) => setMemberships(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  return <Dialog label="Card details" className="card-editor" onClose={() => { if (!saving) onClose(); }}>
    <form className="editor-sheet" style={draft.color ? { '--card-tint': draft.color } as React.CSSProperties : undefined} onSubmit={async event => {
      event.preventDefault(); if (saving) return;
      if (!draft.title.trim()) { setError('Enter a title.'); return; }
      if (draft.sourceUrl) { try { if (!['http:', 'https:'].includes(new URL(draft.sourceUrl).protocol)) throw new Error(); } catch { setError('Enter a valid website address.'); return; } }
      setSaving(true); setError('');
      try { await onSave({ ...draft, title: draft.title.trim() }, memberships); onClose(); }
      catch { setError('Could not save your changes. Try again.'); }
      finally { setSaving(false); }
    }}>
      <header className="editor-topbar">
        <span className="editor-kind">{kind}</span>
        <div className="editor-removal-actions">
          <button type="button" className="editor-icon-button" disabled={saving} data-tip={card.trashed ? 'Restore' : 'Move to trash'} aria-label={card.trashed ? 'Restore' : 'Move to trash'} onClick={onTrash}><InterfaceIcon name={card.trashed ? 'restore' : 'move'} /></button>
          <button type="button" className="editor-icon-button danger" disabled={saving} data-tip="Delete permanently" aria-label="Delete permanently" onClick={onDelete}><InterfaceIcon name="trash" /></button>
          <button type="button" className="editor-icon-button editor-close" aria-label="Close details" data-tip="Close" disabled={saving} onClick={onClose}><InterfaceIcon name="close" /></button>
        </div>
      </header>

      <div className={`editor-body ${card.type === 'image' && card.dataUrl ? 'has-preview' : ''}`}>
        {card.type === 'image' && card.dataUrl && <figure className="editor-preview"><img className="editor-image" src={card.dataUrl} alt={card.title} /></figure>}
        <div className="editor-fields">
          {error && <p role="alert" className="editor-error">{error}</p>}
          <label className="editor-field"><span>Title</span>
            <input aria-label="Title" className="editor-title" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Untitled" maxLength={1000} /></label>
          <label className="editor-field editor-field-note"><span>Note</span>
            <textarea aria-label="Note" placeholder="Type here…" value={draft.note} rows={card.type === 'text' ? 6 : 3} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
          {card.type !== 'text' && <label className="editor-field"><span>Source</span>
            <input aria-label="Source" value={draft.sourceUrl ?? ''} placeholder="Paste a link" onChange={event => setDraft({ ...draft, sourceUrl: event.target.value || undefined })} /></label>}
          <label className="editor-field"><span>Tags</span>
            <input aria-label="Tags" placeholder="comma, separated" value={draft.tags.join(', ')} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} /></label>
          <fieldset className="editor-field editor-collections"><legend>Collections</legend>
            <div className="editor-chips">{collections.length ? collections.map(collection => <label key={collection.id} className="editor-chip" data-checked={memberships.includes(collection.id) || undefined}>
              <input type="checkbox" checked={memberships.includes(collection.id)} onChange={() => toggleMembership(collection.id)} />{collection.name}
            </label>) : <span className="editor-empty">No collections yet</span>}</div>
          </fieldset>
          <fieldset className="editor-field editor-tints"><legend>Card colour</legend>
            <div className="editor-chips">
              <button type="button" className="editor-tint editor-tint-none" aria-label="Default colour" aria-pressed={!draft.color} onClick={() => setDraft({ ...draft, color: undefined })} />
              {CARD_TINTS.map(color => <button type="button" key={color} className="editor-tint" style={{ background: color }} aria-label={`Colour ${color}`} aria-pressed={draft.color === color} onClick={() => setDraft({ ...draft, color })} />)}
              <label className="editor-tint editor-tint-custom" title="Custom colour"><input type="color" aria-label="Custom card colour" value={draft.color ?? '#3cc8ff'} onChange={event => setDraft({ ...draft, color: event.target.value })} /></label>
            </div>
          </fieldset>
        </div>
      </div>

      <footer className="editor-footer">
        <button type="button" className="editor-action" disabled={saving} onClick={onClose}><b className="glyph-cir" aria-hidden="true">○</b>Cancel</button>
        <button type="submit" className="editor-action editor-save" disabled={saving}><b className="glyph-crs" aria-hidden="true">✕</b>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </form>
  </Dialog>;
}

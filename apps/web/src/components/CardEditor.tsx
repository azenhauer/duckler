import { useState } from 'react';
import type { CardRecord, CollectionRecord } from '@visual-library/shared';
import { Dialog } from './Dialog';
import { BButton } from './BButton';
import { ColorPickerButton } from './ColorPicker';
import { TileMenu } from './TileMenu';

/** A card connected to the one being edited, shown as a message box in its dialogue. */
export type ConnectedCard = { id: string; title: string; note: string; type: CardRecord['type']; dataUrl?: string };
const kindLabel = (type: CardRecord['type']) => type === 'image' ? 'Image' : type === 'pdf' ? 'PDF' : type === 'text' ? 'Note' : 'Link';
import { InterfaceIcon } from './InterfaceIcon';
import { OcrPanel } from './OcrPanel';
import { PdfViewer, type PdfPageNote } from './PdfViewer';

/** PS2-palette tints for a single card; "none" falls back to the global card style. */
export const CARD_TINTS = ['#3cc8ff', '#2a2ca6', '#f2d33d', '#3ddc84', '#ff4b4b', '#ff7ad9', '#9aa6ff', '#e6f6ff'];

export function CardEditor({ card, collections, onClose, onSave, onTrash, onDelete, onCapturePdfPage, pdfSource, pdfNotes, onCreateLinkedNote, onOpenCard, connected = [], onDisconnect, onNoteFromSelection }: {
  card: CardRecord; collections: CollectionRecord[]; onClose: () => void;
  onSave: (card: CardRecord, collectionIds: string[]) => Promise<void>;
  onTrash: () => void; onDelete: () => void;
  onCapturePdfPage?: (page: number, image: string) => Promise<void>;
  /** Title of the PDF this image was captured from, when it is still in the library. */
  pdfSource?: { title: string; open: () => void };
  /** Notes linked to pages of this PDF. */
  pdfNotes?: PdfPageNote[];
  /** Creates a note linked to a PDF page: this PDF's, or the page this image was captured from. */
  onCreateLinkedNote?: (text: string, page?: number) => Promise<void>;
  onOpenCard?: (id: string) => void;
  connected?: ConnectedCard[];
  onDisconnect?: (id: string) => void;
  /** Right-click on selected Note text: makes a new note from it, connected to this card. */
  onNoteFromSelection?: (text: string) => Promise<void>;
}) {
  const [selectionMenu, setSelectionMenu] = useState<{ left: number; top: number; text: string } | null>(null);
  const connectedNotes = connected.filter(item => item.type === 'text');
  const [draft, setDraft] = useState(card);
  const [memberships, setMemberships] = useState(collections.filter(item => item.cardIds.includes(card.id)).map(item => item.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kind = card.type === 'image' ? 'Image' : card.type === 'pdf' ? 'PDF' : card.type === 'text' ? 'Note' : 'Link';
  const toggleMembership = (id: string) => setMemberships(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  const selectionItems = selectionMenu ? [
    { label: 'New note from selection', onSelect: () => { void onNoteFromSelection?.(selectionMenu.text); } },
    { label: 'Copy', onSelect: () => { void navigator.clipboard?.writeText(selectionMenu.text).catch(() => {}); } },
  ] : [];
  return <>{selectionMenu && <TileMenu title="Selected text" position={selectionMenu} items={selectionItems} onClose={() => setSelectionMenu(null)} />}<Dialog label="Card details" className="card-editor" onClose={() => { if (!saving) onClose(); }}>
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
          <BButton className="editor-close" label="Close details" disabled={saving} onClick={onClose} />
        </div>
      </header>

      <div className={`editor-body ${(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? 'has-preview' : ''}`}>
        {card.type === 'pdf' && card.pdf ? <figure className="editor-preview"><PdfViewer pdf={card.pdf} onCapture={onCapturePdfPage} notes={pdfNotes} onOpenNote={onOpenCard}
          onCreateNote={onCreateLinkedNote ? (page, text) => onCreateLinkedNote(text, page) : undefined} /></figure>
          : card.type === 'image' && card.dataUrl && <figure className="editor-preview"><img className="editor-image" src={card.dataUrl} alt={card.title} />
            {/* Connected notes speak over the image, like notes on a PDF page. */}
            {connectedNotes.length > 0 && <ul className="pdf-messages" aria-label="Connected notes">{connectedNotes.slice(0, 3).map(item => <li key={item.id}>
              <button type="button" className="pdf-message" onClick={() => onOpenCard?.(item.id)} aria-label={`Open note ${item.title}`}><b>Note</b><span>{item.note || item.title}</span></button></li>)}
              {connectedNotes.length > 3 && <li className="pdf-message-more">+{connectedNotes.length - 3} more</li>}</ul>}
          </figure>}
        <div className="editor-fields">
          {error && <p role="alert" className="editor-error">{error}</p>}
          <label className="editor-field"><span>Title</span>
            <input aria-label="Title" className="editor-title" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Untitled" maxLength={1000} /></label>
          <label className="editor-field editor-field-note"><span>Note</span>
            <textarea aria-label="Note" placeholder="Type here…" value={draft.note} rows={card.type === 'text' ? 6 : 3} onChange={event => setDraft({ ...draft, note: event.target.value })}
              onContextMenu={event => {
                const field = event.currentTarget, text = field.value.slice(field.selectionStart, field.selectionEnd).trim();
                if (!text || !onNoteFromSelection) return;
                event.preventDefault(); event.stopPropagation();
                setSelectionMenu({ left: event.clientX, top: event.clientY, text });
              }} /></label>
          {draft.caption !== undefined && <label className="editor-field"><span>Caption</span><textarea aria-label="Caption" value={draft.caption} maxLength={10000} rows={2} onChange={event => setDraft({ ...draft, caption: event.target.value })} /></label>}
          {card.type === 'image' && card.dataUrl && <OcrPanel dataUrl={card.dataUrl} value={draft.ocr} onChange={ocr => setDraft({ ...draft, ocr })}
            onCreateNote={card.source && onCreateLinkedNote ? text => onCreateLinkedNote(text) : undefined} noteTarget={card.source ? `page ${card.source.page} of ${pdfSource?.title ?? card.source.fileName ?? 'its PDF'}` : undefined} />}
          {card.source && <p className="editor-provenance">From page {card.source.page} of {pdfSource ? <button type="button" className="editor-link" onClick={pdfSource.open}>{pdfSource.title}</button> : <span>{card.source.fileName ?? 'a PDF no longer in your library'}</span>}</p>}
          {connected.length > 0 && <section className="editor-dialogue" aria-label="Connected cards">
            <span className="editor-dialogue-title">Dialogue · {connected.length}</span>
            <ul>{connected.map(item => <li key={item.id}>
              <button type="button" className="pdf-message dialogue-message" onClick={() => onOpenCard?.(item.id)} aria-label={`Open connected ${item.title}`}>
                {item.dataUrl && (item.type === 'image' || item.type === 'pdf') && <img src={item.dataUrl} alt="" />}
                <b>{kindLabel(item.type)} · {item.title}</b>{item.note && <span>{item.note}</span>}
              </button>
              {onDisconnect && <button type="button" className="dialogue-unlink" aria-label={`Disconnect ${item.title}`} title="Disconnect" onClick={() => onDisconnect(item.id)}>×</button>}
            </li>)}</ul>
          </section>}
          {card.type === 'pdf' && card.pdf && <p className="editor-provenance">{card.pdf.fileName} · {card.pdf.pageCount} page{card.pdf.pageCount === 1 ? '' : 's'}{card.pdf.text ? ' · text searchable' : ' · no embedded text (scanned)'}</p>}
          {card.type !== 'text' && card.type !== 'pdf' && <label className="editor-field"><span>Source</span>
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
              <ColorPickerButton className="editor-tint editor-tint-custom" label="Custom card colour" title="Custom colour" value={draft.color ?? '#3cc8ff'} swatches={CARD_TINTS}
                onChange={color => setDraft({ ...draft, color })} />
            </div>
          </fieldset>
        </div>
      </div>

      <footer className="editor-footer">
        <button type="button" className="editor-action" disabled={saving} onClick={onClose}><b className="glyph-cir" aria-hidden="true">○</b>Cancel</button>
        <button type="submit" className="editor-action editor-save" disabled={saving}><b className="glyph-crs" aria-hidden="true">✕</b>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </form>
  </Dialog></>;
}

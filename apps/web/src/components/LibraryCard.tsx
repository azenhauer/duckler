import { memo, useState, type CSSProperties } from 'react';
import type { CardRecord, CollectionRecord } from '@visual-library/shared';
import { CardActions, CONNECT_MIME } from './CardActions';
import { InterfaceIcon } from './InterfaceIcon';
import { ScreenshotNote } from './ScreenshotNote';
import { CardCollectionControls } from './CollectionPicker';
import { useThumbnail, type CardThumb } from '../lib/thumbnails';

/** What a card can ask the library to do. Read at event time, so cards never re-render for it. */
export type CardApi = {
  connectingFrom: string | null;
  select: (cardId: string) => void;
  open: (cardId: string) => void;
  startConnect: (cardId: string) => void;
  connect: (fromId: string, toId: string) => void;
  remove: (cardId: string) => void;
  move: (card: CardRecord, collectionId: string) => Promise<void>;
  textMenu: (menu: { left: number; top: number; text: string; cardId: string }) => void;
  changeMembership: (cardId: string, collectionId: string, included: boolean) => void;
  createCollection: (cardId: string, name: string) => void | Promise<void>;
  openCollection: (collectionId: string) => void;
  storeThumb: (cardId: string, thumb: CardThumb) => void;
};

type Props = {
  card: CardRecord;
  collections: CollectionRecord[];
  api: () => CardApi;
  isOpen: boolean;
  isChecked: boolean;
  isNew: boolean;
  isCaptured: boolean;
  isRemoving: boolean;
  connectionCount: number;
  /** Someone else's card (a shared link): no selection, actions or collection controls; a click opens it. */
  readOnly?: boolean;
};

// One formatter for every card: toLocaleDateString(…, options) builds a new Intl formatter on each call.
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

// Touch screens show every card's action bar (there is no hover), so they render it from the start.
const touchOnly = typeof window !== 'undefined' && (window.matchMedia?.('(hover: none)').matches ?? false);

const hostOf = (url?: string) => {
  if (!url) return null;
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
};

/**
 * One card in the library grid. Memoized: selecting, searching or hovering elsewhere only re-renders
 * the cards whose own props changed (with hundreds of cards, re-rendering all of them cost ~200 ms).
 */
export const LibraryCard = memo(function LibraryCard({ card, collections, api, isOpen, isChecked, isNew, isCaptured, isRemoving, connectionCount, readOnly = false }: Props) {
  const sourceLabel = hostOf(card.sourceUrl);
  const picture = useThumbnail(card, card.type === 'image' || card.type === 'pdf' ? card.dataUrl : undefined, (cardId, thumb) => api().storeThumb(cardId, thumb));
  // The hover action bar is 40% of a card's elements but shows on one card at a time, so it is made the
  // first time the card is hovered or focused (then kept, so its fade-out still plays).
  const [armed, setArmed] = useState(touchOnly);
  const showActions = armed || isChecked || isOpen;
  const arm = armed ? undefined : () => setArmed(true);
  return (
    <div className={`library-card ${isNew ? 'is-new' : ''} ${isCaptured ? 'is-captured' : ''} ${isRemoving ? 'is-removing' : ''} ${isChecked ? 'is-checked' : ''}`}
      onPointerEnter={arm} onFocus={arm}>
      {!readOnly && <>
        <div className="tile-header">
          <input type="checkbox" aria-label={`Select ${card.title}`} checked={isChecked}
            onChange={() => api().select(card.id)} onClick={event => event.stopPropagation()} />
        </div>
        {showActions && <CardActions cardId={card.id} title={card.title} collections={collections}
          onConnect={() => api().startConnect(card.id)} onEdit={() => api().open(card.id)}
          onDelete={() => api().remove(card.id)} onMove={collectionId => api().move(card, collectionId)} />}
      </>}
      <article
        data-card-id={card.id}
        className={`card-tile card-type-${card.type} ${isOpen ? 'selected' : ''} ${isChecked ? 'is-checked' : ''}`}
        data-tinted={card.color ? 'true' : undefined}
        style={card.color ? { '--card-tint': card.color } as CSSProperties : undefined}
        tabIndex={0}
        aria-label={`Open ${card.title}`}
        aria-describedby="card-select-hint"
        // Each click adds or removes the card from the selection; a double click opens the editor.
        onClick={event => {
          if (readOnly) { api().open(card.id); return; }
          const { connectingFrom } = api();
          if (connectingFrom) { if (connectingFrom !== card.id) api().connect(connectingFrom, card.id); return; }
          // Finishing a text selection inside the card isn't a click on the card.
          const picked = window.getSelection();
          if (picked?.toString().trim() && picked.anchorNode && event.currentTarget.contains(picked.anchorNode)) return;
          if (event.detail < 2) api().select(card.id);
        }}
        onDragOver={event => { if (event.dataTransfer.types.includes(CONNECT_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'link'; event.currentTarget.classList.add('is-connect-target'); } }}
        onDragLeave={event => event.currentTarget.classList.remove('is-connect-target')}
        onDrop={event => { const from = event.dataTransfer.getData(CONNECT_MIME); event.currentTarget.classList.remove('is-connect-target'); if (from) { event.preventDefault(); api().connect(from, card.id); } }}
        onContextMenu={event => {
          // Right-click on text selected inside this card: make a new note from it.
          const selection = window.getSelection(), text = selection?.toString().trim() ?? '';
          if (!text || !selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return;
          event.preventDefault(); event.stopPropagation();
          api().textMenu({ left: event.clientX, top: event.clientY, text, cardId: card.id });
        }}
        onDoubleClick={() => api().open(card.id)}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter') { event.preventDefault(); api().open(card.id); }
          else if (event.key === ' ') { event.preventDefault(); api().select(card.id); }
        }}
      >
        {(card.type === 'image' || card.type === 'pdf') && card.dataUrl ? (picture
          ? <img src={picture} alt={card.title} className="card-image" decoding="async" loading="lazy" />
          : <span className="card-image card-image-pending" role="img" aria-label={card.title} />) : null}
        {card.type === 'pdf' && <span className="card-pdf-badge">PDF · {card.pdf?.pageCount ?? '?'} p</span>}
        {card.source && <span className="card-pdf-badge card-source-badge">Page {card.source.page}</span>}
        {connectionCount > 0 && <span className="card-pdf-badge card-link-badge" title="Connected cards">⇄ {connectionCount}</span>}
        {isCaptured && <span className="capture-flash" aria-hidden="true"><i /><i /><i /><i /></span>}
        {card.type === 'text' ? <div className="text-card-preview note-card-preview"><span className="card-kind">NOTE</span><p>{card.note || card.title}</p>{card.caption && <small className="note-caption">{card.caption}</small>}</div> : null}
        {card.type === 'bookmark' ? <div className="bookmark-card-preview">
          <span className="card-kind">LINK <InterfaceIcon name="link" /></span>
          <h2>{card.title}</h2>{card.note && <p>{card.note}</p>}
          {sourceLabel && <span className="bookmark-domain">{sourceLabel}</span>}
        </div> : null}
        <div className="card-body">
          {card.type !== 'bookmark' && <h2>{card.title}</h2>}
          <div className="card-footer-meta" hidden={card.type === 'image'}>
            <span>{card.type === 'image' ? 'Image' : card.type === 'text' ? 'Note' : 'Link'}</span>
            <time dateTime={card.createdAt}>{shortDate.format(new Date(card.createdAt))}</time>
          </div>
          {card.tags.length > 0 && <div className="card-tag-list">{card.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</div>}
        </div>
      </article>
      {card.type === 'image' && <ScreenshotNote note={card.note} />}
      {!readOnly && <CardCollectionControls cardId={card.id} collections={collections}
        onToggle={(collectionId, included) => api().changeMembership(card.id, collectionId, included)}
        onCreate={name => api().createCollection(card.id, name)}
        onOpenCollection={collectionId => api().openCollection(collectionId)} />}
    </div>
  );
});

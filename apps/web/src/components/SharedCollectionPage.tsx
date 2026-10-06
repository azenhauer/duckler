import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createCardFromInput, createCollectionFromInput, type CardRecord, type SharedCollection } from '@visual-library/shared';
import { cardDb } from '../lib/cardDb';
import { loadSharedCollection } from '../lib/shareLinks';
import { appearanceStyle, loadAppearance } from '../lib/appearance';
import { useCardStyle } from '../lib/cardStyle';
import { LibraryCard, type CardApi } from './LibraryCard';
import { InterfaceIcon } from './InterfaceIcon';
import { Notifications, notify } from './Notifications';
import { useUiSounds } from './UiSounds';
import { Dialog } from './Dialog';
import { BButton } from './BButton';
import { ProfileHover } from './ProfileHover';

// The viewer's own look (theme, skin, card style), like their library; dark by default.
const viewerTheme = (): 'light' | 'dark' => {
  try {
    const mode = localStorage.getItem('duckler-theme-mode') ?? localStorage.getItem('visual-library-theme');
    if (mode === 'light' || mode === 'dark') return mode;
    if (mode === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch { /* storage blocked */ }
  return 'dark';
};

type Filter = 'all' | 'image' | 'link' | 'text';
const FILTERS: [Filter, string][] = [['all', 'All items'], ['image', 'Images'], ['link', 'Links'], ['text', 'Notes']];
const matches = (card: CardRecord, filter: Filter) =>
  filter === 'all' || (filter === 'image' ? card.type === 'image' || card.type === 'pdf' : filter === 'link' ? card.type === 'bookmark' : card.type === 'text');

/** Shared cards as ordinary card records, so they render with the library's own card component. */
const asCards = (shared: SharedCollection): CardRecord[] => shared.cards.map((item, index) => ({
  id: `shared-${index}`, type: item.type, title: item.title || 'Untitled', note: item.note, ...(item.caption ? { caption: item.caption } : {}),
  ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}), tags: item.tags, createdAt: item.createdAt, updatedAt: item.createdAt,
  trashed: false, searchText: `${item.title} ${item.note} ${item.caption ?? ''} ${item.tags.join(' ')}`.toLowerCase(),
  ...(item.color ? { color: item.color } : {}), ...(item.image ? { dataUrl: item.image } : {}),
}));

/**
 * duckler.pages.dev/s/<file id>#<key>: someone's shared collection, laid out like a collection page
 * (same search, filters, cards and sounds) but read-only. Everything in it is untrusted: text is
 * rendered as text, images are raster data URLs and links are http(s) (both checked when parsed).
 */
export function SharedCollectionPage({ fileId, keyFragment }: { fileId: string; keyFragment: string }) {
  useUiSounds(); // same UI sounds as the library
  const cardStyle = useCardStyle();
  const [theme] = useState(viewerTheme);
  const [appearance] = useState(loadAppearance);
  const [shared, setShared] = useState<SharedCollection | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    document.title = 'Shared collection · Duckler';
    loadSharedCollection(fileId, keyFragment).then(result => { setShared(result); document.title = `${result.collection.name} · Duckler`; })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'This shared collection could not be opened.'));
  }, [fileId, keyFragment]);

  const cards = useMemo(() => (shared ? asCards(shared) : []), [shared]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = cards.filter(card => matches(card, filter) && (!query || card.searchText.includes(query)));
    return sort === 'newest' ? list : [...list].reverse();
  }, [cards, filter, search, sort]);
  const open = cards.find(card => card.id === openId) ?? null;

  const api = useCallback((): CardApi => ({
    connectingFrom: null, select: () => {}, open: setOpenId, startConnect: () => {}, connect: () => {}, remove: () => {}, toggleFavorite: () => {},
    move: async () => {}, textMenu: () => {}, changeMembership: () => {}, createCollection: () => {}, openCollection: () => {}, storeThumb: () => {},
  }), []);

  const saveCopy = async () => {
    if (!shared) return;
    setSaving('saving');
    try {
      const copies = shared.cards.map(item => ({
        ...createCardFromInput({ type: item.type, title: item.title.trim() || 'Untitled', note: item.note, caption: item.caption, sourceUrl: item.sourceUrl, tags: item.tags, dataUrl: item.image }),
        ...(item.color ? { color: item.color } : {}),
      }));
      const collection = createCollectionFromInput({ name: shared.collection.name, description: shared.collection.description, cardIds: copies.map(card => card.id) });
      await cardDb.transaction('rw', cardDb.cards, cardDb.collections, async () => { await cardDb.cards.bulkPut(copies); await cardDb.collections.put(collection); });
      setSaving('saved');
      notify({ title: 'Saved to your library', detail: `“${shared.collection.name}” · ${copies.length} cards` });
    } catch { setSaving('idle'); notify({ kind: 'error', title: 'Could not save a copy', detail: 'This browser refused to store it.' }); }
  };

  const shellStyle = { ...appearanceStyle(appearance.values, theme), ...cardStyle.shellStyle } as CSSProperties;
  return <main className="app-shell shared-page" {...cardStyle.shellProps} style={shellStyle}>
    <section className="content panel" data-view="library">
      <div className="top-scrim" aria-hidden="true" />
      {shared && <div className="refs-search is-compact">
        <label className="sidebar-search workspace-search refs-search-field" aria-label="Search this collection">
          <InterfaceIcon name="search" />
          <input aria-label="Search" value={search} placeholder={`Search ${shared.collection.name}`} onChange={event => setSearch(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape' && search) { event.stopPropagation(); setSearch(''); } }} />
          {search && <button type="button" className="refs-search-clear" aria-label="Clear search" onClick={() => setSearch('')}>×</button>}
        </label>
      </div>}
      <header className="page-header">
        <a className="page-back b-button" aria-label="Go to my library" href="/"><span className="b-ring" aria-hidden="true" /><span className="b-label" aria-hidden="true">Back</span></a>
        <div>
          {shared && <div className="collection-owner-row"><ProfileHover showName label={`Shared by ${shared.owner || 'a Duckler user'}`}
            profile={{ name: shared.owner || 'Duckler user', photo: shared.ownerPhoto, tag: shared.ownerTag, bio: shared.ownerBio, color: shared.ownerColor, cover: shared.ownerCover }}
            extra={<span className="shared-badge">View only</span>} /></div>}
          <h1>{shared?.collection.name ?? (error ? 'Can’t open this link' : 'Opening…')}</h1>
          {shared?.collection.description && <p className="collection-description is-static">{shared.collection.description}</p>}
        </div>
      </header>

      {error && <div className="shared-status" role="alert"><p>{error}</p><a href="/">Go to my library</a></div>}
      {!shared && !error && <p className="shared-status" role="status">Opening shared collection…</p>}

      {shared && <>
        <div className="collection-shelf shared-shelf">
          <div className="toolbar"><div className="toolbar-actions">
            <label className="option-field shared-sort"><span className="visually-hidden">Sort</span>
              <select aria-label="Sort" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </select>
            </label>
            {saving === 'saved'
              ? <a className="collection-share is-shared" href="/"><InterfaceIcon name="check" /><span>Saved · open library</span></a>
              : <button type="button" className="collection-share" disabled={saving === 'saving'} onClick={() => void saveCopy()}><InterfaceIcon name="upload" /><span>{saving === 'saving' ? 'Saving…' : 'Save a copy'}</span></button>}
          </div></div>
        </div>
        <nav className="media-filter-row" aria-label="Filter by media type">
          {FILTERS.map(([value, label]) => <button key={value} type="button" className={`media-filter ${filter === value ? 'active' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </nav>
        <div className="library-grid card-size-comfortable">
          {visible.map(card => <LibraryCard key={card.id} card={card} collections={[]} api={api} readOnly
            isOpen={openId === card.id} isChecked={false} isNew={false} isCaptured={false} isRemoving={false} connectionCount={0} />)}
        </div>
        {!visible.length && <div className="empty-state"><h2>{cards.length ? 'No matches' : 'This collection is empty'}</h2>{cards.length > 0 && <button type="button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>}</div>}
      </>}
    </section>

    {open && <Dialog label={open.title} className="app-settings shared-card-detail" onClose={() => setOpenId(null)}>
      <BButton className="close-detail" label="Close card" onClick={() => setOpenId(null)} />
      {open.dataUrl && <img src={open.dataUrl} alt={open.title} />}
      <h2>{open.title}</h2>
      {open.note && <p className="shared-detail-note">{open.note}</p>}
      {open.caption && <p className="note-caption">{open.caption}</p>}
      {open.sourceUrl && <a className="bookmark-domain" href={open.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{open.sourceUrl}</a>}
      {open.tags.length > 0 && <div className="card-tag-list">{open.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>}
    </Dialog>}
    <ul className="ps-hints" aria-hidden="true"><li><b className="crs">✕</b>Open</li><li><b className="cir">○</b>Back</li></ul>
    <Notifications />
    <div className="bottom-scrim" aria-hidden="true" />
  </main>;
}

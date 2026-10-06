import { useState } from 'react';
import { CONTEXT_SHORTCUTS, SHORTCUT_GROUPS, type Glyph, type Shortcut, type ShortcutContext } from '../lib/shortcuts';

const GLYPH_CLASS: Record<Glyph, string> = { '✕': 'glyph-crs', '○': 'glyph-cir', '△': 'glyph-tri', '□': 'glyph-sqr' };
const KEY = 'duckler-shortcut-legend';
const readOpen = () => { try { return localStorage.getItem(KEY) !== 'closed'; } catch { return true; } };

function Row({ shortcut }: { shortcut: Shortcut }) {
  return <div className="ps-shortcut-row">
    <b className={`ps-shortcut-glyph ${GLYPH_CLASS[shortcut.glyph]}`} aria-hidden="true">{shortcut.glyph}</b>
    <dt><kbd>{shortcut.keys}</kbd></dt>
    <dd>{shortcut.label}</dd>
  </div>;
}

/** One PS2-style table: a title bar and glyph · key · action rows. */
export function ShortcutTable({ title, rows }: { title: string; rows: Shortcut[] }) {
  return <section className="ps-shortcut-table" aria-label={`${title} shortcuts`}>
    <h3>{title}</h3>
    <dl>{rows.map(item => <Row key={item.keys + item.label} shortcut={item} />)}</dl>
  </section>;
}

/** Every table, for the "?" dialog. */
export function ShortcutTables() {
  return <div className="ps-shortcut-tables">{SHORTCUT_GROUPS.map(group => <ShortcutTable key={group.title} {...group} />)}</div>;
}

const TITLES: Record<ShortcutContext, string> = { home: 'Home', library: 'Library', selection: 'Selection', composer: 'New card', editor: 'Editing', canvas: 'Canvas' };

/**
 * The corner legend, like the button legend at the bottom of a PS2 menu: the keys that matter for what
 * is on screen. A click on its title folds it to a single "? Keys" tab (remembered on this device).
 */
export function ShortcutLegend({ context, onShowAll }: { context: ShortcutContext; onShowAll: () => void }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => setOpen(current => { try { localStorage.setItem(KEY, current ? 'closed' : 'open'); } catch { /* private mode */ } return !current; });
  return <aside className={`ps-shortcut-legend ${open ? 'is-open' : ''}`} aria-label="Keyboard shortcuts for this screen">
    <button type="button" className="ps-shortcut-legend-title" aria-expanded={open} onClick={toggle}>
      <b className="glyph-tri" aria-hidden="true">△</b>{open ? TITLES[context] : 'Keys'}
    </button>
    {open && <>
      <dl>{CONTEXT_SHORTCUTS[context].map(item => <Row key={item.keys + item.label} shortcut={item} />)}</dl>
      <button type="button" className="ps-shortcut-legend-more" onClick={onShowAll}>All shortcuts <kbd>?</kbd></button>
    </>}
  </aside>;
}

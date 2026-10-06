/**
 * Every shortcut the app has, in one place: the "?" tables and the corner legend both read it. Each
 * row carries a PS2 face-button glyph by meaning, as in the console's own legends: ✕ confirm or open,
 * ○ back or cancel, △ options and extra actions, □ select or find.
 */
export type Glyph = '✕' | '○' | '△' | '□';
export type Shortcut = { glyph: Glyph; keys: string; label: string };
export type ShortcutContext = 'home' | 'library' | 'selection' | 'composer' | 'editor' | 'canvas';

const row = (glyph: Glyph, keys: string, label: string): Shortcut => ({ glyph, keys, label });

/** The "?" dialog: one small table per area. */
export const SHORTCUT_GROUPS: { title: string; rows: Shortcut[] }[] = [
  { title: 'Anywhere', rows: [row('□', '/', 'Search'), row('✕', 'N', 'New note'), row('△', 'Shift + F10', 'Quick add menu'), row('○', 'Esc', 'Close or go back'), row('△', '?', 'These tables')] },
  { title: 'Cards', rows: [row('□', 'Click', 'Select or deselect'), row('□', 'Ctrl / ⌘ + A', 'Select every card in view'), row('✕', 'Double-click · Enter', 'Open'), row('△', 'F', 'Star · Favorites'), row('○', 'Delete', 'Delete (with Undo)')] },
  { title: 'Writing a card', rows: [row('✕', 'Enter', 'Save the note'), row('□', 'Shift + Enter', 'New line'), row('△', 'Drop', 'Add text, links or a picture'), row('○', 'Esc', 'Close')] },
  { title: 'Canvas', rows: [row('○', 'Ctrl / ⌘ + Z', 'Undo'), row('✕', 'Ctrl / ⌘ + Y', 'Redo'), row('○', 'Delete', 'Remove the selected objects'), row('□', 'Esc', 'Back to the select tool')] },
];

/** The corner legend: the few keys that matter for what is on screen now. */
export const CONTEXT_SHORTCUTS: Record<ShortcutContext, Shortcut[]> = {
  home: [row('□', '/', 'Search'), row('✕', 'N', 'New note'), row('△', '?', 'Shortcuts')],
  library: [row('□', 'Click', 'Select'), row('✕', 'Double-click', 'Open'), row('□', '/', 'Search'), row('△', '?', 'Shortcuts'), row('○', 'Esc', 'Back')],
  selection: [row('△', 'F', 'Star'), row('□', 'Ctrl+A', 'Select all'), row('○', 'Delete', 'Delete'), row('○', 'Esc', 'Clear')],
  composer: [row('✕', 'Enter', 'Save'), row('□', 'Shift+Enter', 'New line'), row('△', 'Drop', 'Add to card'), row('○', 'Esc', 'Close')],
  editor: [row('△', 'Drop', 'Add to card'), row('○', 'Esc', 'Close')],
  canvas: [row('○', 'Ctrl+Z', 'Undo'), row('✕', 'Ctrl+Y', 'Redo'), row('○', 'Delete', 'Remove'), row('□', 'Esc', 'Select tool')],
};

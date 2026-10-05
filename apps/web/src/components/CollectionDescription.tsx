import { useEffect, useRef, useState } from 'react';

export const MAX_DESCRIPTION = 2000;

/**
 * A collection's description, under its name. Click to edit; Ctrl+Enter or clicking away saves,
 * Escape keeps the old text. Shown in share links too.
 */
export function CollectionDescription({ value, onSave }: { value: string; onSave: (description: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    // Caught before dialogs or Back see it, so Escape only cancels the edit.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      cancelled.current = true; setDraft(value); setEditing(false);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [editing, value]);
  const finish = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    setEditing(false);
    const next = draft.trim().slice(0, MAX_DESCRIPTION);
    if (next !== value) onSave(next);
  };
  if (editing) return <div className="collection-description is-editing">
    <textarea ref={field} aria-label="Collection description" value={draft} maxLength={MAX_DESCRIPTION} rows={3} placeholder="What is this collection about?"
      onChange={event => setDraft(event.target.value)} onBlur={finish}
      onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); field.current?.blur(); } }} />
    <small>{draft.length}/{MAX_DESCRIPTION} · Ctrl+Enter saves · Esc cancels</small>
  </div>;
  return <button type="button" className={`collection-description ${value ? '' : 'is-empty'}`} aria-label={value ? 'Edit collection description' : 'Add a collection description'}
    onClick={() => setEditing(true)}>{value || 'Add a description…'}</button>;
}

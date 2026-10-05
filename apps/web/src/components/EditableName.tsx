import { useEffect, useRef, useState } from 'react';

/**
 * The profile name on a profile card: click it to rename in place. Changes apply as you type,
 * Enter or clicking away finishes, Escape puts the old name back.
 */
export function EditableName({ value, placeholder, onChange, maxLength = 48 }: { value: string; placeholder: string; onChange: (name: string) => void; maxLength?: number }) {
  const [editing, setEditing] = useState(false);
  const original = useRef(value);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (!editing) return;
    // Caught before any dialog or menu sees it, so Escape only cancels the rename.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      changeRef.current(original.current); setEditing(false);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [editing]);

  if (editing) return <input className="profile-name-inline" aria-label="Rename profile" autoFocus value={value} maxLength={maxLength} placeholder={placeholder}
    onFocus={event => event.currentTarget.select()}
    onClick={event => event.stopPropagation()}
    onChange={event => onChange(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setEditing(false); } }}
    onBlur={() => setEditing(false)} />;
  return <strong><button type="button" className="profile-name-button" title="Click to rename" aria-label={`Rename profile ${value.trim() || placeholder}`}
    onClick={event => { event.stopPropagation(); original.current = value; setEditing(true); }}>{value.trim() || placeholder}</button></strong>;
}

import { useEffect, useId, useRef, useState } from 'react';

export function ScreenshotNote({ note }: { note: string }) {
  const id = useId();
  const text = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  // A first guess (4 clamped lines ≈ 180 characters) so the measured answer rarely changes the layout again.
  const [long, setLong] = useState(() => note.split('\n').length > 4 || note.length > 180);
  useEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1);
    // ResizeObserver reports once after the browser's own layout. Measuring here as well forced a
    // synchronous layout of the whole grid (100 image cards: ~230 ms when opening a 300-card view).
    if (typeof ResizeObserver === 'undefined') { measure(); return; }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [note, expanded]);
  if (!note.trim()) return null;
  return <aside className="screenshot-note" aria-label="Screenshot note">
    <p ref={text} id={id} className={expanded ? 'is-expanded' : ''}>{note}</p>
    {(long || expanded) && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
  </aside>;
}

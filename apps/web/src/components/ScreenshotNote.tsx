import { useEffect, useId, useRef, useState } from 'react';

export function ScreenshotNote({ note }: { note: string }) {
  const id = useId();
  const text = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [note, expanded]);
  if (!note.trim()) return null;
  return <aside className="screenshot-note" aria-label="Screenshot note">
    <p ref={text} id={id} className={expanded ? 'is-expanded' : ''}>{note}</p>
    {(long || expanded) && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
  </aside>;
}

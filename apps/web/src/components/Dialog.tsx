import { useEffect, useRef, type ReactNode } from 'react';
import { useExitAnimation } from '../lib/exitAnimation';

export function Dialog({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const exitRef = useExitAnimation<HTMLDivElement>();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea, select, [tabindex="0"]') ?? []).filter(el => !el.closest('[hidden]'));
    (focusable()[0] ?? ref.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, []);
  return <div ref={exitRef} className="reader-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className}>{children}</div>
  </div>;
}

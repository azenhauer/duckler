import { useEffect, useRef } from 'react';
import { HOVER_CLOSE_DELAY } from '../lib/hoverIntent';

export type TileMenuItem = { label: string; onSelect: () => void; danger?: boolean };

/**
 * Right-click menu for a collection or canvas tile. Like the quick-add menu it only stays while it has
 * the pointer or focus: it closes when the pointer leaves (or never arrives), on blur, scroll, resize,
 * Escape or a click elsewhere.
 */
export function TileMenu({ title, position, items, onClose }: { title: string; position: { left: number; top: number }; items: TileMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hovered = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const schedule = (delay: number | null) => { window.clearTimeout(timer.current); if (delay !== null) timer.current = window.setTimeout(() => close.current(), delay); };

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    schedule(1500);
    const shut = () => close.current();
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) shut(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); shut(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const options = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const index = options.indexOf(document.activeElement as HTMLElement);
      options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
    };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', shut, true); window.addEventListener('resize', shut); window.addEventListener('blur', shut);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', shut, true); window.removeEventListener('resize', shut); window.removeEventListener('blur', shut);
    };
  }, []);

  return <div ref={ref} className="quick-add-context tile-menu" role="menu" aria-label={`${title} options`}
    style={{ left: Math.max(12, Math.min(position.left, window.innerWidth - 220)), top: Math.max(12, Math.min(position.top, window.innerHeight - 40 - items.length * 40)) }}
    onPointerEnter={() => { hovered.current = true; schedule(null); }}
    onPointerLeave={() => { hovered.current = false; schedule(HOVER_CLOSE_DELAY); }}
    onBlur={event => { if (!hovered.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) onClose(); }}>
    <strong title={title}>{title}</strong>
    {items.map(item => <button type="button" role="menuitem" key={item.label} className={item.danger ? 'is-danger' : undefined}
      onClick={() => { onClose(); item.onSelect(); }}>{item.label}</button>)}
  </div>;
}

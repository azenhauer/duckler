import { useCallback, useEffect, useRef } from 'react';

/**
 * Hover menus close by intent, not by a fixed delay (the "safe triangle" of Amazon's menu-aim and
 * Floating UI's safePolygon): after the pointer leaves, the menu stays open only while the pointer
 * moves inside the area between where it left and the menu itself; anywhere else it closes almost
 * at once. Crossing a gap to reach a menu works, and leaving one no longer leaves it hanging.
 */
export const HOVER_CLOSE_DELAY = 60; // pointer gone somewhere other than the menu
export const HOVER_OPEN_DELAY = 70;
const SAFE_IDLE_MS = 300; // resting inside the safe area without moving still closes the menu
const MENU_SELECTOR = '[data-hover-menu], .add-menu-popover, .card-move-menu, .sound-popover, .profile-hover-card, .collection-picker, .collection-menu-popover, .library-options-popover, .workspace-menu-content, .account-menu';

const canHover = () => typeof window !== 'undefined' && (window.matchMedia?.('(hover: hover)').matches ?? true);

type Point = { x: number; y: number };
const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Is `point` inside the convex hull of `from` and the (slightly padded) menu box? Exported for tests. */
export function inSafeArea(point: Point, from: Point, rect: { left: number; top: number; right: number; bottom: number }, pad = 6): boolean {
  const corners = [{ x: rect.left - pad, y: rect.top - pad }, { x: rect.right + pad, y: rect.top - pad }, { x: rect.right + pad, y: rect.bottom + pad }, { x: rect.left - pad, y: rect.bottom + pad }];
  const points = [from, ...corners].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => {
    const chain: Point[] = [];
    for (const p of list) { while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop(); chain.push(p); }
    chain.pop();
    return chain;
  };
  const hull = [...half(points), ...half([...points].reverse())];
  const sides = hull.map((a, index) => cross(a, hull[(index + 1) % hull.length], point));
  return sides.every(side => side >= -0.5) || sides.every(side => side <= 0.5);
}

/** Watches the pointer after it left at `from`; calls `close` unless it is travelling to `menu`. Returns a stop function. */
function watchSafeArea(from: Point, menu: Element | null, close: () => void): () => void {
  if (!menu) { const timer = window.setTimeout(close, HOVER_CLOSE_DELAY); return () => window.clearTimeout(timer); }
  let idle = window.setTimeout(close, SAFE_IDLE_MS);
  let away: number | undefined;
  const move = (event: PointerEvent) => {
    if (inSafeArea({ x: event.clientX, y: event.clientY }, from, menu.getBoundingClientRect())) {
      window.clearTimeout(away); away = undefined;
      window.clearTimeout(idle); idle = window.setTimeout(close, SAFE_IDLE_MS);
    } else if (away === undefined) away = window.setTimeout(close, HOVER_CLOSE_DELAY);
  };
  document.addEventListener('pointermove', move, { passive: true });
  return () => { window.clearTimeout(idle); window.clearTimeout(away); document.removeEventListener('pointermove', move); };
}

/**
 * Pointer handlers that open on hover after a short delay and close by intent (see above). Re-entering
 * the trigger or the menu cancels a pending close. `menu` finds a menu that is not inside the hovered
 * element (a portal, or a trigger and popover that are siblings). Touch devices ignore hover.
 */
export function useHoverIntent(setOpen: (open: boolean) => void, options: { openDelay?: number; enabled?: boolean; menu?: (left: Element) => Element | null } = {}) {
  const { openDelay = HOVER_OPEN_DELAY, enabled = true } = options;
  const findMenu = useRef(options.menu);
  findMenu.current = options.menu;
  const pending = useRef<(() => void) | null>(null);
  const cancel = () => { pending.current?.(); pending.current = null; };
  useEffect(() => cancel, []);
  const onPointerEnter = useCallback((event: React.PointerEvent) => {
    if (!enabled || event.pointerType === 'touch' || !canHover()) return;
    cancel();
    const timer = window.setTimeout(() => setOpen(true), openDelay);
    pending.current = () => window.clearTimeout(timer);
  }, [enabled, openDelay, setOpen]);
  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (!enabled || event.pointerType === 'touch') return;
    cancel();
    const left = event.currentTarget as Element;
    const menu = findMenu.current?.(left) ?? left.querySelector(MENU_SELECTOR);
    pending.current = watchSafeArea({ x: event.clientX, y: event.clientY }, menu, () => { pending.current?.(); pending.current = null; setOpen(false); });
  }, [enabled, setOpen]);
  return { onPointerEnter, onPointerLeave };
}

const detailsPending = new WeakMap<HTMLDetailsElement, () => void>();
const cancelDetails = (element: HTMLDetailsElement) => { detailsPending.get(element)?.(); detailsPending.delete(element); };
/** Spread onto a <details> menu: opens on hover and closes by the same intent rule. */
export const detailsHover = {
  onPointerEnter: (event: React.PointerEvent<HTMLDetailsElement>) => {
    if (event.pointerType === 'touch' || !canHover()) return;
    const element = event.currentTarget;
    cancelDetails(element);
    const timer = window.setTimeout(() => { element.open = true; }, HOVER_OPEN_DELAY);
    detailsPending.set(element, () => window.clearTimeout(timer));
  },
  onPointerLeave: (event: React.PointerEvent<HTMLDetailsElement>) => {
    if (event.pointerType === 'touch') return;
    const element = event.currentTarget;
    cancelDetails(element);
    detailsPending.set(element, watchSafeArea({ x: event.clientX, y: event.clientY }, element.querySelector(MENU_SELECTOR), () => { cancelDetails(element); element.open = false; }));
  },
};

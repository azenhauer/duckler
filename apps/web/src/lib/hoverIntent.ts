import { useCallback, useEffect, useRef } from 'react';

/** Time a hover-opened menu stays open after the pointer leaves, so it can be crossed and reached. */
export const HOVER_CLOSE_DELAY = 170;
export const HOVER_OPEN_DELAY = 70;

const canHover = () => typeof window !== 'undefined' && (window.matchMedia?.('(hover: hover)').matches ?? true);

/**
 * Pointer handlers that open on hover after a short delay and close only after the pointer has been
 * gone for HOVER_CLOSE_DELAY. Re-entering the trigger or the menu cancels a pending close.
 * Touch devices ignore hover; click handlers keep working there.
 */
export function useHoverIntent(setOpen: (open: boolean) => void, options: { openDelay?: number; closeDelay?: number; enabled?: boolean } = {}) {
  const { openDelay = HOVER_OPEN_DELAY, closeDelay = HOVER_CLOSE_DELAY, enabled = true } = options;
  const timer = useRef<number | undefined>(undefined);
  const clear = () => { if (timer.current !== undefined) window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => clear, []);
  const onPointerEnter = useCallback((event: React.PointerEvent) => {
    if (!enabled || event.pointerType === 'touch' || !canHover()) return;
    clear();
    timer.current = window.setTimeout(() => setOpen(true), openDelay);
  }, [enabled, openDelay, setOpen]);
  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (!enabled || event.pointerType === 'touch') return;
    clear();
    timer.current = window.setTimeout(() => setOpen(false), closeDelay);
  }, [closeDelay, enabled, setOpen]);
  return { onPointerEnter, onPointerLeave, cancel: clear };
}

const detailsTimers = new WeakMap<HTMLDetailsElement, number>();
const scheduleDetails = (element: HTMLDetailsElement, open: boolean, delay: number) => {
  const pending = detailsTimers.get(element);
  if (pending !== undefined) window.clearTimeout(pending);
  detailsTimers.set(element, window.setTimeout(() => { element.open = open; detailsTimers.delete(element); }, delay));
};
/** Spread onto a <details> menu: opens on hover and stays open long enough to reach its content. */
export const detailsHover = {
  onPointerEnter: (event: React.PointerEvent<HTMLDetailsElement>) => {
    if (event.pointerType === 'touch' || !canHover()) return;
    scheduleDetails(event.currentTarget, true, HOVER_OPEN_DELAY);
  },
  onPointerLeave: (event: React.PointerEvent<HTMLDetailsElement>) => {
    if (event.pointerType === 'touch') return;
    scheduleDetails(event.currentTarget, false, HOVER_CLOSE_DELAY);
  },
};

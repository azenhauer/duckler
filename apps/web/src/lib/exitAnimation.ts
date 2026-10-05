import { useCallback, useRef } from 'react';

const EXIT_MS = 140;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Snapshots the node while it is still in the DOM; the returned function shows the leaving copy. */
function prepareExit(node: HTMLElement): (() => void) | null {
  if (!node.isConnected || reduced()) return null;
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.classList.add('is-leaving');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  ghost.inert = true;
  ghost.style.pointerEvents = 'none';
  const host = (node.closest('.app-shell') ?? document.body) as HTMLElement;
  if (getComputedStyle(node).position !== 'fixed') {
    const rect = node.getBoundingClientRect();
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, right: 'auto', bottom: 'auto', margin: '0', zIndex: '90', transform: 'none' });
  }
  // The copy lives outside React's tree, so React's own children are never touched.
  return () => { host.appendChild(ghost); window.setTimeout(() => ghost.remove(), EXIT_MS); };
}

/**
 * Callback ref that gives a popover or dialog a closing animation without delaying React's unmount:
 * when React detaches the ref (just before removing the node), an inert copy plays `.is-leaving`.
 */
export function useExitAnimation<T extends HTMLElement>() {
  const node = useRef<T | null>(null);
  return useCallback((element: T | null) => {
    if (element) node.current = element;
    else if (node.current) {
      const play = prepareExit(node.current);
      node.current = null;
      // StrictMode detaches and re-attaches refs on mount; only animate if the ref stayed detached.
      if (play) queueMicrotask(() => { if (!node.current) play(); });
    }
  }, []);
}

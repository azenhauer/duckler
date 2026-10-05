export type CanvasIconName = 'select' | 'hand' | 'pen' | 'highlighter' | 'rectangle' | 'ellipse' | 'text' | 'connector' | 'eraser'
  | 'undo' | 'redo' | 'fit' | 'rotate' | 'rotate-reset' | 'remove' | 'select-all' | 'deselect' | 'aspect' | 'anchor' | 'add' | 'hidden' | 'background' | 'detach' | 'check';

/** Line icons for the canvas studio, drawn on a 24px grid to match InterfaceIcon. */
export function CanvasIcon({ name }: { name: CanvasIconName }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const };
  return <svg className="canvas-icon" viewBox="0 0 24 24" aria-hidden="true">
    {name === 'select' && <path {...p} d="M5 3.5 18 11l-6 1.6L9.3 19 5 3.5Z" />}
    {name === 'hand' && <path {...p} d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7S5 17.5 4 14.5L3 12a1.5 1.5 0 0 1 2.6-1.4L8 13.5" />}
    {name === 'pen' && <><path {...p} d="M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19l-4 1Z" /><path {...p} d="m14.5 6.5 3 3" /></>}
    {name === 'highlighter' && <><path {...p} d="m9 15 7.5-10.5a2 2 0 0 1 3 2.2L13 17" /><path {...p} d="m9 15 4 2-2.5 3H6l3-5Z" /><path {...p} d="M3 21h18" opacity=".55" /></>}
    {name === 'rectangle' && <rect {...p} x="4" y="6" width="16" height="12" rx="1.5" />}
    {name === 'ellipse' && <ellipse {...p} cx="12" cy="12" rx="8.5" ry="6.5" />}
    {name === 'text' && <path {...p} d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />}
    {name === 'connector' && <><circle {...p} cx="5.5" cy="18.5" r="2" /><circle {...p} cx="18.5" cy="5.5" r="2" /><path {...p} d="M7 17c3-1 3-9 6-10l3.6-1" /></>}
    {name === 'eraser' && <><path {...p} d="m7 20-3.3-3.3a1.5 1.5 0 0 1 0-2.1L13.5 4.8a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L11.7 20H7Z" /><path {...p} d="m9 10.5 5.5 5.5M12 20h8" /></>}
    {name === 'undo' && <path {...p} d="M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12" />}
    {name === 'redo' && <path {...p} d="m15 7 4.5 4.5L15 16M19 11.5H9.5a5 5 0 0 0 0 10H12" />}
    {name === 'fit' && <path {...p} d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z" />}
    {name === 'rotate' && <><path {...p} d="M19.5 12A7.5 7.5 0 1 1 17 6.4" /><path {...p} d="M19.5 3.5v4.5H15" /></>}
    {name === 'rotate-reset' && <><path {...p} d="M4.5 12A7.5 7.5 0 1 0 7 6.4" /><path {...p} d="M4.5 3.5v4.5H9" /><path {...p} d="M12 9v3l2 1.5" /></>}
    {name === 'remove' && <path {...p} d="M5 7h14M10 3.5h4M7 7l1 13h8l1-13M10 11v5.5M14 11v5.5" />}
    {name === 'select-all' && <><path {...p} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" strokeDasharray="0" /><rect {...p} x="8" y="8" width="8" height="8" rx="1" /></>}
    {name === 'deselect' && <><path {...p} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path {...p} d="m9 9 6 6M15 9l-6 6" /></>}
    {name === 'aspect' && <><rect {...p} x="3.5" y="6.5" width="17" height="11" rx="1.5" /><path {...p} d="M7 10v4h4M17 14v-4h-4" /></>}
    {name === 'anchor' && <><rect {...p} x="3.5" y="4.5" width="13" height="10" rx="1.5" /><path {...p} d="m12 20 1-3 6.5-6.5a1.4 1.4 0 0 1 2 2L15 19l-3 1Z" /></>}
    {name === 'add' && <path {...p} d="M12 5v14M5 12h14" />}
    {name === 'hidden' && <><path {...p} d="M3 12s3.5-6 9-6c2 0 3.6.7 5 1.7M21 12s-3.5 6-9 6c-2 0-3.6-.7-5-1.7" /><path {...p} d="M4 20 20 4" /></>}
    {name === 'background' && <><rect {...p} x="3.5" y="3.5" width="17" height="17" rx="2" /><path {...p} d="M3.5 15.5 9 10l4 4 2.5-2.5 5 5" /><circle {...p} cx="15.5" cy="8.5" r="1.5" /></>}
    {name === 'detach' && <><path {...p} d="M9 15 6.5 17.5a3 3 0 0 1-4-4L5 11M15 9l2.5-2.5a3 3 0 0 1 4 4L19 13" /><path {...p} d="m8 8-2-2M16 16l2 2M12 4v2M12 18v2" /></>}
    {name === 'check' && <path {...p} d="m5 12.5 4.5 4.5L19 7.5" />}
  </svg>;
}

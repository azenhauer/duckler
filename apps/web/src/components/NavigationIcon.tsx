export function NavigationIcon({ name, expanded = false }: { name: 'library' | 'collections' | 'canvas'; expanded?: boolean }) {
  if (expanded && name === 'collections') return <svg className="dock-icon collection-stack-icon" viewBox="0 0 80 80" fill="currentColor" aria-hidden="true">
    <rect className="stack-back" x="20" y="13" width="43" height="51" rx="8" transform="rotate(10 41.5 38.5)" />
    <rect className="stack-middle" x="15" y="17" width="43" height="51" rx="8" transform="rotate(-7 36.5 42.5)" />
    <rect className="stack-front" x="17" y="20" width="43" height="51" rx="8" /><path className="stack-detail" d="M28 35h21M28 44h15M28 53h10" fill="none" strokeWidth="3" strokeLinecap="round" />
  </svg>;
  if (expanded && name === 'canvas') return <svg className="dock-icon canvas-orbit-icon canvas-easel-icon" viewBox="0 0 80 80" fill="currentColor" aria-hidden="true">
    <path d="M37 4h6v13h-6V4ZM25 54h8l-9 20h-8l9-20ZM47 54h8l9 20h-8l-9-20ZM37 56h6v18h-6V56Z" />
    <g className="canvas-painting"><rect x="10" y="16" width="60" height="40" rx="5" /><circle className="painting-cutout" cx="25" cy="28" r="4" /><path className="painting-cutout" d="m18 48 17-16 11 10 8-9 10 15H18Z" /></g>
    <rect className="canvas-ledge" x="6" y="58" width="68" height="5" rx="2.5" />
  </svg>;
  return <svg className="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'library' && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
    {name === 'collections' && <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2.2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />}
    {name === 'canvas' && <><path d="M12 2v3M8.5 16 6 22M15.5 16l2.5 6M3 18h18" /><rect x="4" y="5" width="16" height="11" rx="1.5" /></>}
  </svg>;
}

export function NavigationIcon({ name, expanded = false }: { name: 'library' | 'collections' | 'canvas'; expanded?: boolean }) {
  if (expanded && name !== 'library') return <img className="dock-icon home-artwork" src={`/icons/home-${name}.png`} alt="" aria-hidden="true" draggable={false} />;
  return <svg className="dock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'library' && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
    {name === 'collections' && <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2.2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" />}
    {name === 'canvas' && <><path d="M12 2v3M8.5 16 6 22M15.5 16l2.5 6M3 18h18" /><rect x="4" y="5" width="16" height="11" rx="1.5" /></>}
  </svg>;
}

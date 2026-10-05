export function NavigationIcon({ name, expanded = false }: { name: 'library' | 'collections' | 'canvas'; expanded?: boolean }) {
  // The two Home destinations keep their approved artwork; everywhere else uses the schematic line icons.
  if (expanded && name !== 'library') return <img className={`dock-icon home-artwork home-artwork-${name}`} src={`/icons/home-${name}.png`} alt="" aria-hidden="true" draggable={false} />;
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const };
  return <svg className={`dock-icon dock-icon-${name}`} viewBox="0 0 24 24" aria-hidden="true">
    {name === 'library' && <path {...p} d="M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z" />}
    {/* Three stacked discs, echoing the Home CD artwork */}
    {name === 'collections' && <><circle {...p} cx="9" cy="10" r="6" /><circle {...p} cx="15" cy="14" r="6" /><circle {...p} cx="15" cy="14" r="1.6" /><path {...p} d="M11.6 14.7a3.5 3.5 0 0 1 1.3-3.4" /></>}
    {/* Ring-bound sketchbook, echoing the Home album artwork */}
    {name === 'canvas' && <><path {...p} d="M6 3h14v18H6z" /><path {...p} d="M3.5 6.5H8M3.5 10.5H8M3.5 14.5H8M3.5 18.5H8" /><path {...p} d="M10.5 15l2.5-4 2 2.5 1.5-2 2 3.5" /></>}
  </svg>;
}

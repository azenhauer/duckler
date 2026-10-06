// PS2-schematic icon set: square caps, mitred corners, hardware-diagram shapes.
export type IconName = 'back' | 'search' | 'sun' | 'moon' | 'link' | 'upload' | 'note' | 'browser' | 'edit' | 'move' | 'trash' | 'settings' | 'more' | 'sound' | 'mute' | 'restore' | 'close' | 'check' | 'connect' | 'image' | 'star' | 'star-filled';
export function InterfaceIcon({ name }: { name: IconName }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const };
  return <svg className={`ui-icon ui-icon-${name}`} viewBox="0 0 24 24" aria-hidden="true">
    {/* Five-point star: outline (☆) or filled (★, favourite) */}
    {(name === 'star' || name === 'star-filled') && <path {...p} fill={name === 'star-filled' ? 'currentColor' : 'none'} d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />}
    {/* Picture frame: mountains and sun */}
    {name === 'image' && <><path {...p} d="M3.5 5h17v14h-17V5Z" /><path {...p} d="M3.5 16l5-5 4 4 2.5-2.5 5 5" /><circle {...p} cx="16" cy="9" r="1.5" /></>}
    {/* Pen nib over a baseline */}
    {name === 'edit' && <><path {...p} d="M5 19l1.2-4.4L15.8 5l3.2 3.2-9.6 9.6L5 19Z" /><path {...p} d="M13.6 7.2l3.2 3.2M4 21.5h9" /></>}
    {/* D-pad: move */}
    {name === 'move' && <path {...p} d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5V3Z" />}
    {/* Bin with lid rail */}
    {name === 'trash' && <><path {...p} d="M4 6.5h16M9 6.5V3.5h6v3M6.5 6.5l1 14h9l1-14" /><path {...p} d="M10.5 10.5v6M13.5 10.5v6" /></>}
    {/* Circle-button "back" arrow */}
    {name === 'back' && <path {...p} d="M10 6l-6 6 6 6M4.5 12H20" />}
    {/* Lens with crosshair tick */}
    {name === 'search' && <><circle {...p} cx="10.5" cy="10.5" r="6" /><path {...p} d="M15 15l5.5 5.5M10.5 7.5v1.5M10.5 12v1.5M7.5 10.5h1.5M12 10.5h1.5" /></>}
    {name === 'sun' && <><circle {...p} cx="12" cy="12" r="3.8" /><path {...p} d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" /></>}
    {name === 'moon' && <path {...p} d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8 8 0 1 0 10.3 10.3Z" />}
    {/* Cable plug: link */}
    {name === 'link' && <><path {...p} d="M10 14l4-4" /><path {...p} d="M8.5 11.5L6 14a3 3 0 0 0 4.2 4.2l2.5-2.5M15.5 12.5L18 10a3 3 0 0 0-4.2-4.2l-2.5 2.5" /></>}
    {/* Disc tray with eject arrow */}
    {name === 'upload' && <><path {...p} d="M12 14V3.5M7.5 8L12 3.5 16.5 8" /><path {...p} d="M3.5 14v6h17v-6M3.5 17h17" /></>}
    {/* Memory card: note */}
    {name === 'note' && <><path {...p} d="M6 3h9l3 3v15H6V3Z" /><path {...p} d="M9 3v4h6V3M9 12h6M9 15.5h6M9 19h3" /></>}
    {/* Console window */}
    {name === 'browser' && <><path {...p} d="M3 4.5h18v15H3v-15ZM3 8.5h18" /><path {...p} d="M6 6.5h.5M8.5 6.5H9M11 6.5h.5" /></>}
    {/* Gear with square teeth */}
    {name === 'settings' && <><circle {...p} cx="12" cy="12" r="3" /><path {...p} d="M10.5 2.5h3l.5 2.6 1.9.8 2.2-1.5 2.1 2.1-1.5 2.2.8 1.9 2.6.5v3l-2.6.5-.8 1.9 1.5 2.2-2.1 2.1-2.2-1.5-1.9.8-.5 2.6h-3l-.5-2.6-1.9-.8-2.2 1.5-2.1-2.1 1.5-2.2-.8-1.9-2.6-.5v-3l2.6-.5.8-1.9-1.5-2.2 2.1-2.1 2.2 1.5 1.9-.8.5-2.6Z" /></>}
    {name === 'more' && <path {...p} d="M4.5 11h3v2h-3zM10.5 11h3v2h-3zM16.5 11h3v2h-3z" />}
    {/* Speaker cone + waves */}
    {name === 'sound' && <><path {...p} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" /><path {...p} d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" /></>}
    {name === 'mute' && <><path {...p} d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" /><path {...p} d="M15.5 9.5l5 5M20.5 9.5l-5 5" /></>}
    {name === 'restore' && <><path {...p} d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path {...p} d="M4 3.5V8h4.5" /></>}
    {/* Cross button */}
    {name === 'close' && <path {...p} d="M6 6l12 12M18 6L6 18" />}
    {name === 'check' && <path {...p} d="M4.5 12.5l4.5 4.5L19.5 6.5" />}
    {/* Two terminals joined by a wire: connect cards */}
    {name === 'connect' && <><path {...p} d="M3 8.5h5v7H3v-7ZM16 8.5h5v7h-5v-7Z" /><path {...p} d="M8 12h8M10.5 9.5 8 12l2.5 2.5" /></>}
  </svg>;
}

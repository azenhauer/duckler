type IconName = 'back' | 'search' | 'sun' | 'moon' | 'link' | 'upload' | 'note' | 'browser' | 'edit' | 'move' | 'trash' | 'settings' | 'more';
export function InterfaceIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
    {name === 'edit' && <><path {...common} d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L4 18v2Z" /><path {...common} d="m14.8 6.2 3 3" /></>}
    {name === 'move' && <><path {...common} d="M12 3v18M3 12h18" /><path {...common} d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>}
    {name === 'trash' && <><path {...common} d="M4 7h16M10 3h4l1 4H9l1-4ZM6 7l1 14h10l1-14M10 11v6M14 11v6" /></>}
    {name === 'back' && <path {...common} d="m14 5-7 7 7 7M7 12h13" />}
    {name === 'search' && <><circle {...common} cx="10.5" cy="10.5" r="6.5" /><path {...common} d="m16 16 5 5" /></>}
    {name === 'sun' && <><circle {...common} cx="12" cy="12" r="4" /><path {...common} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>}
    {name === 'moon' && <path {...common} d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />}
    {name === 'link' && <><path {...common} d="m9.5 14.5 5-5" /><path {...common} d="M7.5 17.5H6a4 4 0 0 1 0-8h3M16.5 6.5H18a4 4 0 0 1 0 8h-3" /></>}
    {name === 'upload' && <><path {...common} d="M12 15V3M7 8l5-5 5 5M4 15v5h16v-5" /></>}
    {name === 'note' && <><path {...common} d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...common} d="M14 3v5h5M8 12h7M8 16h5" /></>}
    {name === 'browser' && <><rect {...common} x="3" y="4" width="18" height="16" rx="2" /><path {...common} d="M3 9h18M7 6.5h.01M10 6.5h.01M13 6.5h.01" /></>}
    {name === 'settings' && <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.6v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6V11.3h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.6v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V13h-.1a1.7 1.7 0 0 0-1.6 1Z" /></>}
    {name === 'more' && <><circle {...common} cx="5" cy="12" r="1" /><circle {...common} cx="12" cy="12" r="1" /><circle {...common} cx="19" cy="12" r="1" /></>}
  </svg>;
}

type IconName = 'back' | 'search' | 'sun' | 'moon' | 'link' | 'upload' | 'note' | 'browser' | 'edit' | 'move' | 'trash';
const paths: Record<Exclude<IconName, 'sun'>, string> = {
  edit: 'M3 17v4h4L20 8l-4-4L3 17Zm18-12-2-2a2 2 0 0 0-3 0l-1 1 4 4 2-1a2 2 0 0 0 0-2Z',
  move: 'M3 5h7l2 2h9v4h-3V9H5v10h7v2H3V5Zm14 8v3h-5v3h5v3l6-5-6-4Z',
  trash: 'M8 2h8v3h5v3H3V5h5V2Zm-3 8h14l-1 12H6L5 10Zm4 2v7h2v-7H9Zm4 0v7h2v-7h-2Z',
  back: 'M10.8 3.2a1.6 1.6 0 0 1 0 2.3L6 10.4h14.4a1.6 1.6 0 0 1 0 3.2H6l4.8 4.9a1.6 1.6 0 0 1-2.3 2.3l-7.6-7.7a1.6 1.6 0 0 1 0-2.2l7.6-7.7a1.6 1.6 0 0 1 2.3 0Z',
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5.7 5.7 2.3-2.3-5.7-5.7A8 8 0 0 0 10 2Zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  moon: 'M20.8 15.1A9.5 9.5 0 0 1 8.9 3.2 9.7 9.7 0 1 0 20.8 15.1Z',
  link: 'M9 3h12v12h-3V8.1L5.1 21 3 18.9 15.9 6H9V3Z',
  upload: 'M10.5 15h3V8.7l3.2 3.2 2.1-2.1L12 3 5.2 9.8l2.1 2.1 3.2-3.2V15ZM3 15h3v4h12v-4h3v7H3v-7Z',
  note: 'M5 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H5Zm2 5h10v2H7V7Zm0 5h10v2H7v-2Zm0 5h6v2H7v-2Z',
  browser: 'M9 2a3 3 0 0 1 6 0v2h4a2 2 0 0 1 2 2v4h-2a3 3 0 1 0 0 6h2v4a2 2 0 0 1-2 2h-4v-2a3 3 0 1 0-6 0v2H5a2 2 0 0 1-2-2v-4h2a3 3 0 1 0 0-6H3V6a2 2 0 0 1 2-2h4V2Z',
};

export function InterfaceIcon({ name }: { name: IconName }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {name === 'sun' ? <><circle cx="12" cy="12" r="5" /><path d="M11 0h2v4h-2V0Zm0 20h2v4h-2v-4ZM0 11h4v2H0v-2Zm20 0h4v2h-4v-2ZM3 2l3 3-1.4 1.4-3-3L3 2Zm15 15 3 3-1.4 1.4-3-3L18 17ZM2 20l3-3 1.4 1.4-3 3L2 20ZM17 5l3-3 1.4 1.4-3 3L17 5Z" /></> : <path d={paths[name]} fillRule="evenodd" />}
  </svg>;
}

import { useSyncExternalStore } from 'react';
import { useExitAnimation } from '../lib/exitAnimation';

/**
 * Console-style "achievement" notifications: a small stack of panels that slide in, say what happened
 * and leave on their own. Errors stay longer; `progress` stays until replaced through the same `key`.
 */
export type NoticeKind = 'success' | 'error' | 'info' | 'progress';
export type Notice = { id: string; kind: NoticeKind; title: string; detail?: string; key?: string; duration: number };
type NoticeInput = { kind?: NoticeKind; title: string; detail?: string; key?: string };

/** Fired on `window` so the sound system can answer without importing this module. */
export const NOTICE_EVENT = 'duckler:notice';
const MAX_VISIBLE = 3;
const DURATION: Record<NoticeKind, number> = { success: 3200, info: 3600, error: 6500, progress: 0 };
const GLYPH: Record<NoticeKind, string> = { success: '✕', error: '○', info: '△', progress: '□' };

let notices: Notice[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
let sequence = 0;
const emit = () => listeners.forEach(listener => listener());

export function dismissNotice(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  timers.delete(id);
  if (!notices.some(item => item.id === id)) return;
  notices = notices.filter(item => item.id !== id);
  emit();
}

export function notify(input: NoticeInput): string {
  const kind = input.kind ?? 'success';
  const notice: Notice = { id: `n${++sequence}`, kind, title: input.title, detail: input.detail, key: input.key, duration: DURATION[kind] };
  const replaced = input.key ? notices.find(item => item.key === input.key) : undefined;
  if (replaced) dismissNotice(replaced.id);
  notices = [...notices, notice];
  while (notices.length > MAX_VISIBLE) dismissNotice(notices[0].id);
  if (notice.duration) timers.set(notice.id, window.setTimeout(() => dismissNotice(notice.id), notice.duration));
  emit();
  if (kind !== 'progress') window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: kind }));
  return notice.id;
}

/** Test helper: clears every notice. */
export function clearNotices() { [...notices].forEach(item => dismissNotice(item.id)); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => notices;

export function Notifications() {
  const items = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <div className="notice-stack" aria-live="polite" aria-relevant="additions text">
    {items.map(item => <NoticePanel key={item.id} notice={item} />)}
  </div>;
}

function NoticePanel({ notice }: { notice: Notice }) {
  const exitRef = useExitAnimation<HTMLDivElement>();
  return <div ref={exitRef} className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} onClick={() => dismissNotice(notice.id)}>
    <span className="notice-glyph" aria-hidden="true">{GLYPH[notice.kind]}</span>
    <span className="notice-text"><b>{notice.title}</b>{notice.detail && <span>{notice.detail}</span>}</span>
    {notice.duration > 0 && <i className="notice-timer" aria-hidden="true" style={{ animationDuration: `${notice.duration}ms` }} />}
  </div>;
}

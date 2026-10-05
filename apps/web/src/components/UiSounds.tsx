import { useCallback, useEffect, useRef, useState } from 'react';
import { InterfaceIcon } from './InterfaceIcon';
import { useHoverIntent } from '../lib/hoverIntent';
import { useExitAnimation } from '../lib/exitAnimation';

type Preferences = { enabled: boolean; volume: number };
const key = 'duckler-ui-sounds-v1';
const files = { hover: '/sounds/ps2/deck_ui_navigation.wav', click: '/sounds/ps2/deck_ui_default_activation.wav' };
/** Dispatch `new CustomEvent(UI_SOUND_EVENT, { detail: 'capture' })` to play an app-event cue. */
export const UI_SOUND_EVENT = 'duckler:ui-sound';
export type Cue = 'hover' | 'click' | 'open' | 'back' | 'toggle-on' | 'toggle-off' | 'save' | 'delete' | 'capture';
type Layer = { file: keyof typeof files; at: number; rate: number; gain: number };
// Variety comes from pitching and layering the pack's two samples, so every cue stays in the same family.
const cueLayers: Record<Cue, Layer[]> = {
  hover: [{ file: 'hover', at: 0, rate: 1, gain: 1 }],
  click: [{ file: 'click', at: 0, rate: 1, gain: 1 }],
  open: [{ file: 'click', at: 0, rate: 1.12, gain: .9 }, { file: 'hover', at: .045, rate: 1.45, gain: .55 }],
  back: [{ file: 'click', at: 0, rate: .78, gain: .9 }],
  'toggle-on': [{ file: 'hover', at: 0, rate: 1.38, gain: 1 }],
  'toggle-off': [{ file: 'hover', at: 0, rate: .84, gain: 1 }],
  save: [{ file: 'click', at: 0, rate: 1, gain: .9 }, { file: 'click', at: .09, rate: 1.26, gain: .8 }],
  delete: [{ file: 'click', at: 0, rate: .62, gain: 1 }, { file: 'hover', at: .07, rate: .7, gain: .5 }],
  capture: [{ file: 'click', at: 0, rate: 1.18, gain: 1 }, { file: 'hover', at: .085, rate: 1.32, gain: .7 }],
};

function load(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { enabled: typeof value?.enabled === 'boolean' ? value.enabled : true, volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : .15 };
  } catch { return { enabled: true, volume: .15 }; }
}

/** Works out which cue a click deserves from the control's own semantics (captured before React updates it). */
function cueFor(element: HTMLElement): Cue {
  const label = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.trim().toLowerCase();
  if (element instanceof HTMLInputElement && element.type === 'checkbox') return element.checked ? 'toggle-off' : 'toggle-on';
  if (element.getAttribute('type') === 'submit' || /^(✕)?\s*save\b/.test(label)) return 'save';
  if (/\b(delete|remove|trash)\b/.test(label)) return 'delete';
  if (/\b(close|cancel|go back|back)\b/.test(label)) return 'back';
  const pressed = element.getAttribute('aria-pressed');
  if (pressed !== null) return pressed === 'true' ? 'toggle-off' : 'toggle-on';
  const expanded = element.getAttribute('aria-expanded');
  if (expanded === 'true') return 'back';
  if (expanded === 'false' || element.hasAttribute('aria-haspopup') || element.tagName === 'SUMMARY') return 'open';
  return 'click';
}

export function useUiSounds() {
  const [preferences, setPreferences] = useState(load);
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer>>());
  const active = useRef<AudioBufferSourceNode[]>([]);
  const sequence = useRef(0);
  const playRef = useRef<(kind: Cue) => void>(() => {});
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Keep in-memory preferences. */ }
    const stop = () => { sequence.current++; active.current.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } }); active.current = []; };
    if (!preferences.enabled) stop();
    const unlock = () => {
      if (document.hidden) return;
      try { context.current ??= new AudioContext(); void context.current.resume().catch(() => {}); } catch { /* Optional audio. */ }
    };
    const load = (audio: AudioContext, file: keyof typeof files) => {
      let buffer = buffers.current.get(file);
      if (!buffer) {
        buffer = fetch(files[file]).then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); }).then(bytes => audio.decodeAudioData(bytes));
        buffer.catch(() => { buffers.current.delete(file); });
        buffers.current.set(file, buffer);
      }
      return buffer;
    };
    const play = (kind: Cue, force = false) => {
      const audio = context.current;
      if ((!preferences.enabled && !force) || !preferences.volume || document.hidden || !audio || audio.state !== 'running') return;
      stop(); const request = sequence.current;
      const layers = cueLayers[kind];
      void Promise.all(layers.map(layer => load(audio, layer.file))).then(decoded => {
        if (request !== sequence.current || document.hidden || audio.state !== 'running') return;
        const start = audio.currentTime;
        layers.forEach((layer, index) => {
          const source = audio.createBufferSource(), gain = audio.createGain();
          source.buffer = decoded[index]; source.playbackRate.value = layer.rate; gain.gain.value = preferences.volume * layer.gain;
          source.connect(gain); gain.connect(audio.destination); active.current.push(source);
          source.onended = () => { source.disconnect(); gain.disconnect(); active.current = active.current.filter(item => item !== source); };
          source.start(start + layer.at);
        });
      }).catch(() => { /* Missing audio never blocks an action. */ });
    };
    playRef.current = kind => play(kind, true);
    const selector = '.app-shell button:not(:disabled),.app-shell a[href],.app-shell [role="button"],.app-shell article[tabindex="0"],.app-shell summary,.app-shell input[type="checkbox"],.app-shell label.avatar-upload';
    const target = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
    let lastTarget: HTMLElement | null = null, lastHover = -Infinity, lastClick = -Infinity;
    const hover = (event: Event) => {
      const element = target(event);
      if (!element || element === lastTarget) return;
      if (typeof PointerEvent !== 'undefined' && event instanceof PointerEvent && event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      lastTarget = element;
      const now = performance.now();
      if (now - lastHover < 100 || now - lastClick < 100) return;
      lastHover = now; play('hover');
    };
    const click = (event: Event) => {
      const element = target(event);
      if (!element) return;
      lastClick = performance.now(); lastTarget = element; unlock(); play(cueFor(element));
    };
    const keydown = (event: KeyboardEvent) => { unlock(); if (event.key === 'Escape') play('back'); };
    const leave = (event: Event) => { if (event.target === lastTarget || event.target instanceof Node && lastTarget?.contains(event.target)) lastTarget = null; };
    const visibility = () => { if (document.hidden) stop(); };
    const appCue = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string' && event.detail in cueLayers) play(event.detail as Cue); };
    window.addEventListener(UI_SOUND_EVENT, appCue);
    const listeners: [string, EventListener][] = [['pointerdown', unlock], ['keydown', keydown as EventListener], ['pointerover', hover], ['focusin', hover], ['pointerout', leave], ['focusout', leave], ['click', click], ['visibilitychange', visibility]];
    listeners.forEach(([name, listener]) => document.addEventListener(name, listener, true));
    return () => { stop(); window.removeEventListener(UI_SOUND_EVENT, appCue); listeners.forEach(([name, listener]) => document.removeEventListener(name, listener, true)); };
  }, [preferences]);
  useEffect(() => () => { void context.current?.close().catch(() => {}); }, []);
  const preview = useCallback((cue: Cue = 'save') => {
    try { context.current ??= new AudioContext(); void context.current.resume().then(() => playRef.current(cue)).catch(() => {}); } catch { /* Optional audio. */ }
  }, []);
  const settings = <section aria-label="UI sounds" className="settings-appearance sound-settings">
    <h3>PS2 UI sounds</h3>
    <label><input type="checkbox" checked={preferences.enabled} onChange={event => setPreferences({ ...preferences, enabled: event.target.checked })} /> UI sounds</label>
    <label>Volume<input aria-label="UI sound volume" type="range" min="0" max="1" step=".05" value={preferences.volume} onChange={event => setPreferences({ ...preferences, volume: Number(event.target.value) })} /></label>
    <div className="sound-preview-row">{(['click', 'open', 'back', 'save', 'delete', 'capture'] as Cue[]).map(cue =>
      <button type="button" key={cue} disabled={!preferences.enabled} onClick={() => preview(cue)}>{cue}</button>)}</div>
  </section>;
  return { preferences, setPreferences, preview, settings };
}

/** Speaker in the dock: click mutes or unmutes; hovering opens volume and a quick preview. */
export function SoundButton({ preferences, setPreferences, preview }: Pick<ReturnType<typeof useUiSounds>, 'preferences' | 'setPreferences' | 'preview'>) {
  const [open, setOpen] = useState(false);
  const hover = useHoverIntent(setOpen);
  const on = preferences.enabled && preferences.volume > 0;
  return <div className="sound-control" {...hover}>
    <button type="button" className={`sound-toggle ${on ? 'is-on' : 'is-off'}`} aria-label={on ? 'Mute UI sounds' : 'Unmute UI sounds'} aria-pressed={on} title={on ? 'Sounds on' : 'Sounds off'}
      onClick={() => setPreferences({ ...preferences, enabled: !preferences.enabled, volume: preferences.volume || .15 })}>
      <InterfaceIcon name={on ? 'sound' : 'mute'} />
      {on && <span className="sound-bars" aria-hidden="true"><i /><i /><i /></span>}
    </button>
    {open && <SoundPopover>
      <span className="sound-popover-label">Volume</span>
      <input type="range" aria-label="UI sound volume" min="0" max="1" step=".05" value={preferences.volume}
        onChange={event => setPreferences({ ...preferences, enabled: Number(event.target.value) > 0 ? true : preferences.enabled, volume: Number(event.target.value) })}
        onPointerUp={() => preview('click')} />
      <span className="sound-popover-value">{Math.round(preferences.volume * 100)}</span>
    </SoundPopover>}
  </div>;
}

function SoundPopover({ children }: { children: React.ReactNode }) {
  const ref = useExitAnimation<HTMLDivElement>();
  return <div ref={ref} className="sound-popover" role="group" aria-label="Sound volume">{children}</div>;
}

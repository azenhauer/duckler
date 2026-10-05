import { useCallback, useEffect, useRef, useState } from 'react';
import { InterfaceIcon } from './InterfaceIcon';
import { useHoverIntent } from '../lib/hoverIntent';
import { useExitAnimation } from '../lib/exitAnimation';
import { NOTICE_EVENT } from './Notifications';

type Preferences = { enabled: boolean; volume: number };
const key = 'duckler-ui-sounds-v1';
const files = { hover: '/sounds/ps2/deck_ui_navigation.wav', click: '/sounds/ps2/deck_ui_default_activation.wav' };
/** Dispatch `new CustomEvent(UI_SOUND_EVENT, { detail: 'capture' })` to play an app-event cue. */
export const UI_SOUND_EVENT = 'duckler:ui-sound';
/** Where a hover or click happened; each zone has its own voicing of the same two samples. */
export type Zone = 'menu' | 'card' | 'settings' | 'canvas';
export type Cue =
  | 'hover' | 'click' | 'open' | 'back' | 'toggle-on' | 'toggle-off' | 'save' | 'delete' | 'capture'
  | `hover-${Exclude<Zone, 'menu'>}` | `click-${Exclude<Zone, 'menu'>}`
  | 'notify' | 'notify-error' | 'notify-info' | 'select' | 'deselect' | 'gear' | 'hover-controls'
  | 'canvas-draw' | 'canvas-highlight' | 'canvas-shape' | 'canvas-text' | 'canvas-erase' | 'canvas-connect'
  | 'canvas-place' | 'canvas-drop' | 'canvas-rotate' | 'canvas-undo' | 'canvas-redo' | 'canvas-tool';
/** A pitched sample, or a short band-passed noise burst (pencil/eraser texture) from one shared buffer. */
type Layer = { file: keyof typeof files; at: number; rate: number; gain: number } | { noise: true; at: number; duration: number; frequency: number; q: number; gain: number };
const s = (file: keyof typeof files, rate: number, gain = 1, at = 0): Layer => ({ file, at, rate, gain });
const n = (frequency: number, duration: number, gain: number, at = 0, q = 1.2): Layer => ({ noise: true, at, duration, frequency, q, gain });
// Variety comes from pitching and layering the pack's two samples, so every cue stays in the same family.
const cueLayers: Record<Cue, Layer[]> = {
  hover: [s('hover', 1)],
  'hover-card': [s('hover', .84, .7)],
  'hover-settings': [s('hover', 1.22, .55)],
  'hover-canvas': [s('hover', 1.5, .4)],
  click: [s('click', 1)],
  'click-card': [s('click', .9, .9), s('hover', .7, .35, .03)],
  'click-settings': [s('click', 1.2, .75)],
  'click-canvas': [s('click', 1.38, .65)],
  open: [s('click', 1.12, .9), s('hover', 1.45, .55, .045)],
  back: [s('click', .78, .9)],
  'toggle-on': [s('hover', 1.38)],
  'toggle-off': [s('hover', .84)],
  save: [s('click', 1, .9), s('click', 1.26, .8, .09)],
  delete: [s('click', .62), s('hover', .7, .5, .07)],
  capture: [s('click', 1.18), s('hover', 1.32, .7, .085)],
  // Achievement chime: three rising steps.
  notify: [s('hover', 1.5, .8), s('click', 1.26, .6, .07), s('hover', 2, .45, .14)],
  'notify-info': [s('hover', 1.3, .7), s('hover', 1.62, .45, .08)],
  'notify-error': [s('click', .7, .9), s('click', .58, .7, .1)],
  'canvas-tool': [s('hover', 1.42, .55)],
  // Selecting a card: a bright two-step tick up; deselecting steps back down.
  select: [s('click', 1.62, .7), s('hover', 2.05, .35, .035)],
  deselect: [s('hover', 1.25, .45), s('click', .95, .5, .03)],
  // Settings controls (gear, speaker): a low mechanical turn with a short click on top.
  gear: [s('hover', .62, .7), s('click', 1.5, .45, .06), s('hover', .8, .3, .11)],
  'hover-controls': [s('hover', .74, .5)],
  'canvas-draw': [n(3200, .11, .5), s('hover', 1.7, .25, .02)],
  'canvas-highlight': [n(1800, .16, .45, 0, .8), s('hover', 1.2, .22, .03)],
  'canvas-shape': [s('click', 1.42, .7), s('hover', 1.1, .4, .04)],
  'canvas-text': [s('click', 1.55, .6), s('click', 1.8, .4, .05)],
  'canvas-erase': [n(1200, .09, .55, 0, .9), s('click', .7, .5, .03)],
  'canvas-connect': [s('hover', 1.2, .6), s('hover', 1.6, .55, .06)],
  'canvas-place': [s('click', 1.05, .8), s('hover', 1.35, .35, .05)],
  'canvas-drop': [s('click', .85, .55)],
  'canvas-rotate': [s('hover', 1.4, .45), s('hover', 1.55, .3, .04)],
  'canvas-undo': [s('hover', 1.1, .6), s('hover', .88, .45, .05)],
  'canvas-redo': [s('hover', .88, .45), s('hover', 1.1, .6, .05)],
};

function load(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return { enabled: typeof value?.enabled === 'boolean' ? value.enabled : true, volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : .15 };
  } catch { return { enabled: true, volume: .15 }; }
}

/** Canvas tools and boards, settings and editor sheets, cards and collection tiles; everything else is menu UI. */
export function zoneFor(element: Element): Zone {
  if (element.closest('.canvas-studio')) return 'canvas';
  if (element.closest('.app-settings, .card-editor, .card-composer, .settings-appearance')) return 'settings';
  if (element.closest('.library-card, .card-tile, .collection-tile, .canvas-gallery-tile')) return 'card';
  return 'menu';
}

/** Works out which cue a click deserves from the control's own semantics (captured before React updates it). */
export function cueFor(element: HTMLElement): Cue {
  const label = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.trim().toLowerCase();
  const zone = zoneFor(element);
  // A card click toggles its selection (read before React updates the class).
  if (element.matches('article.card-tile')) return element.classList.contains('is-checked') ? 'deselect' : 'select';
  if (element.matches('.settings-gear')) return 'gear';
  if (element instanceof HTMLInputElement && element.type === 'checkbox') return element.checked ? 'toggle-off' : 'toggle-on';
  if (element.getAttribute('type') === 'submit' || /^(✕)?\s*save\b/.test(label)) return 'save';
  if (/\b(delete|remove|trash)\b/.test(label)) return 'delete';
  if (/\b(close|cancel|go back|back)\b/.test(label)) return 'back';
  const pressed = element.getAttribute('aria-pressed');
  if (zone === 'canvas' && pressed === 'false' && element.closest('[aria-label="Canvas tools"]')) return 'canvas-tool';
  if (pressed !== null) return pressed === 'true' ? 'toggle-off' : 'toggle-on';
  const expanded = element.getAttribute('aria-expanded');
  if (expanded === 'true') return 'back';
  if (expanded === 'false' || element.hasAttribute('aria-haspopup') || element.tagName === 'SUMMARY') return 'open';
  return zone === 'menu' ? 'click' : `click-${zone}`;
}

export function useUiSounds() {
  const [preferences, setPreferences] = useState(load);
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, Promise<AudioBuffer>>());
  const noise = useRef<AudioBuffer | null>(null);
  const active = useRef<AudioScheduledSourceNode[]>([]);
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
    // One 0.25 s white-noise buffer, made once and filtered per cue.
    const noiseBuffer = (audio: AudioContext) => {
      if (!noise.current) {
        const buffer = audio.createBuffer(1, Math.round(audio.sampleRate * .25), audio.sampleRate), data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
        noise.current = buffer;
      }
      return noise.current;
    };
    const track = (source: AudioScheduledSourceNode, nodes: AudioNode[]) => {
      active.current.push(source);
      source.onended = () => { nodes.forEach(node => node.disconnect()); active.current = active.current.filter(item => item !== source); };
    };
    const play = (kind: Cue, force = false) => {
      const audio = context.current;
      if ((!preferences.enabled && !force) || !preferences.volume || document.hidden || !audio || audio.state !== 'running') return;
      stop(); const request = sequence.current;
      const layers = cueLayers[kind];
      void Promise.all(layers.map(layer => 'noise' in layer ? null : load(audio, layer.file))).then(decoded => {
        if (request !== sequence.current || document.hidden || audio.state !== 'running') return;
        const start = audio.currentTime;
        layers.forEach((layer, index) => {
          const source = audio.createBufferSource(), gain = audio.createGain();
          if ('noise' in layer) {
            const filter = audio.createBiquadFilter();
            filter.type = 'bandpass'; filter.frequency.value = layer.frequency; filter.Q.value = layer.q;
            source.buffer = noiseBuffer(audio);
            const at = start + layer.at, peak = preferences.volume * layer.gain;
            gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(peak, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + layer.duration);
            source.connect(filter); filter.connect(gain); gain.connect(audio.destination);
            track(source, [source, filter, gain]);
            source.start(at, Math.random() * .1, layer.duration + .02);
            return;
          }
          source.buffer = decoded[index]; source.playbackRate.value = layer.rate; gain.gain.value = preferences.volume * layer.gain;
          source.connect(gain); gain.connect(audio.destination);
          track(source, [source, gain]);
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
      const zone = zoneFor(element);
      lastHover = now; play(element.closest('.top-actions') ? 'hover-controls' : zone === 'menu' ? 'hover' : `hover-${zone}`);
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
    const noticeCue = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      play(event.detail === 'error' ? 'notify-error' : event.detail === 'info' ? 'notify-info' : 'notify');
    };
    window.addEventListener(UI_SOUND_EVENT, appCue);
    window.addEventListener(NOTICE_EVENT, noticeCue);
    const listeners: [string, EventListener][] = [['pointerdown', unlock], ['keydown', keydown as EventListener], ['pointerover', hover], ['focusin', hover], ['pointerout', leave], ['focusout', leave], ['click', click], ['visibilitychange', visibility]];
    listeners.forEach(([name, listener]) => document.addEventListener(name, listener, true));
    return () => {
      stop(); window.removeEventListener(UI_SOUND_EVENT, appCue); window.removeEventListener(NOTICE_EVENT, noticeCue);
      listeners.forEach(([name, listener]) => document.removeEventListener(name, listener, true));
    };
  }, [preferences]);
  useEffect(() => () => { void context.current?.close().catch(() => {}); }, []);
  const preview = useCallback((cue: Cue = 'save') => {
    try { context.current ??= new AudioContext(); void context.current.resume().then(() => playRef.current(cue)).catch(() => {}); } catch { /* Optional audio. */ }
  }, []);
  const previews: { label: string; cues: Cue[] }[] = [
    { label: 'Menus', cues: ['hover', 'click', 'open', 'back'] },
    { label: 'Cards', cues: ['hover-card', 'select', 'deselect', 'save', 'delete'] },
    { label: 'Settings', cues: ['gear', 'hover-controls', 'hover-settings', 'click-settings', 'toggle-on', 'toggle-off'] },
    { label: 'Canvas', cues: ['canvas-tool', 'canvas-draw', 'canvas-shape', 'canvas-erase', 'canvas-connect', 'canvas-undo'] },
    { label: 'Alerts', cues: ['notify', 'notify-info', 'notify-error', 'capture'] },
  ];
  const settings = <section aria-label="UI sounds" className="settings-appearance sound-settings">
    <h3>PS2 UI sounds</h3>
    <label><input type="checkbox" checked={preferences.enabled} onChange={event => setPreferences({ ...preferences, enabled: event.target.checked })} /> UI sounds</label>
    <label>Volume<input aria-label="UI sound volume" type="range" min="0" max="1" step=".05" value={preferences.volume} onChange={event => setPreferences({ ...preferences, volume: Number(event.target.value) })} /></label>
    {previews.map(group => <div key={group.label} className="sound-preview-row" role="group" aria-label={`${group.label} sounds`}>
      <span className="sound-preview-label">{group.label}</span>
      {group.cues.map(cue => <button type="button" key={cue} disabled={!preferences.enabled} onClick={() => preview(cue)}>{/^(hover|click)\b/.test(cue) ? cue.split('-')[0] : cue.replace(/^(canvas|notify)-/, '').replace(/^notify$/, 'success')}</button>)}
    </div>)}
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

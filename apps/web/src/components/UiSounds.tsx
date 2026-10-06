import { useCallback, useEffect, useRef, useState } from 'react';
import { InterfaceIcon } from './InterfaceIcon';
import { useHoverIntent } from '../lib/hoverIntent';
import { useExitAnimation } from '../lib/exitAnimation';
import { NOTICE_EVENT } from './Notifications';

/** `muted` lists individual cues switched off in Settings; everything else plays. */
type Preferences = { enabled: boolean; volume: number; muted: Cue[] };
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
  | 'canvas-place' | 'canvas-drop' | 'canvas-rotate' | 'canvas-undo' | 'canvas-redo' | 'canvas-tool' | 'share' | 'tilt';
/**
 * A pitched sample, a short band-passed noise burst (pencil/eraser texture), or a synthesized tone.
 * The two pack samples keep every cue in one family; each cue's own tone (waveform + pitch movement)
 * makes it recognisable on its own: rising = forward/open/on, falling = back/off/undo, square = select,
 * sine chords = success, low buzz = error.
 */
type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';
type Layer =
  | { file: keyof typeof files; at: number; rate: number; gain: number }
  | { noise: true; at: number; duration: number; frequency: number; q: number; gain: number }
  | { tone: Wave; at: number; duration: number; from: number; to: number; gain: number };
const s = (file: keyof typeof files, rate: number, gain = 1, at = 0): Layer => ({ file, at, rate, gain });
const n = (frequency: number, duration: number, gain: number, at = 0, q = 1.2): Layer => ({ noise: true, at, duration, frequency, q, gain });
const t = (tone: Wave, from: number, to: number, duration: number, gain: number, at = 0): Layer => ({ tone, at, duration, from, to, gain });
export const cueLayers: Record<Cue, Layer[]> = {
  // Menus
  hover: [s('hover', 1)],
  click: [s('click', 1)],
  open: [s('click', 1.12, .7), t('triangle', 440, 880, .09, .35, .01)],
  back: [s('click', .78, .7), t('triangle', 660, 330, .1, .35, .01)],
  // The + button tilting up on hover: a quick upward swish.
  tilt: [n(2600, .07, .3, 0, .9), t('sine', 520, 780, .08, .16, .01)],
  // Cards
  'hover-card': [s('hover', .84, .6), t('sine', 220, 230, .06, .18)],
  'click-card': [s('click', .9, .8), t('sine', 330, 330, .05, .2, .02)],
  select: [t('square', 880, 880, .04, .12), t('square', 1320, 1320, .05, .12, .045)],
  deselect: [t('square', 1320, 1320, .04, .1), t('square', 880, 880, .05, .1, .045)],
  save: [s('click', 1, .5), t('sine', 523, 523, .08, .3, .02), t('sine', 659, 659, .08, .3, .08), t('sine', 784, 784, .14, .3, .14)],
  delete: [s('click', .62, .6), t('sawtooth', 300, 90, .2, .16), n(400, .12, .25, .02, .7)],
  // Settings
  gear: [n(2400, .02, .4), n(2400, .02, .35, .05), n(2400, .02, .3, .1), t('sine', 140, 120, .16, .25)],
  'hover-controls': [t('sine', 1200, 1250, .04, .18)],
  'hover-settings': [s('hover', 1.22, .45), t('triangle', 1600, 1600, .03, .12)],
  'click-settings': [s('click', 1.2, .6), t('square', 600, 600, .03, .08, .01)],
  'toggle-on': [t('sine', 600, 900, .08, .3)],
  'toggle-off': [t('sine', 900, 600, .08, .3)],
  // Canvas
  'hover-canvas': [s('hover', 1.5, .35)],
  'click-canvas': [s('click', 1.38, .55), t('triangle', 1100, 1100, .03, .1)],
  'canvas-tool': [t('triangle', 1000, 1000, .05, .2), t('triangle', 1500, 1500, .06, .16, .03)],
  'canvas-draw': [n(3200, .11, .5), s('hover', 1.7, .2, .02)],
  'canvas-highlight': [n(1800, .16, .45, 0, .8), t('sine', 700, 760, .1, .1, .02)],
  'canvas-shape': [t('square', 500, 500, .05, .1), t('sine', 750, 750, .08, .22, .02)],
  'canvas-text': [s('click', 1.55, .5), s('click', 1.8, .35, .05), t('sine', 1400, 1400, .03, .12, .09)],
  'canvas-erase': [n(1200, .09, .55, 0, .9), s('click', .7, .45, .03)],
  'canvas-connect': [t('sine', 400, 1200, .14, .28)],
  'canvas-place': [s('click', 1.05, .7), t('sine', 520, 520, .06, .18, .03)],
  'canvas-drop': [s('click', .85, .5), t('sine', 260, 200, .08, .2)],
  'canvas-rotate': [t('triangle', 700, 820, .07, .2), t('triangle', 820, 940, .07, .16, .06)],
  'canvas-undo': [t('triangle', 900, 900, .05, .22), t('triangle', 600, 600, .07, .22, .06)],
  'canvas-redo': [t('triangle', 600, 600, .05, .22), t('triangle', 900, 900, .07, .22, .06)],
  // Alerts
  notify: [t('sine', 784, 784, .1, .26), t('sine', 988, 988, .1, .26, .07), t('sine', 1319, 1319, .22, .24, .14)],
  'notify-info': [t('sine', 880, 880, .09, .22), t('sine', 1175, 1175, .16, .2, .08)],
  'notify-error': [t('square', 220, 220, .12, .1), t('square', 196, 196, .18, .1, .13)],
  capture: [n(5000, .05, .5, 0, .6), s('click', 1.18, .7, .03), t('sine', 1760, 1760, .08, .14, .07)],
  share: [t('sine', 660, 990, .1, .24), t('sine', 1320, 1320, .16, .2, .09)],
};

function load(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    const muted = Array.isArray(value?.muted) ? value.muted.filter((cue: unknown): cue is Cue => typeof cue === 'string' && cue in cueLayers) : [];
    return { enabled: typeof value?.enabled === 'boolean' ? value.enabled : true, volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : .15, muted };
  } catch { return { enabled: true, volume: .15, muted: [] }; }
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
      if ((!preferences.enabled && !force) || (preferences.muted.includes(kind) && !force) || !preferences.volume || document.hidden || !audio || audio.state !== 'running') return;
      stop(); const request = sequence.current;
      const layers = cueLayers[kind];
      void Promise.all(layers.map(layer => 'file' in layer ? load(audio, layer.file) : null)).then(decoded => {
        if (request !== sequence.current || document.hidden || audio.state !== 'running') return;
        const start = audio.currentTime;
        layers.forEach((layer, index) => {
          const source = audio.createBufferSource(), gain = audio.createGain();
          if ('tone' in layer) {
            const oscillator = audio.createOscillator();
            const at = start + layer.at, peak = preferences.volume * layer.gain;
            oscillator.type = layer.tone;
            oscillator.frequency.setValueAtTime(layer.from, at);
            if (layer.to !== layer.from) oscillator.frequency.exponentialRampToValueAtTime(layer.to, at + layer.duration);
            gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(peak, at + .005); gain.gain.exponentialRampToValueAtTime(.0001, at + layer.duration);
            oscillator.connect(gain); gain.connect(audio.destination);
            track(oscillator, [oscillator, gain]);
            oscillator.start(at); oscillator.stop(at + layer.duration + .02);
            return;
          }
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
      lastHover = now;
      // Sound buttons in Settings play their own sound (even when switched off, so it can be auditioned).
      const own = element.dataset.cue;
      if (own && own in cueLayers) { play(own as Cue, true); return; }
      // Controls with their own hover animation get a matching sound: the gear spins, + tilts up.
      if (element.matches('.settings-gear')) { play('gear'); return; }
      if (element.matches('.floating-add-button')) { play('tilt'); return; }
      const zone = zoneFor(element);
      play(element.closest('.top-actions') ? 'hover-controls' : zone === 'menu' ? 'hover' : `hover-${zone}`);
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
    { label: 'Menus', cues: ['hover', 'click', 'open', 'back', 'tilt'] },
    { label: 'Cards', cues: ['hover-card', 'select', 'deselect', 'save', 'delete'] },
    { label: 'Settings', cues: ['gear', 'hover-controls', 'hover-settings', 'click-settings', 'toggle-on', 'toggle-off'] },
    { label: 'Canvas', cues: ['canvas-tool', 'canvas-draw', 'canvas-shape', 'canvas-erase', 'canvas-connect', 'canvas-undo'] },
    { label: 'Alerts', cues: ['notify', 'notify-info', 'notify-error', 'capture', 'share'] },
  ];
  const settings = <section aria-label="UI sounds" className="settings-appearance sound-settings">
    <h3>PS2 UI sounds</h3>
    <label><input type="checkbox" checked={preferences.enabled} onChange={event => setPreferences({ ...preferences, enabled: event.target.checked })} /> UI sounds</label>
    <label>Volume<input aria-label="UI sound volume" type="range" min="0" max="1" step=".05" value={preferences.volume} onChange={event => setPreferences({ ...preferences, volume: Number(event.target.value) })} /></label>
    <p className="sound-preview-hint">Hover a sound to hear it. Click it to switch it off or on; click a group name to switch the whole group.</p>
    {previews.map(group => {
      const allOff = group.cues.every(cue => preferences.muted.includes(cue));
      return <div key={group.label} className="sound-preview-row" role="group" aria-label={`${group.label} sounds`}>
        <button type="button" className="sound-preview-label" aria-pressed={!allOff} disabled={!preferences.enabled} title={allOff ? `Turn ${group.label.toLowerCase()} sounds on` : `Turn ${group.label.toLowerCase()} sounds off`}
          onClick={() => setPreferences({ ...preferences, muted: allOff ? preferences.muted.filter(cue => !group.cues.includes(cue)) : [...new Set([...preferences.muted, ...group.cues])] })}>{group.label}</button>
        {group.cues.map(cue => {
          const on = !preferences.muted.includes(cue);
          const name = cue === 'hover-controls' ? 'controls' : /^(hover|click)\b/.test(cue) ? cue.split('-')[0] : cue.replace(/^(canvas|notify)-/, '').replace(/^notify$/, 'success');
          return <button type="button" key={cue} data-cue={cue} disabled={!preferences.enabled} aria-pressed={on} aria-label={`${group.label} ${name} sound`} title={on ? 'On · click to switch off' : 'Off · click to switch on'}
            onClick={() => { setPreferences({ ...preferences, muted: on ? [...preferences.muted, cue] : preferences.muted.filter(item => item !== cue) }); if (!on) preview(cue); }}>{name}</button>;
        })}
      </div>;
    })}
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

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useExitAnimation } from '../lib/exitAnimation';

// Small PS2-style colour picker used instead of the browser's native dialog: a shade square, a hue
// strip, a hex field and optional swatches. Changes apply when a gesture ends, never per pointer move.

type Hsv = { h: number; s: number; v: number };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return `#${[f(5), f(3), f(1)].map(part => part.toString(16).padStart(2, '0')).join('')}`;
}

type PopoverProps = { anchor: HTMLElement; value: string; label: string; swatches?: string[]; onChange: (hex: string) => void; onClose: () => void };

/** The picker panel, placed under (or above) `anchor` and kept on screen. */
export function ColorPopover({ anchor, value, label, swatches = [], onChange, onClose }: PopoverProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(isHex(value) ? value : '#3cc8ff'));
  const [hex, setHex] = useState(isHex(value) ? value : '#3cc8ff');
  const [position, setPosition] = useState({ left: -9999, top: -9999 });
  const panel = useRef<HTMLDivElement | null>(null);
  const exitRef = useExitAnimation<HTMLDivElement>();
  const square = useRef<HTMLDivElement | null>(null);
  const current = hsvToHex(hsv);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect(), p = panel.current?.getBoundingClientRect();
      const width = p?.width ?? 236, height = p?.height ?? 260;
      const below = a.bottom + 8 + height <= innerHeight - 8;
      setPosition({ left: clamp(a.left + a.width / 2 - width / 2, 8, innerWidth - width - 8), top: below ? a.bottom + 8 : Math.max(8, a.top - height - 8) });
    };
    place();
    addEventListener('resize', place); addEventListener('scroll', place, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [anchor]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!panel.current?.contains(target) && !anchor.contains(target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); anchor.focus(); } };
    // Window capture runs before the dialog's document listener, so Escape closes only the picker.
    document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);

  const commit = (next: Hsv | string) => {
    const color = typeof next === 'string' ? next : hsvToHex(next);
    setHex(color);
    if (color.toLowerCase() !== value.toLowerCase()) onChange(color);
  };
  const pickShade = (event: React.PointerEvent<HTMLDivElement>, done = false) => {
    const box = square.current!.getBoundingClientRect();
    const next = { ...hsv, s: clamp((event.clientX - box.left) / box.width), v: 1 - clamp((event.clientY - box.top) / box.height) };
    setHsv(next); setHex(hsvToHex(next));
    if (done) commit(next);
  };
  const keyShade = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? .1 : .02;
    const moves: Record<string, Partial<Hsv>> = { ArrowLeft: { s: hsv.s - step }, ArrowRight: { s: hsv.s + step }, ArrowUp: { v: hsv.v + step }, ArrowDown: { v: hsv.v - step } };
    const move = moves[event.key]; if (!move) return;
    event.preventDefault();
    const next = { ...hsv, s: clamp(move.s ?? hsv.s), v: clamp(move.v ?? hsv.v) };
    setHsv(next); commit(next);
  };

  const host = (anchor.closest('.app-shell') ?? document.body) as HTMLElement;
  return createPortal(<div ref={node => { panel.current = node; exitRef(node); }} className="color-pop" role="dialog" aria-label={label} style={position}>
    <div ref={square} className="color-pop-square" role="slider" tabIndex={0} aria-label="Shade" aria-valuetext={current}
      style={{ background: `linear-gradient(transparent, #000), linear-gradient(90deg, #fff, hsl(${hsv.h} 100% 50%))` }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pickShade(event); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickShade(event); }}
      onPointerUp={event => pickShade(event, true)} onKeyDown={keyShade}>
      <i className="color-pop-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
    </div>
    <input className="color-pop-hue" type="range" min="0" max="359" aria-label="Hue" value={Math.round(hsv.h)}
      onChange={event => { const next = { ...hsv, h: Number(event.target.value) }; setHsv(next); setHex(hsvToHex(next)); }}
      onPointerUp={() => commit(hsv)} onKeyUp={() => commit(hsv)} />
    <div className="color-pop-row">
      <span className="color-pop-preview" style={{ background: current }} aria-hidden="true" />
      <input className="color-pop-hex" aria-label={`${label} hex`} value={hex} maxLength={7} spellCheck={false}
        onChange={event => {
          const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
          if (!/^#[0-9a-f]{0,6}$/i.test(next)) return;
          setHex(next);
          if (isHex(next)) { setHsv(hexToHsv(next)); onChange(next); }
        }} />
      <button type="button" className="color-pop-done" onClick={() => { onClose(); anchor.focus(); }}><b className="glyph-crs" aria-hidden="true">✕</b>Done</button>
    </div>
    {swatches.length > 0 && <div className="color-pop-swatches">{swatches.map(color => <button type="button" key={color} aria-label={`Use ${color}`} aria-pressed={color.toLowerCase() === current.toLowerCase()}
      style={{ background: color }} onClick={() => { setHsv(hexToHsv(color)); commit(color); }} />)}</div>}
  </div>, host);
}

/** A trigger button that opens the picker. `children` customises how the trigger looks. */
export function ColorPickerButton({ value, onChange, label, className = '', swatches, title, children }: {
  value: string; onChange: (hex: string) => void; label: string; className?: string; swatches?: string[]; title?: string; children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <button type="button" className={className} aria-label={label} title={title ?? label} aria-haspopup="dialog" aria-expanded={!!anchor}
      onClick={event => { const target = event.currentTarget; setAnchor(current => current ? null : target); }}>{children}</button>
    {anchor && <ColorPopover anchor={anchor} value={value} label={label} swatches={swatches} onChange={onChange} onClose={() => setAnchor(null)} />}
  </>;
}

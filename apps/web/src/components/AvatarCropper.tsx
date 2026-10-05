import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Dialog } from './Dialog';
import { BButton } from './BButton';

/** On-screen crop frame and the saved avatar, in pixels. 256 px keeps a photo at a few dozen KB. */
export const CROP_FRAME = 240;
export const AVATAR_SIZE = 256;
const MAX_ZOOM = 4;

type View = { zoom: number; x: number; y: number };
type Size = { width: number; height: number };

/** Image size at zoom 1: the smallest that still covers the frame. */
export function coverSize(image: Size, frame = CROP_FRAME): Size {
  const scale = Math.max(frame / image.width, frame / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Keeps the frame covered: the image may not be panned past its own edges. */
export function clampView(view: View, image: Size, frame = CROP_FRAME): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
  const base = coverSize(image, frame);
  const limitX = (base.width * zoom - frame) / 2, limitY = (base.height * zoom - frame) / 2;
  return { zoom, x: Math.min(limitX, Math.max(-limitX, view.x)), y: Math.min(limitY, Math.max(-limitY, view.y)) };
}

/** Draws what the frame shows onto a small square and returns it as a JPEG data URL. */
export function renderAvatar(image: HTMLImageElement, view: View, frame = CROP_FRAME, size = AVATAR_SIZE): string {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot crop images.');
  const base = coverSize({ width: image.naturalWidth, height: image.naturalHeight }, frame);
  const scale = size / frame;
  context.fillStyle = '#fff'; context.fillRect(0, 0, size, size); // transparent PNGs get a plain backing
  context.imageSmoothingQuality = 'high';
  context.translate(size / 2, size / 2); context.scale(scale, scale); context.translate(view.x, view.y);
  const width = base.width * view.zoom, height = base.height * view.zoom;
  context.drawImage(image, -width / 2, -height / 2, width, height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function AvatarCropper({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (dataUrl: string) => void }) {
  const [source, setSource] = useState('');
  const [natural, setNatural] = useState<Size | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState('');
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = (next: View) => { if (natural) setView(clampView(next, natural)); };
  const base = natural ? coverSize(natural) : null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { id: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) update({ ...view, x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => update({ ...view, zoom: view.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) { event.preventDefault(); update({ ...view, x: view.x + move[0], y: view.y + move[1] }); }
    if (event.key === '+' || event.key === '=') update({ ...view, zoom: view.zoom * 1.1 });
    if (event.key === '-') update({ ...view, zoom: view.zoom / 1.1 });
  };
  const save = () => {
    if (!image.current || !natural) return;
    try { onSave(renderAvatar(image.current, view)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The photo could not be cropped.'); }
  };

  return <Dialog label="Crop profile photo" className="app-settings avatar-cropper" onClose={onCancel}>
    <BButton className="close-detail" label="Cancel photo" onClick={onCancel} />
    <h2>Crop photo</h2>
    <div className="avatar-crop-frame" style={{ width: CROP_FRAME, height: CROP_FRAME }} tabIndex={0} role="group"
      aria-label="Photo position. Drag or use the arrow keys to move it; plus and minus zoom."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onWheel={onWheel} onKeyDown={onKeyDown}>
      {source && <img ref={image} src={source} alt="" draggable={false}
        style={base ? { width: base.width * view.zoom, height: base.height * view.zoom, translate: `calc(-50% + ${view.x}px) calc(-50% + ${view.y}px)` } : { visibility: 'hidden' }}
        onLoad={event => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; if (width && height) { setNatural({ width, height }); setView({ zoom: 1, x: 0, y: 0 }); } }}
        onError={() => setError('This image could not be opened. Try a JPEG, PNG or WebP.')} />}
    </div>
    <label className="avatar-crop-zoom"><span>Zoom</span>
      <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} aria-label="Zoom" disabled={!natural}
        onChange={event => update({ ...view, zoom: Number(event.target.value) })} />
    </label>
    {error && <p className="profile-message error" role="alert">{error}</p>}
    <div className="avatar-crop-actions">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" disabled={!natural} onClick={save}>Use photo</button>
    </div>
  </Dialog>;
}

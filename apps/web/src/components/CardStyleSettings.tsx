import type { CardCorners, CardFrame, CardStyle } from '../lib/cardStyle';

const backgrounds = ['#04060b', '#0c1424', '#2a2ca6', '#1d0b33', '#0d2a26', '#e6f6ff', '#dde8f4'];
const frames: { id: CardFrame; label: string }[] = [{ id: 'line', label: 'Line' }, { id: 'dashed', label: 'Dashed' }, { id: 'double', label: 'Double' }, { id: 'none', label: 'None' }];
const corners: { id: CardCorners; label: string }[] = [{ id: 'square', label: 'Square' }, { id: 'soft', label: 'Soft' }, { id: 'round', label: 'Round' }];

export function CardStyleSettings({ value, onChange }: { value: CardStyle; onChange: (next: CardStyle) => void }) {
  return <section className="appearance-settings card-style-settings" aria-label="Cards">
    <div className="settings-technical-heading"><span>CARDS</span><h3>Card style</h3></div>
    <div className="card-style-row"><span>Background</span>
      <div className="card-style-swatches">
        <button type="button" className="card-style-swatch card-style-swatch-auto" aria-label="Match skin" aria-pressed={!value.background} onClick={() => onChange({ ...value, background: null })} />
        {backgrounds.map(color => <button type="button" key={color} className="card-style-swatch" style={{ background: color }} aria-label={`Card background ${color}`} aria-pressed={value.background === color} onClick={() => onChange({ ...value, background: color })} />)}
        <label className="card-style-swatch card-style-swatch-custom" title="Custom"><input type="color" aria-label="Custom card background" value={value.background ?? '#0c1424'} onChange={event => onChange({ ...value, background: event.target.value })} /></label>
      </div>
    </div>
    <div className="card-style-row"><span>Frame</span>
      <div className="card-style-segment" role="group" aria-label="Card frame">{frames.map(item => <button type="button" key={item.id} aria-pressed={value.frame === item.id} onClick={() => onChange({ ...value, frame: item.id })}>{item.label}</button>)}</div>
    </div>
    <div className="card-style-row"><span>Corners</span>
      <div className="card-style-segment" role="group" aria-label="Card corners">{corners.map(item => <button type="button" key={item.id} aria-pressed={value.corners === item.id} onClick={() => onChange({ ...value, corners: item.id })}>{item.label}</button>)}</div>
    </div>
    <label className="card-style-row card-style-toggle"><span>Show titles</span><input type="checkbox" checked={value.titles} onChange={event => onChange({ ...value, titles: event.target.checked })} /></label>
    <label className="card-style-row card-style-toggle"><span>Glow on hover</span><input type="checkbox" checked={value.glow} onChange={event => onChange({ ...value, glow: event.target.checked })} /></label>
  </section>;
}

import { appearanceLabels, appearancePresets, contrastRatio, type AppearanceConfig, type AppearanceKey, type AppearancePreset } from '../lib/appearance';

export const appearancePresetNames: Record<Exclude<AppearancePreset, 'custom'>, string> = { playstation: 'PSX2 Schematic', blueprint: 'Blueprint', synthwave: 'Synthwave', graphite: 'Graphite', 'ps-blue': 'PS Blue', 'warm-crt': 'Warm CRT' };

export function AppearanceSettings({ value, onChange }: { value: AppearanceConfig; onChange: (next: AppearanceConfig) => void }) {
  const activeDefaults = value.preset === 'custom' ? appearancePresets.playstation : appearancePresets[value.preset];
  const lowContrast = contrastRatio(value.values.background, value.values.text) < 4.5;
  const choosePreset = (preset: Exclude<AppearancePreset, 'custom'>) => onChange({ preset, values: { ...appearancePresets[preset] } });
  return <section className="appearance-settings" aria-label="Appearance" aria-labelledby="appearance-title">
    <div className="settings-technical-heading"><span>APPEARANCE</span><h3 id="appearance-title">System colors</h3></div>
    <div className="appearance-presets" role="group" aria-label="Appearance preset">
      {(Object.keys(appearancePresetNames) as Exclude<AppearancePreset, 'custom'>[]).map(preset => <button type="button" key={preset} aria-pressed={value.preset === preset} onClick={() => choosePreset(preset)}>
        <span className="preset-swatch" style={{ background: `linear-gradient(145deg, ${appearancePresets[preset].background} 45%, ${appearancePresets[preset].accentPrimary})` }} />
        {appearancePresetNames[preset]}
      </button>)}
      <button type="button" aria-pressed={value.preset === 'custom'} onClick={() => onChange({ ...value, preset: 'custom' })}>
        <span className="preset-swatch" style={{ background: `linear-gradient(145deg, ${value.values.background} 45%, ${value.values.accentPrimary})` }} />Custom
      </button>
    </div>
    <div className="appearance-preview" style={{ background: value.values.background, color: value.values.text, borderColor: value.values.line }}>
      <span className="appearance-preview-label">LIVE PREVIEW / 01</span>
      <div className="appearance-preview-card" style={{ background: value.values.surface, borderColor: value.values.selection }}><i style={{ background: value.values.accentSecondary }} /><strong>Selected reference</strong><small style={{ color: value.values.textMuted }}>Technical surface preview</small></div>
      <span className="appearance-preview-nav" style={{ color: value.values.accentPrimary }}>● ACTIVE SYSTEM</span>
    </div>
    {lowContrast && <p className="appearance-warning" role="alert">Primary text needs more contrast against the background.</p>}
    <div className="appearance-colors">
      {(Object.keys(appearanceLabels) as AppearanceKey[]).map(key => <div className="appearance-color-row" key={key}>
        <label htmlFor={`appearance-${key}`}>{appearanceLabels[key]}</label>
        <input className="appearance-color-swatch" aria-label={`${appearanceLabels[key]} color picker`} type="color" value={value.values[key]} onChange={event => onChange({ preset: 'custom', values: { ...value.values, [key]: event.target.value } })} />
        <input id={`appearance-${key}`} className="appearance-hex" value={value.values[key]} maxLength={7} spellCheck={false} onChange={event => {
          const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
          if (/^#[0-9a-f]{0,6}$/i.test(next)) onChange({ preset: 'custom', values: { ...value.values, [key]: next.length === 7 ? next : value.values[key] } });
        }} />
        <button type="button" onClick={() => onChange({ preset: 'custom', values: { ...value.values, [key]: activeDefaults[key] } })}>Reset</button>
      </div>)}
    </div>
    <div className="appearance-reset-actions">
      <button type="button" onClick={() => onChange({ preset: value.preset, values: { ...activeDefaults } })}>Reset to preset</button>
      <button type="button" onClick={() => { if (window.confirm('Restore the Duckler / PlayStation appearance defaults?')) choosePreset('playstation'); }}>Restore Duckler defaults</button>
    </div>
  </section>;
}

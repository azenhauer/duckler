import type { CSSProperties } from 'react';

export type AppearanceKey = 'background' | 'surface' | 'surfaceAlt' | 'text' | 'textMuted' | 'line' | 'accentPrimary' | 'accentSecondary' | 'selection' | 'glow';
export type AppearanceValues = Record<AppearanceKey, string>;
export type AppearancePreset = 'playstation' | 'blueprint' | 'synthwave' | 'graphite' | 'ps-blue' | 'warm-crt' | 'custom';
export type AppearanceConfig = { preset: AppearancePreset; values: AppearanceValues };

export const APPEARANCE_STORAGE_KEY = 'duckler-appearance-v1';
export const appearanceLabels: Record<AppearanceKey, string> = {
  background: 'Background', surface: 'Surface / panel', surfaceAlt: 'Secondary surface', text: 'Primary text',
  textMuted: 'Secondary text', line: 'Technical line', accentPrimary: 'Primary accent', accentSecondary: 'Secondary accent',
  selection: 'Selection / focus', glow: 'Glow',
};

export const appearancePresets: Record<Exclude<AppearancePreset, 'custom'>, AppearanceValues> = {
  // PSX2 schematic: black field, cyan line art, PS2 system-menu yellow.
  playstation: { background: '#04060b', surface: '#070b14', surfaceAlt: '#0c1424', text: '#e6f6ff', textMuted: '#7fa9c9', line: '#2fb8f0', accentPrimary: '#3cc8ff', accentSecondary: '#f2d33d', selection: '#5fd4ff', glow: '#3b62ff' },
  // Controller blueprint sheet: royal blue field, white line art.
  blueprint: { background: '#2a2ca6', surface: '#2a2ca6', surfaceAlt: '#3335b6', text: '#ffffff', textMuted: '#c7cbff', line: '#ffffff', accentPrimary: '#ffffff', accentSecondary: '#ffd84a', selection: '#ffffff', glow: '#9aa6ff' },
  synthwave: { background: '#0d0418', surface: '#1a0a2c', surfaceAlt: '#26103d', text: '#fff0fb', textMuted: '#c9a6d9', line: '#8a3fa8', accentPrimary: '#ff4fd8', accentSecondary: '#3ff0ff', selection: '#ff7ae3', glow: '#ff2fb4' },
  graphite: { background: '#101112', surface: '#191b1d', surfaceAlt: '#222528', text: '#eceeef', textMuted: '#a4aaae', line: '#596168', accentPrimary: '#c8d0d7', accentSecondary: '#7d8a94', selection: '#d8e2e8', glow: '#9aaab6' },
  'ps-blue': { background: '#070c15', surface: '#101a27', surfaceAlt: '#152438', text: '#eaf4ff', textMuted: '#9db4cd', line: '#325f8a', accentPrimary: '#47a5ff', accentSecondary: '#67e1ff', selection: '#5db8ff', glow: '#168cff' },
  'warm-crt': { background: '#100d0a', surface: '#1c1712', surfaceAlt: '#282019', text: '#f0e9dd', textMuted: '#b7aa99', line: '#796451', accentPrimary: '#e39a52', accentSecondary: '#d7c36b', selection: '#f2ac60', glow: '#d76e32' },
};

export const defaultAppearance: AppearanceConfig = { preset: 'playstation', values: appearancePresets.playstation };
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function loadAppearance(): AppearanceConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null') as Partial<AppearanceConfig> | null;
    if (!parsed?.values) return defaultAppearance;
    // A named preset always uses its current colours, so preset updates reach people who picked it.
    if (parsed.preset && parsed.preset !== 'custom' && parsed.preset in appearancePresets) {
      const preset = parsed.preset as Exclude<AppearancePreset, 'custom'>;
      return { preset, values: { ...appearancePresets[preset] } };
    }
    const values = { ...appearancePresets.playstation };
    for (const key of Object.keys(values) as AppearanceKey[]) if (isHexColor(parsed.values[key] ?? '')) values[key] = parsed.values[key]!;
    return { preset: 'custom', values };
  } catch { return defaultAppearance; }
}

export function appearanceStyle(values: AppearanceValues, theme: 'light' | 'dark' = 'dark'): CSSProperties {
  // Light mode is the PS2 aqua print ad: pale silver-blue paper, deep blue ink and line art.
  if (theme === 'light') values = { ...values, background: '#dde8f4', surface: '#edf3fa', surfaceAlt: '#d2dfee', text: '#0f2a63', textMuted: '#4a6594', line: '#2e63c6', accentPrimary: '#1f5fd8', accentSecondary: mixHex(values.accentSecondary, '#0f2a63', .45), selection: '#1f5fd8', glow: '#6f9cff' };
  return {
    '--ui-bg': values.background, '--ui-surface': values.surface, '--ui-surface-alt': values.surfaceAlt,
    '--ui-text': values.text, '--ui-text-muted': values.textMuted, '--ui-line': values.line,
    '--ui-accent-primary': values.accentPrimary, '--ui-accent-secondary': values.accentSecondary,
    '--ui-selection': values.selection, '--ui-glow': values.glow,
  } as CSSProperties;
}

function mixHex(a: string, b: string, amount: number) {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16);
  return '#' + [1, 3, 5].map(index => Math.round(channel(a, index) * (1 - amount) + channel(b, index) * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
export function contrastRatio(a: string, b: string) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + .05) / (dark + .05);
}

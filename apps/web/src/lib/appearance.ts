import type { CSSProperties } from 'react';

export type AppearanceKey = 'background' | 'surface' | 'surfaceAlt' | 'text' | 'textMuted' | 'line' | 'accentPrimary' | 'accentSecondary' | 'selection' | 'glow';
export type AppearanceValues = Record<AppearanceKey, string>;
export type AppearancePreset = 'playstation' | 'graphite' | 'ps-blue' | 'warm-crt' | 'custom';
export type AppearanceConfig = { preset: AppearancePreset; values: AppearanceValues };

export const APPEARANCE_STORAGE_KEY = 'duckler-appearance-v1';
export const appearanceLabels: Record<AppearanceKey, string> = {
  background: 'Background', surface: 'Surface / panel', surfaceAlt: 'Secondary surface', text: 'Primary text',
  textMuted: 'Secondary text', line: 'Technical line', accentPrimary: 'Primary accent', accentSecondary: 'Secondary accent',
  selection: 'Selection / focus', glow: 'Glow',
};

export const appearancePresets: Record<Exclude<AppearancePreset, 'custom'>, AppearanceValues> = {
  playstation: { background: '#0b0d0f', surface: '#14181c', surfaceAlt: '#1a1f24', text: '#e8ebed', textMuted: '#a8b0b7', line: '#536978', accentPrimary: '#7cbcff', accentSecondary: '#3dd6bb', selection: '#8fc7ff', glow: '#4a9eff' },
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
    const values = { ...appearancePresets.playstation };
    for (const key of Object.keys(values) as AppearanceKey[]) if (isHexColor(parsed.values[key] ?? '')) values[key] = parsed.values[key]!;
    return { preset: parsed.preset && ['playstation', 'graphite', 'ps-blue', 'warm-crt', 'custom'].includes(parsed.preset) ? parsed.preset : 'custom', values } as AppearanceConfig;
  } catch { return defaultAppearance; }
}

export function appearanceStyle(values: AppearanceValues): CSSProperties {
  return {
    '--ui-bg': values.background, '--ui-surface': values.surface, '--ui-surface-alt': values.surfaceAlt,
    '--ui-text': values.text, '--ui-text-muted': values.textMuted, '--ui-line': values.line,
    '--ui-accent-primary': values.accentPrimary, '--ui-accent-secondary': values.accentSecondary,
    '--ui-selection': values.selection, '--ui-glow': values.glow,
  } as CSSProperties;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
export function contrastRatio(a: string, b: string) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + .05) / (dark + .05);
}

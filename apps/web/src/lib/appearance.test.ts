import { beforeEach, describe, expect, it } from 'vitest';
import { appearancePresets, contrastRatio, defaultAppearance, loadAppearance, APPEARANCE_STORAGE_KEY } from './appearance';

describe('appearance tokens', () => {
  beforeEach(() => localStorage.clear());

  it('starts with the PlayStation preset and keeps readable contrast', () => {
    expect(defaultAppearance.preset).toBe('playstation');
    expect(contrastRatio(appearancePresets.playstation.background, appearancePresets.playstation.text)).toBeGreaterThan(4.5);
  });

  it('restores valid saved colors and ignores malformed values', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ preset: 'custom', values: { background: '#123456', text: 'not-a-color' } }));
    const loaded = loadAppearance();
    expect(loaded.preset).toBe('custom');
    expect(loaded.values.background).toBe('#123456');
    expect(loaded.values.text).toBe(appearancePresets.playstation.text);
  });
});

import { useEffect, useState } from 'react';

export type CardFrame = 'line' | 'dashed' | 'double' | 'none';
export type CardCorners = 'square' | 'soft' | 'round';
export type CardStyle = { background: string | null; frame: CardFrame; corners: CardCorners; titles: boolean; glow: boolean };
export const CARD_STYLE_KEY = 'duckler-card-style-v1';
export const defaultCardStyle: CardStyle = { background: null, frame: 'line', corners: 'square', titles: true, glow: true };

const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function loadCardStyle(): CardStyle {
  try {
    const raw = JSON.parse(localStorage.getItem(CARD_STYLE_KEY) ?? 'null') as Partial<CardStyle> | null;
    if (!raw) return defaultCardStyle;
    return {
      background: hex(raw.background) ? raw.background : null,
      frame: ['line', 'dashed', 'double', 'none'].includes(raw.frame as string) ? raw.frame as CardFrame : 'line',
      corners: ['square', 'soft', 'round'].includes(raw.corners as string) ? raw.corners as CardCorners : 'square',
      titles: raw.titles !== false,
      glow: raw.glow !== false,
    };
  } catch { return defaultCardStyle; }
}

/** Global card look, applied to the app shell as data attributes and one custom property. */
export function useCardStyle() {
  const [style, setStyle] = useState(loadCardStyle);
  useEffect(() => { try { localStorage.setItem(CARD_STYLE_KEY, JSON.stringify(style)); } catch { /* Keep in memory. */ } }, [style]);
  const shellProps = {
    'data-card-frame': style.frame, 'data-card-corners': style.corners,
    'data-card-titles': style.titles ? 'show' : 'hide', 'data-card-glow': style.glow ? 'on' : 'off',
  };
  const shellStyle: Record<string, string> = style.background ? { '--card-bg': style.background } : {};
  return { style, setStyle, shellProps, shellStyle };
}

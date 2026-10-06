import { describe, expect, it } from 'vitest';
import { inSafeArea } from './hoverIntent';

// A menu below and to the right of where the pointer left its trigger.
const menu = { left: 100, top: 100, right: 300, bottom: 260 };
const leftAt = { x: 120, y: 60 };

describe('hover menu safe area', () => {
  it('keeps the path from the trigger to the menu, and the menu itself', () => {
    expect(inSafeArea({ x: 140, y: 80 }, leftAt, menu)).toBe(true); // heading down to the menu
    expect(inSafeArea({ x: 250, y: 95 }, leftAt, menu)).toBe(true); // diagonally toward its far corner
    expect(inSafeArea({ x: 200, y: 200 }, leftAt, menu)).toBe(true); // inside the menu
  });

  it('treats moving away as leaving', () => {
    expect(inSafeArea({ x: 120, y: 30 }, leftAt, menu)).toBe(false); // back up, past the trigger
    expect(inSafeArea({ x: 20, y: 90 }, leftAt, menu)).toBe(false); // off to the left
    expect(inSafeArea({ x: 400, y: 70 }, leftAt, menu)).toBe(false); // far right, above the menu
  });
});

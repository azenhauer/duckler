import { validateCapture } from './captureProtocol';

const base = { id: 'capture-1', kind: 'text', title: 'A note', note: 'Body', createdAt: '2026-10-05T00:00:00.000Z' };

describe('capture card colour', () => {
  it('keeps a #rrggbb colour (lower-cased) and drops anything else', () => {
    expect(validateCapture({ ...base, color: '#FF4B4B' }).color).toBe('#ff4b4b');
    for (const color of ['red', '#fff', 'javascript:alert(1)', '#12345g', 42, '']) expect('color' in validateCapture({ ...base, color })).toBe(false);
    expect('color' in validateCapture(base)).toBe(false);
  });
});

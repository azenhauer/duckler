import { validateCapture } from './captureProtocol';
import { MAX_PAGE_EXCERPT, normalizePageExcerpt } from './autofill';

const base = { id: 'capture-1', kind: 'text', title: 'A note', note: 'Body', createdAt: '2026-10-05T00:00:00.000Z' };

describe('capture card colour', () => {
  it('keeps a #rrggbb colour (lower-cased) and drops anything else', () => {
    expect(validateCapture({ ...base, color: '#FF4B4B' }).color).toBe('#ff4b4b');
    for (const color of ['red', '#fff', 'javascript:alert(1)', '#12345g', 42, '']) expect('color' in validateCapture({ ...base, color })).toBe(false);
    expect('color' in validateCapture(base)).toBe(false);
  });
});

describe('capture page excerpt (clip autofill 1.1)', () => {
  it('stays backward compatible: captures without an excerpt validate unchanged', () => {
    const capture = validateCapture(base);
    expect('pageExcerpt' in capture).toBe(false);
    expect(capture).toMatchObject({ id: 'capture-1', kind: 'text', title: 'A note', note: 'Body' });
  });

  it('keeps a normalized, capped excerpt and drops anything that is not useful text', () => {
    expect(validateCapture({ ...base, pageExcerpt: '  Harbour   lights\n\nat dusk  ' }).pageExcerpt).toBe('Harbour lights at dusk');
    expect(validateCapture({ ...base, pageExcerpt: 'x'.repeat(5000) }).pageExcerpt).toHaveLength(MAX_PAGE_EXCERPT);
    for (const pageExcerpt of ['', '   \n ', 42, null, ['text'], { text: 'x' }]) expect('pageExcerpt' in validateCapture({ ...base, pageExcerpt })).toBe(false);
  });

  it('normalizePageExcerpt never returns blank text', () => {
    expect(normalizePageExcerpt('a\tb')).toBe('a b');
    expect(normalizePageExcerpt(' ')).toBeUndefined();
    expect(normalizePageExcerpt(undefined)).toBeUndefined();
  });
});

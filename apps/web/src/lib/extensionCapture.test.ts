import { describe, expect, it } from 'vitest';
import { parseExtensionCapture } from './extensionCapture';

describe('parseExtensionCapture', () => {
  it('accepts valid extension captures and preserves the capture id', () => {
    expect(parseExtensionCapture(JSON.stringify({
      id: 'capture-1',
      kind: 'screenshot',
      title: 'Captured selection',
      sourceUrl: 'https://example.com/page',
      payload: 'data:image/jpeg;base64,AAAA',
    }))).toMatchObject({
      id: 'capture-1',
      kind: 'screenshot',
      sourceUrl: 'https://example.com/page',
    });
  });

  it('rejects malformed and unsafe captures', () => {
    expect(() => parseExtensionCapture('{')).toThrow(/invalid/i);
    expect(() => parseExtensionCapture(JSON.stringify({
      id: 'bad-url',
      kind: 'bookmark',
      title: 'Unsafe',
      sourceUrl: 'javascript:alert(1)',
    }))).toThrow(/HTTP or HTTPS/i);
    expect(() => parseExtensionCapture(JSON.stringify({
      id: 'bad-image',
      kind: 'image',
      title: 'Unsafe',
      payload: 'data:text/html;base64,AAAA',
    }))).toThrow(/image format/i);
  });
});

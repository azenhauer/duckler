import { describe, expect, it } from 'vitest';
import { appendToNote, isExternalDrop, readDrop } from './drop';

const transfer = (data: Record<string, string>, files: File[] = []) => ({ files: files as unknown as FileList, getData: (type: string) => data[type] ?? '' });

describe('dropped content', () => {
  it('reads a dragged link without repeating its address as text', () => {
    expect(readDrop(transfer({ 'text/uri-list': '# comment\r\nhttps://example.com/a', 'text/plain': 'https://example.com/a' }))).toEqual({ url: 'https://example.com/a', text: '' });
  });

  it('keeps selected text, and finds a link typed as text', () => {
    expect(readDrop(transfer({ 'text/plain': 'A quote worth keeping' }))).toEqual({ url: '', text: 'A quote worth keeping' });
    expect(readDrop(transfer({ 'text/plain': ' https://example.com ' }))?.url).toBe('https://example.com/');
  });

  it('refuses links that are not http(s)', () => {
    expect(readDrop(transfer({ 'text/uri-list': 'javascript:alert(1)' }))).toBeNull();
    expect(readDrop(transfer({ 'text/uri-list': 'file:///C:/secret.txt', 'text/plain': 'file:///C:/secret.txt' }))?.url).toBe('');
  });

  it('takes the first image or PDF file and ignores other files', () => {
    const image = new File(['x'], 'photo.png', { type: 'image/png' });
    const script = new File(['x'], 'run.exe', { type: 'application/octet-stream' });
    expect(readDrop(transfer({}, [script, image]))?.file).toBe(image);
    expect(readDrop(transfer({}, [script]))).toBeNull();
  });

  it("leaves Duckler's own drags to their targets", () => {
    expect(isExternalDrop(['application/x-duckler-card-id', 'text/plain'])).toBe(false);
    expect(isExternalDrop(['Files'])).toBe(true);
    expect(isExternalDrop(['text/html'])).toBe(false);
  });

  it('adds dropped text to a note on new lines, once', () => {
    expect(appendToNote('First', ['https://a.example', 'First'])).toBe('First\nhttps://a.example');
    expect(appendToNote('', ['Only'])).toBe('Only');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { exifTitle, inferImageTitle, pngTitle, titleFromFileName, xmpTitle } from './imageName';

const bytes = (...parts: (number[] | string | Uint8Array)[]) => {
  const chunks = parts.map(part => typeof part === 'string' ? new TextEncoder().encode(part) : part instanceof Uint8Array ? part : Uint8Array.from(part));
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
};
const u32 = (value: number) => [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255];
const pngChunk = (type: string, data: Uint8Array) => bytes(u32(data.length), type, data, [0, 0, 0, 0]);
const png = (...chunks: Uint8Array[]) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ...chunks, pngChunk('IEND', new Uint8Array()));

describe('image titles', () => {
  it('ignores automatic screenshot and camera names', () => {
    for (const name of ['Screenshot 2026-10-05 at 10.22.33.png', 'Screen Shot 2024-01-01.png', 'Captura de tela 2026-10-05 101010.png', 'IMG_1234.JPG', 'PXL_20260101_101010.jpg',
      'WhatsApp Image 2026-01-01 at 10.10.10.jpeg', '2026-10-05_10-22-33.png', 'a3f9c2e1b4d5f6a7.png', 'image.png', 'download.webp']) expect(titleFromFileName(name)).toBe('');
    expect(titleFromFileName('moodboard_lisbon-trip.final.png')).toBe('moodboard lisbon trip final');
    expect(titleFromFileName('Logo concept v2.png')).toBe('Logo concept v2');
  });

  it('reads PNG Title before Description, from tEXt and iTXt', () => {
    expect(pngTitle(png(pngChunk('tEXt', bytes('Description\0A long description')), pngChunk('tEXt', bytes('Title\0Harbour at dusk'))))).toBe('Harbour at dusk');
    expect(pngTitle(png(pngChunk('iTXt', bytes('Title\0', [0, 0], 'pt\0', 'Título\0', 'Ação rápida'))))).toBe('Ação rápida');
    expect(pngTitle(png(pngChunk('tEXt', bytes('Software\0Snipping Tool'))))).toBe('');
    expect(pngTitle(bytes('not a png'))).toBe('');
  });

  it('reads EXIF ImageDescription and XMP dc:title', () => {
    const description = 'Bridge study\0';
    // Little-endian TIFF with one IFD entry: ImageDescription (ASCII) stored at offset 26.
    const tiff = bytes([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0], [1, 0], [0x0e, 0x01, 2, 0, description.length, 0, 0, 0, 26, 0, 0, 0], [0, 0, 0, 0], description);
    const app1 = bytes('Exif\0\0', tiff);
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255], app1, [0xff, 0xd9]);
    expect(exifTitle(jpeg)).toBe('Bridge study');
    expect(xmpTitle(bytes('<x:xmpmeta><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Night &amp; fog</rdf:li></rdf:Alt></dc:title></x:xmpmeta>'))).toBe('Night & fog');
  });

  it('prefers metadata, then a meaningful file name, never an automatic one', async () => {
    const tagged = png(pngChunk('tEXt', bytes('Title\0Harbour at dusk')));
    expect(await inferImageTitle(new File([tagged], 'Screenshot 2026-10-05.png', { type: 'image/png' }))).toBe('Harbour at dusk');
    expect(await inferImageTitle(new File([png()], 'Screenshot 2026-10-05.png', { type: 'image/png' }))).toBe('');
    expect(await inferImageTitle(new File([png()], 'colour-study.png', { type: 'image/png' }))).toBe('colour study');
  });
});

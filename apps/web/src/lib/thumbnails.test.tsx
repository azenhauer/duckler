import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardRecord } from '@visual-library/shared';
import { imageFingerprint, useThumbnail } from './thumbnails';

const source = 'data:image/png;base64,' + 'A'.repeat(4000);
const card: CardRecord = { id: 'img-1', type: 'image', title: 'Shot', note: '', tags: [], createdAt: 'now', updatedAt: 'now', trashed: false, searchText: '', dataUrl: source };

afterEach(() => { vi.unstubAllGlobals(); });

function stubImageApis(width: number) {
  const close = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x']) })));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height: width / 2, close })));
  vi.stubGlobal('OffscreenCanvas', class { getContext() { return { drawImage: vi.fn() }; } async convertToBlob() { return new Blob(['small'], { type: 'image/webp' }); } });
  return { createImageBitmap: globalThis.createImageBitmap as ReturnType<typeof vi.fn> };
}

describe('grid thumbnails', () => {
  it('uses a saved thumbnail straight away, without decoding anything', () => {
    const { createImageBitmap } = stubImageApis(2000);
    const store = vi.fn();
    const saved = { ...card, thumb: { url: 'data:image/webp;base64,saved', of: imageFingerprint(source) } };
    const { result } = renderHook(() => useThumbnail(saved, source, store));
    expect(result.current).toBe('data:image/webp;base64,saved');
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('makes a thumbnail once for a large image and saves it on the card', async () => {
    stubImageApis(2000);
    const store = vi.fn();
    const { result } = renderHook(() => useThumbnail(card, source, store));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(store).toHaveBeenCalledWith('img-1', { url: expect.stringMatching(/^data:image\/webp;base64,/), of: imageFingerprint(source) }));
    await waitFor(() => expect(result.current).toMatch(/^data:image\/webp;base64,/));
  });

  it('remakes the thumbnail when the image changed', () => {
    stubImageApis(2000);
    const stale = { ...card, id: 'img-2', thumb: { url: 'data:image/webp;base64,old', of: 'something-else' } };
    const { result } = renderHook(() => useThumbnail(stale, source, vi.fn()));
    expect(result.current).toBeUndefined();
  });

  it('keeps the original for images that are already small', async () => {
    stubImageApis(500);
    const store = vi.fn();
    const { result } = renderHook(() => useThumbnail({ ...card, id: 'img-3' }, source, store));
    await waitFor(() => expect(store).toHaveBeenCalledWith('img-3', { url: '', of: imageFingerprint(source) }));
    await waitFor(() => expect(result.current).toBe(source));
  });
});

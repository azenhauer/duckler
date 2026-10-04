import { onRequestPost } from './index.js';

const createRequestContext = (formData) => ({
  request: {
    url: 'https://duckler.pages.dev/share-target/',
    formData: async () => formData,
  },
});

describe('Cloudflare Pages share-target function', () => {
  it('redirects a valid share to the app with a stable import ID', async () => {
    const form = new FormData();
    form.set('title', 'Article title');
    form.set('text', 'Useful notes');
    form.set('url', 'https://example.com/article');
    const response = await onRequestPost(createRequestContext(form));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('Location') ?? '');
    expect(location.pathname).toBe('/');
    expect(location.searchParams.get('sharedTitle')).toBe('Article title');
    expect(location.searchParams.get('sharedText')).toBe('Useful notes');
    expect(location.searchParams.get('sharedUrl')).toBe('https://example.com/article');
    expect(location.searchParams.get('sharedId')).toBeTruthy();
  });

  it('rejects non-HTTP share URLs', async () => {
    const form = new FormData();
    form.set('title', 'Unsafe');
    form.set('url', 'javascript:alert(1)');
    const response = await onRequestPost(createRequestContext(form));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('HTTP or HTTPS');
  });

  it('does not silently discard shared image files when the app worker is unavailable', async () => {
    const form = new FormData();
    form.set('title', 'Image');
    form.set('files', new File(['image'], 'image.png', { type: 'image/png' }));
    const response = await onRequestPost(createRequestContext(form));

    expect(response.status).toBe(415);
    expect(await response.text()).toContain('use Upload');
  });
});

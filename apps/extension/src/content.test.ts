import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const script = readFileSync(resolve('apps/extension/content.js'), 'utf8');
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.querySelectorAll(':scope > div').forEach(el => el.remove()); delete (window as unknown as Record<string, unknown>).__ducklerRegionPickerInstalled; });

async function capture(responseOverride?: Record<string, unknown>) {
  let listener: (message: unknown, sender: unknown, respond: (response: unknown) => void) => void = () => {};
  const roots: ShadowRoot[] = [];
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element) { const root = attach.call(this, { mode: 'open' }); roots.push(root); return root; });
  const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'prepare-region-review'
    ? responseOverride ?? { ok: true, capture: { kind: 'screenshot', title: 'Screenshot', sourceUrl: 'https://example.com', payload: 'data:image/png;base64,AAAA' } }
    : { ok: true });
  vi.stubGlobal('visualViewport', { scale: 1 });
  const chrome = { runtime: { sendMessage, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } };
  new Function('chrome', script)(chrome);
  listener({ type: 'start-region-capture' }, {}, () => {});
  const surface = roots[0].querySelector('.surface')!;
  Object.assign(surface, { setPointerCapture: vi.fn() });
  fireEvent(surface, new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
  fireEvent(surface, new MouseEvent('pointerup', { clientX: 100, clientY: 100 }));
  await waitFor(() => expect(roots.some(root => root.querySelector(responseOverride ? '[role="alert"]' : '[aria-label="Review screenshot"]'))).toBe(true));
  return { sendMessage, root: roots.find(root => root.querySelector('[aria-label="Review screenshot"]'))!, restart: () => {
    const respond = vi.fn(); listener({ type: 'start-region-capture' }, {}, respond); return respond;
  } };
}

it('reviews screenshots without queuing until Save, and includes the added note', async () => {
  const { sendMessage, root } = await capture();
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['prepare-region-review']);
  (root.querySelector('textarea') as HTMLTextAreaElement).value = 'A useful reference';
  fireEvent.click(root.querySelector('button')!);
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'queue-capture', capture: expect.objectContaining({ note: 'A useful reference', kind: 'screenshot' }) })));
});

it('discards a screenshot without delivering it', async () => {
  const { sendMessage, root } = await capture();
  fireEvent.click(root.querySelectorAll('button')[1]);
  expect(root.host.isConnected).toBe(false);
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['prepare-region-review']);
});

it('rejects a missing screenshot without leaving an invisible review blocking retries', async () => {
  const { sendMessage, restart } = await capture({ ok: true });
  expect(document.querySelector('[aria-label="Review screenshot"]')).toBeNull();
  const alerts = Array.from(document.documentElement.children).flatMap(el => Array.from(el.shadowRoot?.querySelectorAll('[role="alert"]') ?? []));
  expect(alerts[0].textContent).toContain('Reload Duckler Capture');
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['prepare-region-review']);
  expect(restart()).toHaveBeenCalledWith({ ok: true });
});

it('shows reload guidance when an older worker does not support screenshot review', async () => {
  const { sendMessage } = await capture({ ok: false, error: 'Unsupported capture request.' });
  const alerts = Array.from(document.documentElement.children).flatMap(el => Array.from(el.shadowRoot?.querySelectorAll('[role="alert"]') ?? []));
  expect(alerts[0].textContent).toContain('Reload Duckler Capture');
  expect(sendMessage).toHaveBeenCalledTimes(1);
});


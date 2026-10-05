import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const script = readFileSync(resolve('apps/extension/content.js'), 'utf8');
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.querySelectorAll(':scope > div').forEach(el => el.remove()); delete (window as unknown as Record<string, unknown>).__ducklerRegionPickerAlive; });

const shadowText = (selector: string) => Array.from(document.documentElement.children).flatMap(el => Array.from(el.shadowRoot?.querySelectorAll(selector) ?? [])).map(el => el.textContent ?? '');

function install(response: Record<string, unknown>, live = true) {
  let listener: (message: unknown, sender: unknown, respond: (response: unknown) => void) => void = () => {};
  const roots: ShadowRoot[] = [];
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element) { const root = attach.call(this, { mode: 'open' }); roots.push(root); return root; });
  const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'prepare-region-review' ? response : { ok: true });
  vi.stubGlobal('visualViewport', { scale: 1 });
  const chrome = { runtime: { id: live ? 'duckler-extension' : undefined, sendMessage, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } };
  new Function('chrome', script)(chrome);
  const start = () => { const respond = vi.fn(); listener({ type: 'start-region-capture' }, {}, respond); return respond; };
  const drag = () => {
    const surface = roots.at(-1)!.querySelector('.surface')!;
    Object.assign(surface, { setPointerCapture: vi.fn() });
    fireEvent(surface, new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    fireEvent(surface, new MouseEvent('pointerup', { clientX: 100, clientY: 100 }));
  };
  return { sendMessage, start, drag, listenerSet: () => listener };
}

it('hands the screenshot to the side panel: no on-page review, just a short note', async () => {
  const { sendMessage, start, drag } = install({ ok: true, inPanel: true });
  start(); drag();
  await waitFor(() => expect(shadowText('[role="status"]').join(' ')).toContain('Screenshot ready in the Duckler panel'));
  expect(shadowText('[aria-label="Review screenshot"]')).toHaveLength(0);
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['prepare-region-review']);
});

it('without a panel the screenshot is saved straight away, still without a pop-up', async () => {
  const { start, drag } = install({ ok: true, saved: true });
  start(); drag();
  await waitFor(() => expect(shadowText('[role="status"]').join(' ')).toContain('Screenshot saved to Duckler'));
  expect(shadowText('[aria-label="Review screenshot"]')).toHaveLength(0);
});

it('can start the next screenshot right after one finishes', async () => {
  const { start, drag } = install({ ok: true, inPanel: true });
  start(); drag();
  await waitFor(() => expect(shadowText('[role="status"]').join(' ')).toContain('Duckler panel'));
  expect(start()).toHaveBeenCalledWith({ ok: true });
});

it('shows reload guidance when an older worker does not support screenshots', async () => {
  const { sendMessage, start, drag } = install({ ok: false, error: 'Unsupported capture request.' });
  start(); drag();
  await waitFor(() => expect(shadowText('[role="alert"]').join(' ')).toContain('Reload Duckler Capture'));
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it('a live copy blocks a second install, but a copy orphaned by an extension reload does not', () => {
  install({ ok: true, inPanel: true });
  const again = install({ ok: true, inPanel: true });
  expect(again.listenerSet().toString()).toBe((() => {}).toString()); // live copy: second script returned early
  delete (window as unknown as Record<string, unknown>).__ducklerRegionPickerAlive;
  const dead = install({ ok: true, inPanel: true }, false); // its runtime is gone, like after a reload
  const fresh = install({ ok: true, inPanel: true });
  expect(dead.listenerSet().toString()).not.toBe((() => {}).toString());
  expect(fresh.listenerSet().toString()).not.toBe((() => {}).toString());
});

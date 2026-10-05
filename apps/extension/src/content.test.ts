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
  const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'crop-region' ? response : { ok: true });
  vi.stubGlobal('visualViewport', { scale: 1 });
  const chrome = { runtime: { id: live ? 'duckler-extension' : undefined, sendMessage, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } } };
  new Function('chrome', script)(chrome);
  // The panel's request stays open until the drag ends: `respond` receives the screenshot or the reason.
  const start = () => { const respond = vi.fn(); const open = listener({ type: 'start-region-capture' }, {}, respond); return Object.assign(respond, { open }); };
  const drag = (duringDrag?: () => void) => {
    const surface = roots.at(-1)!.querySelector('.surface')!;
    Object.assign(surface, { setPointerCapture: vi.fn() });
    fireEvent(surface, new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    duringDrag?.();
    fireEvent(surface, new MouseEvent('pointerup', { clientX: 100, clientY: 100 }));
  };
  return { sendMessage, start, drag, listenerSet: () => listener };
}

const capture = { kind: 'screenshot', title: 'Crop', payload: 'data:image/png;base64,AA==' };

it('answers the panel with the cropped screenshot when the drag ends', async () => {
  const { sendMessage, start, drag } = install({ ok: true, capture });
  const respond = start();
  expect(respond.open).toBe(true);
  expect(respond).not.toHaveBeenCalled();
  drag();
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, capture }));
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['crop-region']);
  expect(shadowText('.surface')).toHaveLength(0);
});

it('tells the panel and the page when the crop fails', async () => {
  const { start, drag } = install({ ok: false, error: 'The page moved or resized. Try the screenshot again.' });
  const respond = start(); drag();
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, error: 'The page moved or resized. Try the screenshot again.' }));
  expect(shadowText('[role="alert"]').join(' ')).toContain('moved or resized');
});

it('Escape cancels the picker and the panel hears about it', () => {
  const { sendMessage, start } = install({ ok: true, capture });
  const respond = start();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(respond).toHaveBeenCalledWith({ ok: false, cancelled: true });
  expect(shadowText('.surface')).toHaveLength(0);
  expect(sendMessage).not.toHaveBeenCalled();
});

it('keeps the picker alive when focus moves between the page and side panel', async () => {
  const { sendMessage, start, drag } = install({ ok: true, capture });
  const respond = start();
  window.dispatchEvent(new Event('blur'));
  drag();
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, capture }));
});

it('follows the panel resizing the page before the drag; the crop itself is checked after it', async () => {
  const { sendMessage, start, drag } = install({ ok: true, capture });
  const respond = start();
  window.dispatchEvent(new Event('resize'));
  expect(shadowText('.surface')).toHaveLength(1);
  // A resize event mid-drag does not cancel: the viewport at pointerdown is compared before cropping.
  drag(() => window.dispatchEvent(new Event('resize')));
  await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true, capture }));
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it('refuses the crop if the viewport really changed during the drag', async () => {
  const { sendMessage, start, drag } = install({ ok: true, capture });
  const respond = start();
  const width = innerWidth;
  try {
    drag(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width - 300 }); });
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: false, error: 'The page changed. Start the screenshot again.' }));
    expect(sendMessage).not.toHaveBeenCalled();
  } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); }
});

it('can start the next screenshot right after one finishes', async () => {
  const { start, drag } = install({ ok: true, capture });
  const first = start(); drag();
  await waitFor(() => expect(first).toHaveBeenCalled());
  expect(start().open).toBe(true);
  expect(shadowText('.surface')).toHaveLength(1);
});

it('shows reload guidance when an older worker does not support screenshots', async () => {
  const { sendMessage, start, drag } = install({ ok: false, error: 'Unsupported capture request.' });
  start(); drag();
  await waitFor(() => expect(shadowText('[role="alert"]').join(' ')).toContain('Reload Duckler Capture'));
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it('a live copy blocks a second install, but a copy orphaned by an extension reload does not', () => {
  install({ ok: true, capture });
  const again = install({ ok: true, capture });
  expect(again.listenerSet().toString()).toBe((() => {}).toString()); // live copy: second script returned early
  delete (window as unknown as Record<string, unknown>).__ducklerRegionPickerAlive;
  const dead = install({ ok: true, capture }, false); // its runtime is gone, like after a reload
  const fresh = install({ ok: true, capture });
  expect(dead.listenerSet().toString()).not.toBe((() => {}).toString());
  expect(fresh.listenerSet().toString()).not.toBe((() => {}).toString());
});

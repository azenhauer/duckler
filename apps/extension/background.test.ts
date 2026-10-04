// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type ListenerEvent = {
  addListener: (listener: (...args: unknown[]) => unknown) => void;
  listener?: (...args: unknown[]) => unknown;
};

const makeEvent = (): ListenerEvent => ({
  addListener(listener) {
    this.listener = listener;
  },
});

const workerSource = readFileSync(join(process.cwd(), 'apps/extension/background.js'), 'utf8');

const createWorkerHarness = (initialValues: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = { ...initialValues };
  const createdTabs: Array<{ url: string }> = [];
  const storageSet = vi.fn(async (next: Record<string, unknown>) => Object.assign(values, next));
  const queueEvents = {
    onMessage: makeEvent(),
    onInstalled: makeEvent(),
    onStartup: makeEvent(),
  };
  const contextMenuEvents = { onClicked: makeEvent() };
  const commandEvents = { onCommand: makeEvent() };
  const activeTab = { id: 7, windowId: 2, url: 'https://example.com/page' };
  const chrome = {
    storage: {
      local: {
        async get(key: string) {
          return Object.hasOwn(values, key) ? { [key]: values[key] } : {};
        },
        set: storageSet,
      },
    },
    runtime: queueEvents,
    commands: commandEvents,
    contextMenus: {
      ...contextMenuEvents,
      removeAll(callback: () => void) { callback(); },
      create: vi.fn(),
    },
    tabs: {
      async query() { return [activeTab]; },
      async create(tab: { url: string }) { createdTabs.push(tab); },
      async captureVisibleTab() { return 'data:image/png;base64,AAAA'; },
    },
  };

  new Function(
    'chrome',
    'crypto',
    'URL',
    'console',
    'Date',
    'Number',
    'Array',
    'Error',
    workerSource,
  )(chrome, { randomUUID: () => 'capture-id' }, URL, console, Date, Number, Array, Error);

  const send = (message: unknown, sender: unknown = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const listener = queueEvents.onMessage.listener;
      if (!listener) throw new Error('Background message handler was not registered.');
      listener(message, sender, resolve);
    });

  return { values, createdTabs, storageSet, chrome, send };
};

describe('Duckler extension background worker', () => {
  it('persists validated captures and reopens them in Duckler with a stable capture ID', async () => {
    const harness = createWorkerHarness();
    const saved = await harness.send({
      type: 'queue-capture',
      capture: {
        kind: 'bookmark',
        title: 'Example page',
        sourceUrl: 'https://example.com/page',
        note: 'Keep this',
        tags: ['favorite'],
        collectionName: 'Research',
      },
    });

    expect(saved).toMatchObject({ ok: true, item: { id: 'capture-id', status: 'queued' } });
    expect(harness.storageSet).toHaveBeenCalledOnce();
    const item = (saved.item as { id: string });

    const delivered = await harness.send({ type: 'deliver-capture', id: item.id });
    expect(delivered.ok).toBe(true);
    expect(harness.createdTabs).toHaveLength(1);
    const target = new URL(harness.createdTabs[0].url);
    expect(target.origin).toBe('http://localhost:5176');
    expect(JSON.parse(target.searchParams.get('ducklerCapture') ?? '{}')).toMatchObject({
      id: 'capture-id',
      tags: ['favorite'],
      collectionName: 'Research',
    });

    const listed = await harness.send({ type: 'list-captures' });
    expect(listed.items).toHaveLength(1);

    const restartedWorker = createWorkerHarness(harness.values);
    const afterRestart = await restartedWorker.send({ type: 'list-captures' });
    expect(afterRestart.items).toMatchObject([{ id: 'capture-id', title: 'Example page' }]);
  });

  it('rejects invalid source URLs and image payloads without writing to storage', async () => {
    const harness = createWorkerHarness();
    const invalidUrl = await harness.send({
      type: 'queue-capture',
      capture: { kind: 'bookmark', title: 'Bad URL', sourceUrl: 'javascript:alert(1)' },
    });
    const invalidImage = await harness.send({
      type: 'queue-capture',
      capture: { kind: 'image', title: 'Bad image', payload: 'data:text/html;base64,AAAA' },
    });

    expect(invalidUrl).toMatchObject({ ok: false, error: expect.stringMatching(/HTTP\(S\)/) });
    expect(invalidImage).toMatchObject({ ok: false, error: expect.stringMatching(/image capture/i) });
    expect(harness.storageSet).not.toHaveBeenCalled();
  });

  it('surfaces storage quota failures instead of reporting a queued success', async () => {
    const harness = createWorkerHarness();
    harness.storageSet.mockRejectedValueOnce(new Error('Quota exceeded'));

    const result = await harness.send({
      type: 'queue-capture',
      capture: { kind: 'text', title: 'Note', note: 'Test' },
    });

    expect(result).toMatchObject({ ok: false, error: 'Quota exceeded' });
  });
});

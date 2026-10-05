// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queue = vi.hoisted(() => ({
  count: vi.fn(async () => 0),
  enqueue: vi.fn(async (capture: Record<string, unknown>) => capture),
  pairing: vi.fn(async () => undefined),
}));
vi.mock('./queue', () => ({
  CaptureQueue: class {
    captures = { count: queue.count };
    enqueue = queue.enqueue;
    pairing = queue.pairing;
  },
}));

function event<T extends (...args: never[]) => unknown>() {
  const listeners: T[] = [];
  return {
    addListener: vi.fn((listener: T) => { listeners.push(listener); }),
    emit: (...args: Parameters<T>) => listeners.map(listener => listener(...args)),
  };
}
type Message = Record<string, unknown>;
type Reply = { ok: boolean; error?: string; capture?: Record<string, unknown> };
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const popupUrl = `chrome-extension://${extensionId}/popup.html`;
const websiteUrl = 'https://example.com/article';
const tab = { id: 1, windowId: 7, active: true, url: websiteUrl, title: 'Example article' } as chrome.tabs.Tab;
const panelSender = { id: extensionId, url: popupUrl };
const websiteSender = { id: extensionId, url: websiteUrl, tab, frameId: 0, documentId: 'website-document' };
const region = {
  type: 'crop-region', url: websiteUrl,
  rect: { left: 10, top: 10, right: 110, bottom: 90 },
  viewport: { width: 800, height: 600 },
};

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

async function boot() {
  const platform = {
    runtime: {
      id: extensionId, getURL: (path: string) => `chrome-extension://${extensionId}/${path}`,
      onConnect: event<(port: chrome.runtime.Port) => void>(),
      onConnectExternal: event<(port: chrome.runtime.Port) => void>(),
      onMessage: event<(message: Message, sender: chrome.runtime.MessageSender, respond: (reply: Reply) => void) => boolean>(),
      onInstalled: event<() => void>(), onStartup: event<() => void>(),
    },
    sidePanel: { setPanelBehavior: vi.fn(async () => {}), open: vi.fn(async (_options: { windowId: number }) => {}) },
    action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
    storage: { local: { get: vi.fn(async () => ({})), remove: vi.fn(async () => {}) }, session: { set: vi.fn(async (_value: Record<string, unknown>) => {}) } },
    tabs: {
      query: vi.fn(async () => [{ ...tab }]), get: vi.fn(async () => ({ ...tab })),
      sendMessage: vi.fn(async (_tabId: number, _message: Message) => ({ ok: true })),
      captureVisibleTab: vi.fn(async (_windowId: number, _options: { format: string }) => 'data:image/png;base64,AA=='),
    },
    windows: { get: vi.fn(async () => ({ id: 7, focused: true })) },
    scripting: { executeScript: vi.fn(async () => []) },
    commands: { onCommand: event<(command: string, tab: chrome.tabs.Tab) => void>() },
    contextMenus: { onClicked: event<(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void>() },
  };
  vi.stubGlobal('chrome', platform);
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['image']) })));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { drawImage: vi.fn() }; }
    async convertToBlob() { return new Blob(['cropped-image']); }
  });
  await import('./background');
  await flush();
  const send = (message: Message, sender: chrome.runtime.MessageSender = websiteSender) =>
    new Promise<Reply>(resolve => { platform.runtime.onMessage.emit(message, sender, resolve); });
  const connectPanel = (windowId = 7) => {
    const port = {
      name: 'duckler-panel', sender: panelSender,
      onMessage: event<(message: Message) => void>(), onDisconnect: event<() => void>(),
      postMessage: vi.fn((_message: Message) => {}), disconnect: vi.fn(),
    };
    platform.runtime.onConnect.emit(port as unknown as chrome.runtime.Port);
    port.onMessage.emit({ type: 'hello', windowId });
    return port;
  };
  return { platform, send, connectPanel };
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('screenshot worker', () => {
  it('crops the region and hands it back to the picker without queueing it', async () => {
    const { platform, send } = await boot();
    const reply = await send(region);
    expect(reply).toMatchObject({ ok: true, capture: { kind: 'screenshot', sourceUrl: websiteUrl, payload: expect.stringMatching(/^data:image\/png;base64,/) } });
    expect(platform.tabs.captureVisibleTab).toHaveBeenCalledWith(7, { format: 'png' });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('refuses to crop when the page moved between the drag and the capture', async () => {
    const { platform, send } = await boot();
    platform.tabs.sendMessage.mockResolvedValueOnce({ ok: false });
    await expect(send(region)).resolves.toMatchObject({ ok: false, error: expect.stringContaining('moved') });
    expect(platform.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('refuses crop requests that do not come from a page', async () => {
    const { send } = await boot();
    await expect(send(region, panelSender)).resolves.toMatchObject({ ok: false });
  });

  it('asks an open panel to start the screenshot', async () => {
    const { platform, connectPanel } = await boot();
    const panel = connectPanel();
    platform.commands.onCommand.emit('capture-visible-area', tab);
    expect(panel.postMessage).toHaveBeenCalledWith({ type: 'start-shot' });
    expect(platform.sidePanel.open).not.toHaveBeenCalled();
  });

  it('opens a closed panel from the shortcut and leaves the screenshot request for it', async () => {
    const { platform } = await boot();
    platform.commands.onCommand.emit('capture-visible-area', tab);
    expect(platform.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(platform.storage.session.set).toHaveBeenCalledWith({ 'duckler-start-shot': { windowId: 7, at: expect.any(Number) } });
    expect(platform.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('closes an open panel with the panel shortcut, and opens it otherwise', async () => {
    const { platform, connectPanel } = await boot();
    platform.commands.onCommand.emit('toggle-capture-panel', tab);
    expect(platform.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    const panel = connectPanel();
    platform.commands.onCommand.emit('toggle-capture-panel', tab);
    expect(panel.postMessage).toHaveBeenCalledWith({ type: 'close' });
  });
});

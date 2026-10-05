import { CAPTURE_PORT, MAX_QUEUE_BYTES, bytesToBase64, cropBounds, parsePairing } from '../../../packages/shared/src/captureProtocol';
import { CaptureQueue } from './queue';
import { bridgeRequest, validateSender } from './bridge';
import { isAllowedLibraryOrigin } from './origin';
import { isSettingsSender } from './settingsSender';
import { screenshotTitle, selectionTitle, type RegionHint } from './naming';
import { fetchPdf } from './pdf';

const queue = new CaptureQueue();
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
const trustedPorts = new Set<chrome.runtime.Port>();
// The side panel connects once it opens, so the shortcuts can reach it (close it, or start a screenshot).
const panelPorts = new Map<number, chrome.runtime.Port>();
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'duckler-panel' || port.sender?.url !== chrome.runtime.getURL('popup.html')) return;
  let windowId: number | undefined;
  port.onMessage.addListener(message => {
    if (message?.type === 'hello' && Number.isInteger(message.windowId)) { windowId = message.windowId; panelPorts.set(message.windowId, port); }
  });
  port.onDisconnect.addListener(() => { if (windowId !== undefined && panelPorts.get(windowId) === port) panelPorts.delete(windowId); });
});
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Capture could not be saved.';
const badge = async (error = false) => {
  const count = await queue.captures.count();
  await chrome.action.setBadgeText({ text: error ? '!' : count ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: error ? '#bd4939' : '#62735d' });
};
const notify = async () => {
  await badge();
  for (const port of trustedPorts) {
    try { port.postMessage({ type: 'queue-changed' }); } catch { trustedPorts.delete(port); }
  }
};
const ready = (async () => {
  // Preserve older installations, including screenshots, before removing the old storage entry.
  const legacy = await chrome.storage.local.get('duckler-capture-queue');
  for (const item of legacy['duckler-capture-queue'] ?? []) await queue.enqueue(item);
  await chrome.storage.local.remove('duckler-capture-queue');
  await badge();
})();

const save = async (capture: Record<string, unknown>) => {
  await ready;
  const item = await queue.enqueue({ ...capture, id: capture.id ?? crypto.randomUUID(), createdAt: capture.createdAt ?? new Date().toISOString() });
  await notify();
  return item;
};
const openLibrary = async (background = false) => {
  if (background && trustedPorts.size) { await notify(); return; }
  const pairing = await queue.pairing();
  if (background && !pairing) throw new Error('Connect your library before sending captures.');
  const url = pairing?.origin ?? (await chrome.storage.local.get('duckler-app-url'))['duckler-app-url'] ?? 'https://duckler.pages.dev';
  const target = new URL(url);
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Invalid library address.');
  const [existing] = (await chrome.tabs.query({})).filter(tab => {
    try { return tab.url && new URL(tab.url).origin === target.origin; } catch { return false; }
  });
  if (existing?.id) {
    if (background) return;
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url: target.href, active: !background });
};

const hostOf = (url?: string) => { try { return url ? new URL(url).hostname : ''; } catch { return ''; } };

// The region picker asks for this once the drag ends; the crop goes back to the panel that started it.
async function captureRegion(sender: chrome.runtime.MessageSender, request: Record<string, unknown>) {
  const tabId = sender.tab?.id, windowId = sender.tab?.windowId;
  if (!Number.isInteger(tabId) || !Number.isInteger(windowId) || sender.frameId !== 0 || !sender.documentId) throw new Error('Start a screenshot from a regular website.');
  const expected = request.viewport as { width: number; height: number };
  const rect = request.rect as { left: number; top: number; right: number; bottom: number };
  const check = async () => {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    const focused = await chrome.windows.get(windowId!);
    if (active?.id !== tabId || active.url !== request.url || !focused.focused) throw new Error('The active page changed. Try the screenshot again.');
    const result = await chrome.tabs.sendMessage(tabId!, { type: 'check-capture-viewport', viewport: expected, url: request.url }, { documentId: sender.documentId });
    if (!result?.ok) throw new Error('The page moved or resized. Try the screenshot again.');
  };
  await check();
  const screenshot = await chrome.tabs.captureVisibleTab(windowId!, { format: 'png' });
  await check();
  const bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
  try {
    const bounds = cropBounds(rect, expected, { width: bitmap.width, height: bitmap.height });
    const canvas = new OffscreenCanvas(bounds.width, bounds.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not crop this screenshot.');
    ctx.drawImage(bitmap, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return { kind: 'screenshot', title: screenshotTitle(request.hint as RegionHint | undefined, sender.tab?.title), sourceUrl: request.url, payload: `data:image/png;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}` };
  } finally { bitmap.close(); }
}

const menus = () => chrome.contextMenus.removeAll(() => {
  for (const [id, title, contexts] of [
    ['page', 'Save page to Duckler', ['page']], ['link', 'Save link to Duckler', ['link']],
    ['selection', 'Save text to Duckler', ['selection']], ['image', 'Save image to Duckler', ['image']],
  ] as const) chrome.contextMenus.create({ id: `duckler-save-${id}`, title, contexts: [...contexts] });
});
chrome.runtime.onInstalled.addListener(menus);
chrome.runtime.onStartup.addListener(menus);

async function feedback(tabId: number, text: string, error = false) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'capture-feedback', text, error });
  } catch { await badge(error); }
}
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-capture-panel' && tab?.windowId !== undefined) {
    const port = panelPorts.get(tab.windowId);
    if (port) { try { port.postMessage({ type: 'close' }); } catch { panelPorts.delete(tab.windowId); } }
    else void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => badge(true));
    return;
  }
  if (command !== 'capture-visible-area' || tab?.windowId === undefined) return;
  // Screenshots are taken and reviewed by the side panel. An open panel starts one now; a panel this key
  // press opens (the user gesture Chrome requires) finds the request when it loads.
  const port = panelPorts.get(tab.windowId);
  if (port) { try { port.postMessage({ type: 'start-shot' }); return; } catch { panelPorts.delete(tab.windowId); } }
  void chrome.storage.session.set({ 'duckler-start-shot': { windowId: tab.windowId, at: Date.now() } });
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => badge(true));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void (async () => {
    let capture: Record<string, unknown>;
    if (info.menuItemId === 'duckler-save-image') {
      // activeTab permits same-origin image reads; cross-origin images get an explicit screenshot fallback.
      const imageUrl = new URL(info.srcUrl!);
      if (imageUrl.origin !== new URL(tab.url!).origin) throw new Error('This image needs access to another website. Use Capture region or upload it to Duckler.');
      const response = await fetch(imageUrl.href, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
      const blob = await response.blob();
      if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 10 * 1024 * 1024) throw new Error('Could not read this image. Use Capture region instead.');
      capture = { kind: 'image', title: screenshotTitle({ pageTitle: tab.title, host: hostOf(info.pageUrl) }) || 'Saved image', sourceUrl: info.pageUrl, payload: `data:${blob.type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}` };
    } else if (info.menuItemId === 'duckler-save-link') {
      capture = { kind: 'bookmark', title: info.linkUrl, sourceUrl: info.linkUrl };
    } else {
      capture = { kind: info.selectionText ? 'text' : 'bookmark', title: info.selectionText ? selectionTitle(info.selectionText) : tab.title || info.pageUrl,
        note: info.selectionText || '', sourceUrl: info.pageUrl || tab.url };
    }
    await save(capture);
    await feedback(tab.id!, 'Saved on this device · ready for your library');
  })().catch(error => feedback(tab.id!, errorMessage(error), true));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const respond = async () => {
    await ready;
    switch (message?.type) {
      case 'capture-pdf': {
        if (sender.url !== chrome.runtime.getURL('popup.html')) throw new Error('Save PDFs from the extension popup.');
        const tab = await chrome.tabs.get(message.tabId);
        if (!tab.url || !tab.active) throw new Error('Open the PDF’s website and try again.');
        const payload = await fetchPdf(String(message.url), tab.url);
        return { item: await save({ ...message.capture, kind: 'pdf', sourceUrl: message.url, payload }) };
      }
      case 'queue-capture': return { item: await save(message.capture) };
      case 'list-captures': {
        const rows = await queue.captures.orderBy('createdAt').reverse().toArray();
        return { items: rows.map(row => ({ ...JSON.parse(new TextDecoder().decode(row.bytes)), byteLength: row.byteLength })), budget: MAX_QUEUE_BYTES };
      }
      case 'delete-capture': await queue.captures.delete(message.id); await notify(); return {};
      case 'deliver-capture': await openLibrary(true); return {};
      case 'open-library': await openLibrary(); return {};
      case 'crop-region': return { capture: await captureRegion(sender, message) };
      case 'suggest-title': return { title: screenshotTitle(message.hint as RegionHint | undefined, typeof message.fallback === 'string' ? message.fallback : '') };
      case 'pair-library': {
        if (!isSettingsSender(sender, chrome.runtime.id, chrome.runtime.getURL('options.html'))) throw new Error('Confirm the connection in extension settings.');
        const pairing = parsePairing(message.pairing);
        const allowed = chrome.runtime.getManifest().externally_connectable?.matches ?? [];
        if (!isAllowedLibraryOrigin(pairing.origin, allowed)) throw new Error('This extension build does not support that library address.');
        await queue.pair(pairing);
        return { extensionId: chrome.runtime.id, pairing };
      }
      case 'pairing-status': return { pairing: await queue.pairing(), extensionId: chrome.runtime.id };
      case 'list-collections': {
        const pairing = await queue.pairing();
        return { collections: pairing ? await queue.readCollectionMetadata(pairing.libraryId) : [] };
      }
      default: throw new Error('Unsupported capture request.');
    }
  };
  void respond().then(result => sendResponse({ ok: true, ...result }), error => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.runtime.onConnectExternal.addListener(port => {
  if (port.name !== CAPTURE_PORT || !port.sender) { port.disconnect(); return; }
  let authenticated = false;
  let chain = Promise.resolve();
  port.onDisconnect.addListener(() => trustedPorts.delete(port));
  port.onMessage.addListener(message => {
    chain = chain.then(async () => {
      try {
        await ready;
        const result = await bridgeRequest(queue, port.sender!, message, authenticated);
        if (message.type === 'hello') { authenticated = true; trustedPorts.add(port); }
        port.postMessage({ requestId: message.requestId, ok: true, ...result });
        if (message.type === 'ack') await badge();
      } catch (error) {
        try { port.postMessage({ requestId: message.requestId, ok: false, error: errorMessage(error) }); } catch { /* disconnected; queue survives */ }
        if (!authenticated) port.disconnect();
      }
    });
  });
  // Reject hostile connections before any metadata is exposed.
  void queue.pairing().then(pairing => validateSender(port.sender!, pairing)).catch(() => port.disconnect());
});

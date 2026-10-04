const QUEUE_KEY = 'duckler-capture-queue';
const APP_URL_KEY = 'duckler-app-url';
const MAX_QUEUE_ITEMS = 100;
const MAX_PAYLOAD_LENGTH = 1_500_000;
const MAX_TITLE_LENGTH = 1000;

const readQueue = async () => {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(result[QUEUE_KEY]) ? result[QUEUE_KEY] : [];
};

const captureSchema = (capture) => {
  if (!capture || typeof capture !== 'object') throw new Error('Capture data is missing.');
  const kind = ['bookmark', 'text', 'image', 'screenshot'].includes(capture.kind) ? capture.kind : null;
  const title = typeof capture.title === 'string' ? capture.title.trim().slice(0, MAX_TITLE_LENGTH) : '';
  const sourceUrl = typeof capture.sourceUrl === 'string' ? capture.sourceUrl : '';
  const note = typeof capture.note === 'string' ? capture.note.slice(0, 100_000) : '';
  const payload = typeof capture.payload === 'string' ? capture.payload : '';
  const tags = Array.isArray(capture.tags)
    ? capture.tags.filter((tag) => typeof tag === 'string').slice(0, 100).map((tag) => tag.slice(0, 100))
    : [];
  const collectionName = typeof capture.collectionName === 'string' ? capture.collectionName.trim().slice(0, 120) : '';
  if (!kind || !title) throw new Error('Capture type and title are required.');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('Only HTTP(S) source URLs can be captured.');
  if (sourceUrl.length > 8192) throw new Error('Source URL is too long to capture.');
  if (payload.length > MAX_PAYLOAD_LENGTH) throw new Error('Capture is too large. Try a smaller screenshot.');
  if ((kind === 'image' || kind === 'screenshot') && payload && !/^data:image\/(png|jpeg|webp);base64,/i.test(payload)) {
    throw new Error('Image capture must be PNG, JPEG, or WebP data.');
  }
  if ((kind === 'image' || kind === 'screenshot') && !payload) throw new Error('Image capture has no image data.');
  return { kind, title, sourceUrl, note, payload, tags, collectionName };
};

const queueCapture = async (input) => {
  const capture = captureSchema(input);
  const queue = await readQueue();
  if (queue.length >= MAX_QUEUE_ITEMS) throw new Error('Capture queue is full. Send or remove some items first.');
  const item = {
    id: crypto.randomUUID(),
    ...capture,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [QUEUE_KEY]: [item, ...queue] });
  return item;
};

const getAppUrl = async () => {
  const result = await chrome.storage.local.get(APP_URL_KEY);
  const url = new URL(result[APP_URL_KEY] || 'http://localhost:5176/');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('App URL must use HTTP or HTTPS.');
  return url;
};

const deliverCapture = async (itemId) => {
  const queue = await readQueue();
  const item = queue.find((capture) => capture.id === itemId);
  if (!item) throw new Error('This capture is no longer in the queue.');
  const url = await getAppUrl();
  url.searchParams.set('ducklerCapture', JSON.stringify(item));
  if (url.href.length > 1_800_000) throw new Error('Capture link is too large. Reduce the screenshot size before sending.');
  await chrome.tabs.create({ url: url.href });
};

const captureVisibleTab = async (sender, request) => {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  if (!Number.isInteger(tabId) || !Number.isInteger(windowId)) throw new Error('Capture must start from an active browser tab.');
  const [activeTab] = await chrome.tabs.query({ active: true, windowId });
  if (activeTab?.id !== tabId || (request.url && activeTab.url !== request.url)) {
    throw new Error('The active tab or page changed. Start the screenshot capture again.');
  }
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const [stillActive] = await chrome.tabs.query({ active: true, windowId });
  if (stillActive?.id !== tabId || (request.url && stillActive.url !== request.url)) {
    throw new Error('The active tab or page changed before the screenshot completed.');
  }
  return { screenshot, viewport: request.viewport };
};

const setContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'duckler-save-page', title: 'Save page to Duckler', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'duckler-save-link', title: 'Save link to Duckler', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'duckler-save-selection', title: 'Save selection to Duckler', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'duckler-save-image-link', title: 'Save image link to Duckler', contexts: ['image'] });
  });
};

chrome.runtime.onInstalled.addListener(setContextMenus);
chrome.runtime.onStartup.addListener(setContextMenus);

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'capture-visible-area' || !tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'start-region-capture' });
  } catch (error) {
    console.warn('Duckler region capture is not available on this page.', error);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    let item;
    if (info.menuItemId === 'duckler-save-link') {
      item = await queueCapture({ kind: 'bookmark', title: info.linkUrl, sourceUrl: info.linkUrl });
    } else if (info.menuItemId === 'duckler-save-image-link') {
      item = await queueCapture({ kind: 'bookmark', title: info.srcUrl, sourceUrl: info.srcUrl, note: 'Image link captured from the context menu.' });
    } else {
      const [page] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ title: document.title, url: location.href }),
      });
      const selection = info.menuItemId === 'duckler-save-selection' ? info.selectionText : '';
      item = await queueCapture({
        kind: selection ? 'text' : 'bookmark',
        title: selection ? selection.slice(0, MAX_TITLE_LENGTH) : (page.result?.title || page.result?.url),
        sourceUrl: page.result?.url,
        note: selection,
      });
    }
    await deliverCapture(item.id);
  } catch (error) {
    console.warn('Duckler could not save this context-menu capture.', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  const respond = async () => {
    if (message.type === 'queue-capture') {
      return { item: await queueCapture(message.capture) };
    }
    if (message.type === 'list-captures') {
      return { items: await readQueue() };
    }
    if (message.type === 'delete-capture') {
      const queue = await readQueue();
      await chrome.storage.local.set({ [QUEUE_KEY]: queue.filter((item) => item.id !== message.id) });
      return { ok: true };
    }
    if (message.type === 'deliver-capture') {
      await deliverCapture(message.id);
      return { ok: true };
    }
    if (message.type === 'capture-visible-tab') {
      return await captureVisibleTab(sender, message);
    }
    throw new Error('Unsupported Duckler extension request.');
  };

  void respond().then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Capture request failed.' }),
  );
  return true;
});

import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Unlike extension-smoke.mjs, this test interacts with a SIDE_PANEL context.
// Chromium does not expose that context in Playwright's context.pages(), so
// attach to its real CDP target. Do not load popup.html in a browser tab.
const temporary = fileURLToPath(new URL('../.tmp/', import.meta.url));
const builtExtension = fileURLToPath(new URL('../apps/extension/dist/development/', import.meta.url));
await mkdir(temporary, { recursive: true });
const fixtureHtml = `<!doctype html><html><head><title>Native capture fixture | Duckler tests</title>
<meta property="og:title" content="Native capture fixture"><meta property="og:site_name" content="Duckler tests">
<meta name="description" content=""><meta name="description" content="An actual native panel captures this page.">
<meta name="keywords" content="capture, browser"></head><body style="margin:0;padding:40px;background:#ffeacd;min-height:1800px">
<h1>Native capture fixture</h1><p id="highlight">A selected passage reaches the native panel.</p>
<div style="width:200px;height:120px;background:#3478ab">Screenshot fixture</div></body></html>`;
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(fixtureHtml);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/fixture`;

async function attachNativePanel(context, website, worker, options) {
  await website.bringToFront();
  // Playwright evaluates this extension-page gesture with userGesture=true.
  // This opens native browser UI, not a synthetic popup page.
  await options.evaluate(async () => chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id }));
  await expect.poll(() => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length)).toBe(1);
  const cdp = await context.newCDPSession(website);
  let target;
  await expect.poll(async () => {
    target = (await cdp.send('Target.getTargets')).targetInfos.find(item => item.url === `chrome-extension://${new URL(worker.url()).host}/popup.html`);
    return Boolean(target);
  }).toBe(true);
  assert.ok(!context.pages().some(page => page.url() === target.url), 'The capture UI must not be a tab masquerading as a panel.');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native panel CDP timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      clearTimeout(timer); pending.delete(id); reject(error);
    });
  });
  const evaluate = async (fn, value) => {
    const result = await send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(value) ?? 'undefined'})`, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const click = async selector => {
    const point = await evaluate(selector => {
      const element = document.querySelector(selector);
      if (!element || element.disabled) throw new Error(`Cannot click ${selector}`);
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const state = () => evaluate(() => ({
    title: document.querySelector('#capture-title').value,
    note: document.querySelector('#note-text').value,
    status: document.querySelector('#status').textContent,
    pageTitle: document.querySelector('#page-title').textContent,
    shotDisabled: document.querySelector('#mode-shot').disabled,
    shotVisible: !document.querySelector('#shot-preview').hidden,
    shotSource: document.querySelector('#shot-preview').getAttribute('src'),
    saveDisabled: document.querySelector('#save-page').disabled,
  }));
  await expect.poll(async () => (await state()).pageTitle).not.toBe('Loading page…');
  return { evaluate, click, state, send, cdp };
}

async function run() {
  // The shipping manifest, unmodified: website access is granted at install, like Obsidian Web Clipper.
  const extension = await mkdtemp(join(temporary, 'extension-native-build-'));
  const profile = await mkdtemp(join(temporary, 'extension-native-profile-'));
  await cp(builtExtension, extension, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    // viewport: null keeps the real window size; an emulated viewport would not match captureVisibleTab.
    channel: 'chromium', headless: true, viewport: null,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    const website = await context.newPage();
    await website.goto(fixtureUrl);
    const panel = await attachNativePanel(context, website, worker, options);
    const queue = () => options.evaluate(() => chrome.runtime.sendMessage({ type: 'list-captures' }));
    await expect.poll(async () => (await panel.state()).title).toBe('Native capture fixture · Duckler tests');
    await expect.poll(async () => (await panel.state()).note).toBe('An actual native panel captures this page.');
    await website.evaluate(() => {
      const paragraph = document.querySelector('#highlight');
      const range = document.createRange(); range.selectNodeContents(paragraph);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      paragraph.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await expect.poll(async () => (await panel.state()).note).toBe('A selected passage reaches the native panel.');
    console.log('PASS: metadata and live highlights reach the actual native panel.');

    // CDP input to a headless side panel occasionally drops the first click; real input, retried.
    await expect.poll(async () => {
      if (!(await panel.state()).status.includes('Drag over the page')) await panel.click('#mode-shot');
      return (await panel.state()).status;
    }, { intervals: [400] }).toContain('Drag over the page');
    // Wait for the picker itself (a full-page host element) before dragging.
    await expect.poll(() => website.evaluate(() => [...document.documentElement.children].some(element => element.style.zIndex === '2147483647' && element.style.inset === '0px'))).toBe(true);
    // The panel has reduced and animated the webpage's viewport. Use real input
    // immediately after start; no synthetic blur or injected screenshot result.
    // Headless Chromium applies the panel's width to the page lazily (on the first input); settle it first.
    await website.mouse.move(5, 5);
    let width;
    await expect.poll(async () => { const previous = width; width = await website.evaluate(() => innerWidth); return width === previous; }, { intervals: [300] }).toBe(true);
    await website.mouse.move(40, 50); await website.mouse.down();
    await website.mouse.move(260, 160, { steps: 8 }); await website.mouse.up();
    try {
      await expect.poll(async () => (await panel.state()).shotVisible, { timeout: 15000, message: 'The native panel must receive the dragged screenshot.' }).toBe(true);
    } catch (error) {
      // Capture closed-shadow picker feedback too: it is deliberately invisible
      // to page selectors, but available to the browser's DOM debugging API.
      const document = await panel.cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      const texts = [];
      const visit = node => {
        if (node.nodeType === 3 && node.nodeValue?.trim()) texts.push(node.nodeValue);
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) visit(child);
      };
      visit(document.root);
      console.error('Panel diagnostics:', await panel.state());
      console.error('Webpage diagnostics:', texts.join(' | '));
      console.error('Viewport vs captured image:', await website.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })),
        await worker.evaluate(async () => { const bitmap = await createImageBitmap(await (await fetch(await chrome.tabs.captureVisibleTab({ format: 'png' }))).blob()); return { width: bitmap.width, height: bitmap.height }; }));
      throw error;
    }
    const screenshot = await panel.state();
    assert.equal(screenshot.saveDisabled, false);
    const png = Buffer.from(screenshot.shotSource.split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), 220, 'Crop width must match webpage coordinates after opening the native panel.');
    assert.equal(png.readUInt32BE(20), 110, 'Crop height must match webpage coordinates.');
    assert.equal((await queue()).items.length, 0, 'Screenshots must remain in review until the user saves.');
    await panel.evaluate(() => {
      const title = document.querySelector('#capture-title'); title.value = 'Edited native screenshot'; title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await panel.click('#save-page');
    await expect.poll(async () => (await queue()).items.length).toBe(1);
    const saved = (await queue()).items[0];
    assert.equal(saved.kind, 'screenshot');
    assert.equal(saved.title, 'Edited native screenshot');
    assert.equal(saved.payload, screenshot.shotSource);
    assert.equal(saved.sourceUrl, fixtureUrl);
    console.log('PASS: native Shot button → real drag → editable panel preview → explicit Save queues the correct PNG.');

    const commands = await options.evaluate(() => chrome.commands.getAll());
    assert.ok(commands.some(command => command.name === 'capture-visible-area'));
    console.log('LIMITATION: browser-level Alt+Shift+D dispatch needs a headed manual check; this test does not claim that path passed.');
  } catch (error) {
    console.error(`Native panel smoke failed. Profile retained at ${profile}`);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await run();
} finally {
  await new Promise(resolve => server.close(resolve));
}

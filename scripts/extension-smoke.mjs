import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

// Small real PDF, including a valid xref table, to exercise pdf.js and persistence.
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  '<< /Length 49 >>\nstream\nBT /F1 16 Tf 20 100 Td (PDF capture fixture) Tj ET\nendstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let fixture = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(fixture)); fixture += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(fixture);
fixture += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Content-Type', request.url === '/file.pdf' ? 'application/pdf' : 'text/html');
  if (request.url === '/meta') {
    response.end('<title>Harbour Lights Guide | Example Journal</title><meta property="og:title" content="Harbour Lights Guide"><meta property="og:site_name" content="Example Journal">'
      + '<meta name="description" content="Where to see the old lighthouses at dusk."><meta name="keywords" content="Harbour, Lighthouses, travel guide with a very long keyword phrase"><h1>Harbour Lights</h1><p>Body</p>');
    return;
  }
  response.end(request.url === '/file.pdf' ? fixture : '<title>PDF website</title><a href="/file.pdf" type="application/pdf">Download PDF</a>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const pdfWebsite = `http://127.0.0.1:${server.address().port}`;

const builtExtension = resolve(fileURLToPath(new URL('../apps/extension/dist/development/', import.meta.url)));
const temporary = fileURLToPath(new URL('../.tmp/', import.meta.url));
await mkdir(temporary, { recursive: true });
const extension = await mkdtemp(join(temporary, 'extension-fixture-'));
await cp(builtExtension, extension, { recursive: true });
// Headless Chromium cannot invoke the toolbar action to grant activeTab. Grant only
// the loopback fixture in this temporary test build; shipping permissions stay unchanged.
const manifestPath = join(extension, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
await writeFile(manifestPath, JSON.stringify(manifest));
const profile = await mkdtemp(join(temporary, 'extension-check-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const library = await context.newPage();
  await library.goto(process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176');
  await library.getByRole('button', { name: 'Open settings' }).click();
  await library.getByRole('button', { name: /Browser extension/ }).click();
  const invitation = await library.getByRole('textbox', { name: 'Library setup code' }).inputValue();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.getByRole('textbox', { name: 'Library setup code' }).fill(invitation);
  await options.getByRole('button', { name: 'Confirm library connection' }).click();
  await options.locator('#connection-details').waitFor({ state: 'visible', timeout: 10000 });
  const confirmation = await options.locator('#confirmation-code').inputValue();
  await library.getByRole('textbox', { name: 'Paste the confirmation code' }).fill(confirmation);
  await library.getByRole('button', { name: 'Connect extension', exact: true }).click();
  await expect(library.locator('.notice').filter({ hasText: 'Extension connected' })).toBeVisible();
  await library.getByRole('button', { name: 'Open settings' }).click();
  await expect(library.getByRole('button', { name: /Browser extension/ })).toContainText('Extension connected');
  await library.getByRole('button', { name: /Browser extension/ }).click();
  await expect(library.getByRole('dialog', { name: 'Connect your browser' })).toContainText('Extension connected');
  await library.keyboard.press('Escape');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await popup.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick), true);
  assert.equal(await popup.evaluate(() => chrome.runtime.getManifest().side_panel.default_path), 'popup.html');
  await popup.close();
  // Exercise the actual worker and connected web receiver; no browser APIs mocked.
  const response = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'queue-capture', capture: { kind: 'text', title: 'Extension delivery check', note: 'Real Chromium worker, real local receiver.', tags: ['test'] } }));
  assert.equal(response.ok, true, JSON.stringify(response));
  // Home is a launcher in the redesign; the delivered card shows up under All notes.
  await library.keyboard.press('Escape');
  await library.getByRole('button', { name: 'All notes', exact: true }).click({ timeout: 15000 });
  await library.getByRole('article', { name: 'Open Extension delivery check' }).waitFor({ timeout: 15000 });
  await options.waitForFunction(async () => (await chrome.runtime.sendMessage({ type: 'list-captures' })).items.length === 0);
  const website = await context.newPage();
  await website.goto(pdfWebsite);
  await options.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(url));
    await chrome.tabs.update(tab.id, { active: true });
  }, pdfWebsite);
  const popupReady = context.waitForEvent('page');
  await options.evaluate(() => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html'), active: false }));
  const pdfPopup = await popupReady;
  await expect(pdfPopup.locator('#pdf-links option')).toHaveAttribute('value', `${pdfWebsite}/file.pdf`);
  await pdfPopup.getByRole('button', { name: 'PDF', exact: true }).click();
  await pdfPopup.getByLabel('PDF download URL', { exact: true }).fill(`${pdfWebsite}/file.pdf`);
  await pdfPopup.locator('#capture-title').fill('Saved PDF fixture');
  await pdfPopup.getByRole('button', { name: 'Choose collections' }).click();
  await pdfPopup.locator('#new-collection-name').fill('PDF research');
  await pdfPopup.getByRole('button', { name: '+ Create new collection' }).click();
  await pdfPopup.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(pdfPopup.locator('#status')).toContainText('Saved');
  await library.waitForFunction(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const card = await cardDb.cards.filter(card => card.title === 'Saved PDF fixture').first();
    const collection = await cardDb.collections.filter(collection => collection.name === 'PDF research').first();
    return card?.type === 'pdf' && card.pdf?.pageCount === 1 && card.pdf.text.includes('PDF capture fixture') && collection?.cardIds.includes(card.id);
  }, undefined, { timeout: 30000 });
  await options.waitForFunction(async () => (await chrome.runtime.sendMessage({ type: 'list-captures' })).items.length === 0);
  // Keep the capture document open while selecting text in the website.
  await website.evaluate(() => {
    const paragraph = document.createElement('p'); paragraph.id = 'highlight-fixture'; paragraph.textContent = 'This passage becomes my note.'; document.body.append(paragraph);
    const range = document.createRange(); range.selectNodeContents(paragraph);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await expect(pdfPopup.locator('#note-text')).toHaveValue('This passage becomes my note.');
  await pdfPopup.locator('#capture-title').fill('Highlight with caption');
  await pdfPopup.locator('#caption-text').fill('My independent caption');
  await pdfPopup.locator('#caption-text').press('Control+Enter');
  await library.waitForFunction(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const card = await cardDb.cards.filter(card => card.title === 'Highlight with caption').first();
    return card?.note === 'This passage becomes my note.' && card.caption === 'My independent caption';
  });
  // Sending closes the capture panel; the next capture opens a fresh one.
  await expect.poll(() => pdfPopup.isClosed(), { timeout: 5000 }).toBe(true);
  const reopened = context.waitForEvent('page');
  await options.evaluate(() => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html'), active: false }));
  const nextPopup = await reopened;
  await expect(nextPopup.locator('#page-title')).not.toHaveText('Loading page…');
  await nextPopup.locator('#capture-title').fill('Edited highlight shortcut');
  await nextPopup.locator('#mode-selection').click();
  await nextPopup.locator('#note-text').fill('I refined the highlighted note.');
  await nextPopup.locator('#caption-text').fill('My independent caption');
  await website.keyboard.press('Control+Enter');
  await library.waitForFunction(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const card = await cardDb.cards.filter(card => card.title === 'Edited highlight shortcut').first();
    return card?.note === 'I refined the highlighted note.' && card.caption === 'My independent caption';
  });
  await library.reload();
  await library.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(library.getByRole('article', { name: 'Open Saved PDF fixture' })).toBeVisible();
  await expect(library.getByRole('article', { name: 'Open Highlight with caption' }).locator('.note-caption')).toHaveText('My independent caption');
  console.log('Live page highlighting, separate captions, Ctrl+Enter delivery and close-on-send passed.');
  await expect.poll(() => nextPopup.isClosed(), { timeout: 5000 }).toBe(true);
  // Escape closes the panel.
  const escapeReady = context.waitForEvent('page');
  await options.evaluate(() => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html'), active: false }));
  const escapePopup = await escapeReady;
  await expect(escapePopup.locator('#page-title')).not.toHaveText('Loading page…');
  await escapePopup.locator('#capture-title').focus();
  await escapePopup.keyboard.press('Escape').catch(() => { /* The page closes during the key press. */ });
  await expect.poll(() => escapePopup.isClosed(), { timeout: 5000 }).toBe(true);
  // Autofill from page metadata: cleaned title + site, description as caption, short tags.
  await website.goto(`${pdfWebsite}/meta`);
  const metaReady = context.waitForEvent('page');
  await options.evaluate(() => chrome.tabs.create({ url: chrome.runtime.getURL('popup.html'), active: false }));
  const metaPopup = await metaReady;
  await expect(metaPopup.locator('#capture-title')).toHaveValue('Harbour Lights Guide · Example Journal');
  await expect(metaPopup.locator('#note-text')).toHaveValue('Where to see the old lighthouses at dusk.');
  await expect(metaPopup.locator('#tags')).toHaveValue('harbour, lighthouses');
  // A screenshot handed to the open panel is reviewed there and saves without a note.
  await metaPopup.evaluate(() => receiveScreenshot({ kind: 'screenshot', title: 'Lighthouse crop · Example Journal', sourceUrl: 'http://127.0.0.1/meta',
    payload: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }));
  await expect(metaPopup.locator('#shot-preview')).toBeVisible();
  await expect(metaPopup.locator('#save-page')).toHaveText('Save screenshot');
  // The screenshot's own name (from what was inside the selection) replaces the untouched page title.
  await expect(metaPopup.locator('#capture-title')).toHaveValue('Lighthouse crop · Example Journal');
  await metaPopup.locator('#capture-title').fill('Lighthouse crop');
  await metaPopup.locator('#note-text').fill('');
  await metaPopup.getByRole('button', { name: 'Card colour #ff4b4b' }).click();
  await metaPopup.locator('#save-page').click();
  await library.waitForFunction(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const card = await cardDb.cards.filter(card => card.title === 'Lighthouse crop').first();
    return card?.type === 'image' && card.dataUrl?.startsWith('data:image/png') && !card.note && card.color === '#ff4b4b';
  }, undefined, { timeout: 15000 });
  await expect.poll(() => metaPopup.isClosed(), { timeout: 5000 }).toBe(true);
  console.log('Metadata autofill and in-panel screenshot review (no note needed) passed.');
  // The panel shortcut is registered.
  assert.ok(await options.evaluate(async () => (await chrome.commands.getAll()).some(command => command.name === 'toggle-capture-panel')));
  await website.bringToFront();
  await options.evaluate(async () => { await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id }); });
  await expect.poll(() => options.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length)).toBe(1);
  await website.locator('body').click(); // any interaction with the website
  assert.equal(await options.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).length), 1);
  console.log('Native side panel stays open while interacting with the website.');
  console.log('PDF downloaded through the extension popup, parsed, stored in its collection and retained after reload.');
  console.log(`Manifest V3 loads; pairing, live note delivery and post-commit queue acknowledgement passed (${id}).`);
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }

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
  assert.equal(await popup.locator('body').evaluate(element => getComputedStyle(element).width), '440px');
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
  await expect(pdfPopup.locator('#status')).toContainText('Queued on this device');
  await library.waitForFunction(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const card = await cardDb.cards.filter(card => card.title === 'Saved PDF fixture').first();
    const collection = await cardDb.collections.filter(collection => collection.name === 'PDF research').first();
    return card?.type === 'pdf' && card.pdf?.pageCount === 1 && card.pdf.text.includes('PDF capture fixture') && collection?.cardIds.includes(card.id);
  }, undefined, { timeout: 30000 });
  await options.waitForFunction(async () => (await chrome.runtime.sendMessage({ type: 'list-captures' })).items.length === 0);
  await library.reload();
  await library.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(library.getByRole('article', { name: 'Open Saved PDF fixture' })).toBeVisible();
  console.log('PDF downloaded through the extension popup, parsed, stored in its collection and retained after reload.');
  console.log(`Manifest V3 loads; pairing, live note delivery and post-commit queue acknowledgement passed (${id}).`);
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); }

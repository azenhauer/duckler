import { chromium } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';

const extension = resolve(fileURLToPath(new URL('../apps/extension/dist/development/', import.meta.url)));
const temporary = fileURLToPath(new URL('../.tmp/', import.meta.url));
await mkdir(temporary, { recursive: true });
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
  // Exercise the actual worker and connected web receiver; no browser APIs mocked.
  const response = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'queue-capture', capture: { kind: 'text', title: 'Extension delivery check', note: 'Real Chromium worker, real local receiver.', tags: ['test'] } }));
  assert.equal(response.ok, true, JSON.stringify(response));
  await library.getByRole('article', { name: 'Open Extension delivery check' }).waitFor({ timeout: 15000 });
  await options.waitForFunction(async () => (await chrome.runtime.sendMessage({ type: 'list-captures' })).items.length === 0);
  console.log(`Manifest V3 loads; pairing, live note delivery and post-commit queue acknowledgement passed (${id}).`);
} finally { await context.close(); }

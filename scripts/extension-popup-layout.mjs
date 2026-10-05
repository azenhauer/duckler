import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const output = resolve('.tmp/extension-layout');
await mkdir(output, { recursive: true });
try {
  // Layout fixture only; extension-smoke.mjs separately exercises the real worker.
  const page = await browser.newPage({ viewport: { width: 288, height: 600 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.chrome = {
      runtime: { sendMessage: async message => {
        if (message.type === 'list-captures') return { ok: true, items: [], budget: 1000000 };
        if (message.type === 'list-collections') return { ok: true, collections: [{ id: 'long', name: 'A very long collection title ' + 'research'.repeat(20) }] };
        if (message.type === 'pairing-status') return { ok: true, pairing: { origin: 'https://duckler.pages.dev' } };
        return { ok: true };
      } },
      tabs: { query: async () => [{ id: 1, url: 'https://teachingenglish.org.uk/lesson', title: 'Lesson plan: research and classroom activities' }] },
      scripting: { executeScript: async () => [{ result: { title: 'Lesson plan: research and classroom activities', url: 'https://teachingenglish.org.uk/lesson', selection: '', pdfLinks: [] } }] },
    };
  });
  await page.goto(pathToFileURL(resolve('apps/extension/dist/production/popup.html')).href);
  await expect(page.locator('#capture-title')).toHaveValue('Lesson plan: research and classroom activities');
  // The initial Chrome popup viewport must not shrink the requested width to 288px.
  assert.equal(await page.locator('html').evaluate(element => element.getBoundingClientRect().width), 440);
  await page.setViewportSize({ width: 440, height: 600 });
  await page.evaluate(() => document.fonts.ready);
  async function contained() {
    const overflow = await page.evaluate(() => [...document.querySelectorAll('button,input,textarea,.collection-chip,.collection-picker-popover')]
      .filter(element => element.getClientRects().length)
      .filter(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > 441 || element.scrollWidth > element.clientWidth + 1 && element.matches('.mode,.collection-option,.collection-chip'); })
      .map(element => element.id || element.className));
    assert.deepEqual(overflow, [], 'Popup controls and their labels fit horizontally');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 440));
  }
  await contained();
  const title = await page.locator('#capture-title').boundingBox();
  const collection = await page.locator('#collection-picker-toggle').boundingBox();
  assert.ok(Math.abs(title.y - collection.y) < 1 && Math.abs(title.height - collection.height) < 1, 'Title and Collections align');
  await page.screenshot({ path: resolve(output, 'capture.png'), fullPage: true });
  await page.getByRole('button', { name: 'Choose collections' }).click();
  await contained();
  assert.ok(await page.locator('#collection-picker-popover').evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + 6, Math.min(box.bottom - 6, 550)));
  }), 'The picker stays above the note field and save controls');
  await page.screenshot({ path: resolve(output, 'collections.png'), fullPage: true });
  await page.getByRole('option').click();
  await contained();
  await page.getByRole('button', { name: '1 selected' }).click();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await page.locator('#pdf-url').fill('https://teachingenglish.org.uk/' + 'long-download-path/'.repeat(15) + 'file.pdf');
  await contained();
  await page.screenshot({ path: resolve(output, 'pdf.png'), fullPage: true });
  console.log('Popup intrinsic width, mode buttons, aligned fields, long collection names, picker and PDF field fit.');
} finally { await browser.close(); }

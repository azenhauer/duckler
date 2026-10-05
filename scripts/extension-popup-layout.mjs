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
  const page = await browser.newPage({ viewport: { width: 440, height: 600 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.chrome = {
      runtime: { sendMessage: async message => {
        if (message.type === 'list-captures') return { ok: true, items: [], budget: 1000000 };
        if (message.type === 'list-collections') return { ok: true, collections: Array.from({ length: 7 }, (_, index) => ({ id: `long-${index}`, name: 'A very long collection title ' + 'research'.repeat(20) })) };
        if (message.type === 'pairing-status') return { ok: true, pairing: { origin: 'https://duckler.pages.dev' } };
        return { ok: true };
      } },
      tabs: { query: async () => [{ id: 1, url: 'https://teachingenglish.org.uk/lesson', title: 'Lesson plan: research and classroom activities' }] },
      scripting: { executeScript: async () => [{ result: { title: 'Lesson plan: research and classroom activities', url: 'https://teachingenglish.org.uk/lesson', selection: '', pdfLinks: [] } }] },
    };
  });
  await page.goto(pathToFileURL(resolve('apps/extension/dist/production/popup.html')).href);
  await expect(page.locator('#capture-title')).toHaveValue('Lesson plan: research and classroom activities');
  await page.evaluate(() => document.fonts.ready);
  async function contained() {
    const overflow = await page.evaluate(() => [...document.querySelectorAll('button,input,textarea,.collection-chip,.collection-picker-popover')]
      .filter(element => element.getClientRects().length)
      .filter(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1 || element.scrollWidth > element.clientWidth + 1 && element.matches('.mode'); })
      .map(element => element.id || element.className));
    if (overflow.length) await page.screenshot({ path: resolve(output, 'overflow.png') });
    assert.deepEqual(overflow, [], `Capture controls fit at ${JSON.stringify(page.viewportSize())}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
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
  await expect(page.getByRole('option')).toHaveCount(3);
  await page.locator('#collection-picker-popover').getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('option').first().click();
  await contained();
  await page.getByRole('button', { name: '1 selected' }).click();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await page.locator('#pdf-url').fill('https://teachingenglish.org.uk/' + 'long-download-path/'.repeat(15) + 'file.pdf');
  await contained();
  await page.screenshot({ path: resolve(output, 'pdf.png'), fullPage: true });
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await page.locator('#note-text').fill('A long highlighted passage. '.repeat(50));
  await page.locator('#caption-text').fill('My own annotation');
  for (const width of [288, 320, 440]) {
    for (const height of [500, 600, 800]) {
      await page.setViewportSize({ width, height }); await contained();
    }
  }
  await page.setViewportSize({ width:320, height:600 });
  await page.screenshot({ path: resolve(output, 'persistent-panel.png') });
  console.log('Persistent panel fits without page scrolling; Note, Caption, picker pagination and save controls stay accessible.');
} finally { await browser.close(); }

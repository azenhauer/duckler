import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const failures = [];
  page.on('response', response => { if (response.status() >= 500) failures.push(response.status()); });
  await page.goto(process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176');
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
  for (const name of ['collections', 'canvas']) {
    const button = page.getByRole('button', { name: `Open ${name}`, exact: true });
    await button.hover();
    await expect.poll(() => button.locator('img').evaluate(img => getComputedStyle(img).transform)).not.toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => button.locator('img').evaluate(img => getComputedStyle(img).transform)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  const shared = '/@fs/' + fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)).replaceAll('\\', '/');
  await page.evaluate(async url => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const { createCardFromInput } = await import(url);
    const image = document.createElement('canvas'); image.width = 480; image.height = 320;
    const paint = image.getContext('2d'); paint.fillStyle = '#628f94'; paint.fillRect(0, 0, 480, 320);
    await cardDb.cards.put(createCardFromInput({ id: 'screenshot', type: 'image', title: 'Original title', dataUrl: image.toDataURL(), note: Array.from({ length: 12 }, (_, index) => `Line ${index}: <script>plain text</script>`).join('\n') }));
  }, shared);
  await page.reload(); await page.getByRole('button', { name: 'All notes', exact: true }).click();
  const bubble = page.getByRole('complementary', { name: 'Screenshot note' });
  await expect(bubble).toBeVisible();
  assert.equal(await bubble.locator('script').count(), 0);
  assert.equal(await page.locator('.card-tile .screenshot-note').count(), 0);
  const before = await bubble.boundingBox();
  await bubble.getByRole('button', { name: 'Show more' }).click();
  assert.ok((await bubble.boundingBox()).height > before.height);
  await bubble.getByRole('button', { name: 'Show less' }).click();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  assert.equal(await page.locator('.app-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--ui-bg').trim()), '#dde8f4'); // PS2 aqua print-ad light mode
  await page.screenshot({ path: '.tmp/ui-checks/notes-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: '.tmp/ui-checks/notes-dark.png', fullPage: true });
  await page.locator('article[aria-label="Open Original title"]').dblclick(); // one click selects, two edit
  const editor = page.getByRole('dialog', { name: 'Card details' });
  await expect(editor.locator('.editor-topbar').getByRole('button', { name: 'Move to trash', exact: true })).toBeVisible();
  await expect(editor.locator('.editor-topbar').getByRole('button', { name: 'Delete permanently', exact: true })).toBeVisible();
  for (const [width, height] of [[1366, 768], [1024, 600], [390, 844], [390, 350], [683, 384]]) {
    await page.setViewportSize({ width, height });
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect.poll(() => editor.evaluate(el => ({ shell: el.scrollHeight <= el.clientHeight + 1, form: el.querySelector('form').scrollHeight <= el.querySelector('form').clientHeight + 1, bottom: el.getBoundingClientRect().bottom <= innerHeight })), { message: `Editor fits ${width}x${height}` }).toEqual({ shell: true, form: true, bottom: true });
  }
  // The editor shows every field on one sheet (no tabs).
  await editor.getByRole('textbox', { name: 'Note', exact: true }).fill('Updated screenshot note\nSecond line');
  await expect(editor.getByRole('textbox', { name: 'Title' })).toHaveValue('Original title');
  await expect(editor.getByRole('textbox', { name: 'Note' })).toHaveValue('Updated screenshot note\nSecond line');
  await page.screenshot({ path: '.tmp/ui-checks/notes-editor-phone.png', fullPage: true });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await page.reload(); await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(bubble).toContainText('Updated screenshot note');
  await page.locator('article[aria-label="Open Original title"]').dblclick(); // one click selects, two edit
  await editor.getByRole('textbox', { name: 'Note' }).fill('   ');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble).toHaveCount(0);
  assert.deepEqual(failures, []);
  console.log('Notes, expansion, inert text, draft/reload persistence, compact editor, light mode and Home animations passed; no server errors.');
} finally { await browser.close(); }

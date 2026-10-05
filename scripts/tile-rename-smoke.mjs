import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176');
  await page.getByRole('button', { name: 'Open collections', exact: true }).waitFor();
  await page.evaluate(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    await cardDb.collections.put({ id: 'rename-smoke', name: 'Rename smoke', cardIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open collections', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Rename smoke', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'New name for Rename smoke', exact: true }).fill('Collection renamed');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Open collection Collection renamed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await page.locator('.canvas-gallery').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await page.getByRole('button', { name: 'Open canvas Collection renamed', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Collection renamed options' })).toBeVisible();
  await page.screenshot({ path: '.tmp/tile-menu-debug.png' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'New name for Collection renamed', exact: true }).fill('Canvas renamed');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Open canvas Canvas renamed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open canvas Canvas renamed', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'New name for Canvas renamed', exact: true }).fill('Discard me');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'New name for Canvas renamed', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open canvas Canvas renamed', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Collection/canvas right-click rename, Escape cancellation and persistence passed.');
} finally {
  await browser.close();
}

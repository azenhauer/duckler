import { chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176';
const sharedModuleURL = '/@fs/' + fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)).replaceAll('\\', '/');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Collections', exact: true }).waitFor();
  await page.evaluate(async sharedModule => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const { createCardFromInput, createCollectionFromInput } = await import(sharedModule);
    const card = createCardFromInput({ id: 'membership-card', type: 'text', title: 'Membership check' });
    await cardDb.cards.put(card);
    await cardDb.collections.bulkPut([
      createCollectionFromInput({ id: 'membership-one', name: 'First', cardIds: [card.id] }),
      createCollectionFromInput({ id: 'membership-two', name: 'Second', cardIds: [card.id] }),
    ]);
  }, sharedModuleURL);
  await page.reload();
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  const card = page.getByRole('article', { name: 'Open Membership check' });
  const firstBadge = page.getByRole('button', { name: 'Collection First', exact: true });
  const secondBadge = page.getByRole('button', { name: 'Collection Second', exact: true });
  await firstBadge.click();
  await page.getByRole('menuitem', { name: 'Remove from collection', exact: true }).click();
  await expect(firstBadge).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(secondBadge).toBeVisible();
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeEnabled();
  await page.evaluate(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    await cardDb.collections.update('membership-one', { name: 'Renamed after removal' });
  });
  await undo.click();
  const renamedBadge = page.getByRole('button', { name: 'Collection Renamed after removal', exact: true });
  await expect(renamedBadge).toBeVisible();
  await expect(undo).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(renamedBadge).toBeVisible();
  await expect(secondBadge).toBeVisible();
  await renamedBadge.click();
  await page.getByRole('menuitem', { name: 'Remove from collection', exact: true }).click();
  await expect(undo).toBeVisible();
  await expect(undo).toHaveCount(0, { timeout: 8500 });
  await page.reload();
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(renamedBadge).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(secondBadge).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Collection removal, exact Undo, later edits, expiry and reload persistence passed in Chromium.');
} finally {
  await browser.close();
}

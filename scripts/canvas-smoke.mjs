import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176';
const output = new URL('../.tmp/ui-checks/', import.meta.url);
const sharedModuleURL = '/@fs/' + fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)).replaceAll('\\', '/');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole('main').getAttribute('aria-busy');
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
  await page.evaluate(async sharedModule => {
    const { cardDb } = await import('/src/lib/cardDb.ts');
    const { createCardFromInput, createCollectionFromInput } = await import(sharedModule);
    const thumbnail = document.createElement('canvas'); thumbnail.width = 240; thumbnail.height = 160;
    const paint = thumbnail.getContext('2d');
    paint.fillStyle = '#bdc4a1'; paint.fillRect(0, 0, 240, 160);
    paint.fillStyle = '#2f564a'; paint.beginPath(); paint.arc(170, 55, 60, 0, Math.PI * 2); paint.fill();
    paint.fillStyle = '#e7d9af'; paint.fillRect(30, 60, 120, 80);
    const shared = createCardFromInput({ id: 'shared-ref', type: 'image', title: 'Shared reference', dataUrl: thumbnail.toDataURL('image/png') });
    const studio = createCardFromInput({ id: 'studio-only', type: 'text', title: 'Only Studio', note: 'A visual direction for this collection.' });
    const research = createCardFromInput({ id: 'research-only', type: 'bookmark', title: 'Only Research', note: 'Sources and ideas for this collection.', sourceUrl: 'https://example.com' });
    await cardDb.cards.bulkPut([shared, studio, research]);
    await cardDb.collections.bulkPut([
      createCollectionFromInput({ id: 'studio', name: 'Studio', cardIds: [shared.id, studio.id] }),
      createCollectionFromInput({ id: 'research', name: 'Research', cardIds: [shared.id, research.id] }),
    ]);
  }, sharedModuleURL);
  await page.reload();
  await page.getByRole('button', { name: 'Open canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open canvas Studio', exact: true }).waitFor();
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [700, 800], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const gallery = await page.locator('.canvas-gallery').boundingBox();
    assert.ok(Math.abs(gallery.x + gallery.width / 2 - width / 2) < 2, `Centered canvas gallery at ${width}`);
    const tiles = await page.locator('.canvas-gallery-tile').evaluateAll(items => items.map(el => el.getBoundingClientRect().toJSON()));
    for (const tile of tiles) assert.ok(tile.left >= 0 && tile.right <= width + 1, `Canvas previews fit ${width}`);
    if (width === 1440) assert.ok(tiles.every(tile => tile.width >= 440 && tile.width <= 480), 'Canvas previews are about one-and-a-half grid blocks, not full-width');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: fileURLToPath(new URL(`canvas-gallery-${width}.png`, output)), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole('button', { name: 'Open canvas Studio', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node-card').length === 2);
  assert.equal(await page.locator('.canvas-card-node').getByText('Only Research').count(), 0);
  await page.locator('.canvas-card-node').getByText('Only Studio').waitFor();
  const dragSharedCard = async (dx, dy) => {
    const card = page.locator('.react-flow__node[data-id="shared-ref"]');
    const bounds = await card.boundingBox();
    await page.mouse.move(bounds.x + 35, bounds.y + 35);
    await page.mouse.down(); await page.mouse.move(bounds.x + 35 + dx, bounds.y + 35 + dy, { steps: 12 }); await page.mouse.up();
    await page.waitForFunction(async () => {
      const { cardDb } = await import('/src/lib/cardDb.ts');
      return Boolean((await cardDb.canvasLayouts.get(document.querySelector('.canvas-panel').getAttribute('data-collection-id')))?.positions['shared-ref']);
    });
    return card.evaluate(el => el.style.transform);
  };
  const studioTransform = await dragSharedCard(110, 70);
  await page.screenshot({ path: fileURLToPath(new URL('canvas-studio.png', output)), animations: 'disabled' });
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await page.getByRole('button', { name: 'Open canvas Research', exact: true }).click();
  await page.locator('.canvas-card-node').getByText('Only Research').waitFor();
  assert.equal(await page.locator('.canvas-card-node').getByText('Only Studio').count(), 0);
  const researchTransform = await dragSharedCard(-50, 90);
  assert.notEqual(studioTransform, researchTransform, 'The shared card has independent positions');
  const layouts = await page.evaluate(async () => {
    const { cardDb } = await import('/src/lib/cardDb.ts'); return cardDb.canvasLayouts.toArray();
  });
  assert.notDeepEqual(layouts.find(layout => layout.collectionId === 'studio').positions['shared-ref'], layouts.find(layout => layout.collectionId === 'research').positions['shared-ref']);
  assert.ok(layouts.every(layout => layout.viewport?.zoom > 0), 'Each canvas persists its viewport');
  await page.reload();
  await page.getByRole('button', { name: 'Open canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open canvas Studio', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node-card').length === 2);
  assert.equal(await page.locator('.react-flow__node[data-id="shared-ref"]').evaluate(el => el.style.transform), studioTransform, 'Studio positions survive reload');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: fileURLToPath(new URL('canvas-mobile.png', output)), animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('Centered canvas gallery, collection membership, independent drag positions, saved viewports and reload persistence passed.');
} finally { await browser.close(); }

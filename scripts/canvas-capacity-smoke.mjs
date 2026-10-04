import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.DUCKLER_PREVIEW_URL || 'http://localhost:5176';
const sharedURL = '/@fs/' + fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)).replaceAll('\\', '/');
const browser = await chromium.launch({ headless: true });
let page;
let profiler;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text().slice(0, 400)); });
  await page.goto(baseURL);
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
  await page.evaluate(async sharedModule => {
    const { cardDb, readCanvasState, commitCanvasContent } = await import('/src/lib/cardDb.ts');
    const { createCardFromInput, createCollectionFromInput, defaultCanvasStyle } = await import(sharedModule);
    const thumbnail = document.createElement('canvas'); thumbnail.width = 240; thumbnail.height = 160;
    const paint = thumbnail.getContext('2d'); paint.fillStyle = '#63868d'; paint.fillRect(0, 0, 240, 160);
    const image = thumbnail.toDataURL('image/png');
    const cards = Array.from({ length: 200 }, (_, index) => createCardFromInput({ id: `capacity-${index}`, type: index % 2 ? 'text' : 'image', title: `Reference ${index}`, note: 'Capacity fixture', ...(index % 2 ? {} : { dataUrl: image }) }));
    await cardDb.cards.bulkPut(cards);
    await cardDb.collections.put(createCollectionFromInput({ id: 'capacity', name: 'Capacity board', cardIds: cards.map(card => card.id) }));
    const state = await readCanvasState('capacity');
    const placements = state.placements.map((item, index) => ({ ...item, x: index % 20 * 260, y: Math.floor(index / 20) * 240 }));
    const elements = Array.from({ length: 500 }, (_, index) => ({ id: `element-${index}`, canvasId: 'capacity', kind: index % 2 ? 'stroke' : 'text', x: index % 25 * 210, y: Math.floor(index / 25) * 130, width: 180, height: 60, rotation: 0, zIndex: 1, style: defaultCanvasStyle, ...(index % 2 ? { points: [{ x: 0, y: 0 }, { x: 80, y: 50 }, { x: 180, y: 0 }] } : { text: `Annotation ${index}`, fontSize: 18 }) }));
    const connectors = placements.map((item, index) => ({ id: `edge-${index}`, canvasId: 'capacity', sourceId: item.id, targetId: placements[(index + 1) % placements.length].id, label: '', color: '#7cbcff' }));
    await commitCanvasContent('capacity', state.document.revision, { placements, elements, connectors: [] });
    await cardDb.canvasLayouts.put({ collectionId: 'capacity', positions: {}, viewport: { x: 40, y: 40, zoom: .6 }, updatedAt: new Date().toISOString() });
    let denied = false;
    try { await commitCanvasContent('capacity', state.document.revision + 1, { placements: [...placements, { ...placements[0], id: 'overflow' }], elements, connectors }); } catch (error) { denied = error.message === 'Canvas object limit reached'; }
    if (!denied || await cardDb.canvasPlacements.where('canvasId').equals('capacity').count() !== 200) throw new Error('Capacity boundary changed saved data');
  }, sharedURL);
  await page.reload();
  await page.getByRole('button', { name: 'Open canvas', exact: true }).click();
  profiler = await page.context().newCDPSession(page);
  await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
  const started = Date.now();
  await page.getByRole('button', { name: 'Open canvas Capacity board', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Canvas Capacity board' })).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await expect.poll(() => page.locator('.react-flow__node-card').count(), { timeout: 30000 }).toBeGreaterThan(0);
  const openedMs = Date.now() - started;
  assert.ok(await page.locator('.react-flow__node-card').count() < 200, 'Offscreen card nodes are culled');
  const toolbar = page.getByRole('toolbar', { name: 'Canvas tools' });
  await toolbar.getByRole('button', { name: 'Hand', exact: true }).click();
  await page.locator('.canvas-surface').scrollIntoViewIfNeeded();
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  const bounds = await page.locator('.canvas-surface').boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .6); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .7 - 120, bounds.y + bounds.height * .6 - 80, { steps: 20 }); await page.mouse.up();
  await expect.poll(() => page.locator('.react-flow__viewport').getAttribute('style')).not.toBe(before);
  await toolbar.getByRole('button', { name: 'Fit board', exact: true }).click();
  await expect.poll(() => page.locator('.react-flow__node-card').count(), { timeout: 30000 }).toBe(200);
  assert.deepEqual(errors, []);
  console.log(`Canvas capacity passed: 200 placements, 500 mixed annotations, 200 connectors; opened in ${openedMs} ms; pan, culling and fit verified. Headless desktop fixture, not a device performance guarantee.`);
} catch (error) {
  const { profile } = await profiler.send('Profiler.stop');
  console.error(profile.nodes.sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0)).slice(0, 15).map(node => ({ function: node.callFrame.functionName, url: node.callFrame.url, hits: node.hitCount })));
  console.error(await page?.locator('.canvas-panel').innerText({ timeout: 3000 }).catch(() => 'Board did not respond'));
  throw error;
} finally { await browser.close(); }

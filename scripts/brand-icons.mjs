import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const svg = await readFile(new URL('../apps/web/public/duckler-logo.svg', import.meta.url));
const source = `data:image/svg+xml;base64,${svg.toString('base64')}`;
const extensionIcons = fileURLToPath(new URL('../apps/extension/icons/', import.meta.url));
const appIcons = fileURLToPath(new URL('../apps/web/public/icons/', import.meta.url));
await mkdir(extensionIcons, { recursive: true });
await mkdir(appIcons, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 128, 192, 512]) {
    const app = size >= 192;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${app ? '#141516' : 'transparent'}}body{display:grid;place-items:center}.duck{width:${app ? 72 : 92}%;height:${app ? 66 : 84}%;background:${app ? '#f1f2f3' : '#7e8996'};mask:url('${source}') center/contain no-repeat;-webkit-mask:url('${source}') center/contain no-repeat}</style><div class="duck"></div>`);
    await page.screenshot({ path: join(app ? appIcons : extensionIcons, `duck-${size}.png`), omitBackground: !app });
  }
  await page.setViewportSize({ width: 32, height: 32 });
  for (const [mode, color] of [['dark', '#ffffff'], ['light', '#141516']]) {
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}body{display:grid;place-items:center}.duck{width:94%;height:90%;background:${color};mask:url('${source}') center/contain no-repeat;-webkit-mask:url('${source}') center/contain no-repeat}</style><div class="duck"></div>`);
    await page.screenshot({ path: join(appIcons, `duck-tab-${mode}.png`), omitBackground: true });
  }
} finally { await browser.close(); }
console.log('Original duck artwork rasterized into extension and installable app icons.');

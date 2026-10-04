// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

describe('Pages deployment configuration', () => {
  it('keeps Wrangler configuration valid with the web build output', () => {
    const config = readJson('wrangler.jsonc');
    expect(config.name).toBe('duckler');
    expect(config.pages_build_output_dir).toBe('./apps/web/dist');
    expect(config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const value of Object.values(config.vars ?? {})) {
      expect(typeof value).toBe('string');
    }
    expect(Object.keys(config.vars ?? {}).filter((name) => name.startsWith('VITE_'))).toEqual([]);
  });

  it('uses npm consistently for the monorepo and lockfile', () => {
    const manifest = readJson('package.json');
    const lock = readJson('package-lock.json');
    expect(manifest.packageManager).toMatch(/^npm@/);
    expect(lock.packages[''].workspaces).toEqual(manifest.workspaces);
    for (const path of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
      expect(existsSync(fileURLToPath(new URL(path, root)))).toBe(false);
    }
  });
});

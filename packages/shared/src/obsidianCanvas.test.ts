import { describe, expect, it } from 'vitest';
import { appendCanvasesToObsidianArchive, canvasPreviewSvg } from './obsidianCanvas';
import { createCanvasPlacement } from './canvas';

const now = '2026-10-04T00:00:00.000Z';
const card = { id: 'c1', type: 'text' as const, title: 'A <b>card</b>', note: '', tags: [], createdAt: now, updatedAt: now, trashed: false, searchText: '' };
const placement = createCanvasPlacement('k1', 'c1', { x: 0, y: 0 }, 'p1');
const canvas = {
  document: { id: 'k1', title: 'Board', createdAt: now, updatedAt: now, revision: 1, seenCardIds: [] },
  placements: [placement],
  elements: [{ id: 't1', canvasId: 'k1', kind: 'text' as const, x: 300, y: 20, width: 200, height: 60, rotation: 0, zIndex: 1, style: { color: '#ffffff', fill: 'none', strokeWidth: 2, opacity: 1 }, text: 'Look here', fontSize: 18 }],
  connectors: [{ id: 'e1', canvasId: 'k1', sourceId: 'p1', targetId: 't1', label: 'note', color: '#3cc8ff', arrow: 'end' as const }],
};

describe('Obsidian canvas export', () => {
  it('draws an escaped SVG preview and lists text annotations', () => {
    const svg = canvasPreviewSvg(canvas, new Map([[card.id, card]]));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.includes('A &lt;b&gt;card&lt;/b&gt;')).toBe(true);
    expect(svg.includes('marker-end')).toBe(true);
    const archive = appendCanvasesToObsidianArchive({ files: [] as { path: string; content: string | Uint8Array }[] }, [canvas], [card]);
    expect(archive.files.map(file => file.path)).toEqual(['canvases/board--k1.svg', 'canvases/board--k1.md']);
    expect(String(archive.files[1].content).includes('- Look here')).toBe(true);
  });
});

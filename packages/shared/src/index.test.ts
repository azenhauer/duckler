import { describe, expect, it } from 'vitest';
import {
  acknowledgeCapture,
  applyRevision,
  advanceSyncCursor,
  advanceUploadJob,
  buildSearchText,
  cardSchema,
  captureQueueItemSchema,
  collectionSchema,
  createCardFromInput,
  createCaptureReceipt,
  createCollectionFromInput,
  createDriveStatus,
  createObsidianExportArchive,
  createSyncBatch,
  createSyncReducerState,
  createSyncRevision,
  createUploadJob,
  dedupeQueueItems,
  enqueueCapture,
  normalizeTags,
  queueSyncInventory,
  toggleCardInCollection,
  applySyncBatch,
} from './index';

describe('shared package', () => {
  it('validates and normalizes card input', () => {
    const card = createCardFromInput({
      type: 'bookmark',
      title: 'Example bookmark',
      sourceUrl: 'https://example.com',
      tags: ['Research', 'Research'],
      note: 'Useful reference',
    });

    expect(cardSchema.parse(card)).toMatchObject({
      type: 'bookmark',
      title: 'Example bookmark',
      sourceUrl: 'https://example.com',
      tags: ['research'],
    });
    expect(card.searchText).toContain('example');
  });

  it('builds a searchable text string from card fields', () => {
    const text = buildSearchText({
      title: 'Design notes',
      note: 'Moodboard',
      sourceUrl: 'https://example.com',
      tags: ['color', 'layout'],
    });

    expect(text).toContain('design notes');
    expect(text).toContain('moodboard');
    expect(text).toContain('color');
  });

  it('ignores blank or malformed source URLs and tag values when creating quick-add cards', () => {
    const card = createCardFromInput({
      type: 'bookmark',
      title: ' Quick add ',
      sourceUrl: 'KJKJJ',
      tags: ['  ', 'research', 'research'],
      note: '  ',
    });

    expect(card.title).toBe('Quick add');
    expect(card.sourceUrl).toBeUndefined();
    expect(card.tags).toEqual(['research']);
  });

  it('accepts bare domain names and converts them to valid URLs', () => {
    const card = createCardFromInput({
      type: 'bookmark',
      title: 'Docs',
      sourceUrl: 'example.com/docs',
    });

    expect(card.sourceUrl).toBe('https://example.com/docs');
  });

  it('normalizes tags to lowercase and deduplicates them', () => {
    expect(normalizeTags(['UI', 'ui', 'UX', 'UI'])).toEqual(['ui', 'ux']);
  });

  it('creates deduplicated collections and toggles memberships', () => {
    const collection = createCollectionFromInput({
      name: 'Research',
      cardIds: ['card-1', 'card-1', 'card-2'],
    });

    expect(collectionSchema.parse(collection)).toMatchObject({
      name: 'Research',
      cardIds: ['card-1', 'card-2'],
    });
    expect(toggleCardInCollection(collection, 'card-2')).toEqual(['card-1']);
    expect(toggleCardInCollection(collection, 'card-3')).toEqual(['card-1', 'card-2', 'card-3']);
  });

  it('creates and acknowledges capture queue entries', () => {
    const queued = enqueueCapture({
      kind: 'bookmark',
      title: 'Queued page',
      sourceUrl: 'https://example.com',
      note: 'Saved by an extension',
      status: 'queued',
    });

    const parsed = captureQueueItemSchema.parse(queued);
    expect(parsed.status).toBe('queued');

    const acknowledged = acknowledgeCapture([parsed], parsed.id, 'received');
    expect(acknowledged[0]?.status).toBe('received');
  });

  it('deduplicates duplicate captures and records delivery receipts', () => {
    const first = enqueueCapture({
      kind: 'image',
      title: 'Duplicate page',
      sourceUrl: 'https://example.com/image',
      payload: 'base64-image',
    });
    const second = enqueueCapture({
      kind: 'image',
      title: 'Duplicate page',
      sourceUrl: 'https://example.com/image',
      payload: 'base64-image',
    });

    expect(dedupeQueueItems([first, second])).toHaveLength(1);
    expect(createCaptureReceipt(first.id, 'saved')).toMatchObject({ queueItemId: first.id, status: 'saved' });
  });

  it('converges sync batches across duplicate deliveries', () => {
    const firstBatch = createSyncBatch(['card-1', 'card-2']);
    const secondBatch = createSyncBatch(['card-2', 'card-3']);

    expect(applySyncBatch(['card-1'], firstBatch)).toEqual(['card-1', 'card-2']);
    expect(applySyncBatch(applySyncBatch(['card-1'], firstBatch), secondBatch)).toEqual(['card-1', 'card-2', 'card-3']);
  });

  it('creates a drive status object from sync state and connection state', () => {
    expect(createDriveStatus(true, ['card-1', 'card-2', 'card-1'])).toEqual({
      connected: true,
      syncState: ['card-1', 'card-2'],
    });
  });

  it('applies revisions to a DAG reducer and preserves conflicts conservatively', () => {
    const state = createSyncReducerState();
    const base = createSyncRevision('card', 'card-1', { title: 'Alpha' }, 'device-a', [], 1);
    const updateFromA = createSyncRevision('card', 'card-1', { title: 'Alpha v2' }, 'device-a', [base.id], 2);
    const updateFromB = createSyncRevision('card', 'card-1', { title: 'Alpha v3' }, 'device-b', [base.id], 2);

    const first = applyRevision(state, base);
    const second = applyRevision(first, updateFromA);
    const third = applyRevision(second, updateFromB);

    expect(second.heads['card:card-1']).toEqual([updateFromA.id]);
    expect(third.conflicts['card:card-1']).toHaveLength(2);
    expect(third.heads['card:card-1']).toEqual([updateFromA.id, updateFromB.id].sort());
  });

  it('keeps delayed ancestors out of the frontier after concurrent branches converge', () => {
    const base = createSyncRevision('card', 'card-1', { title: 'Base' }, 'device-a', [], 1);
    const left = createSyncRevision('card', 'card-1', { title: 'Left' }, 'device-a', [base.id], 2);
    const right = createSyncRevision('card', 'card-1', { title: 'Right' }, 'device-b', [base.id], 2);
    const merged = createSyncRevision('card', 'card-1', { title: 'Merged' }, 'device-a', [left.id, right.id], 3);

    let state = applyRevision(createSyncReducerState(), base);
    state = applyRevision(state, left);
    state = applyRevision(state, right);
    state = applyRevision(state, merged);
    state = applyRevision(state, base);

    expect(state.heads['card:card-1']).toEqual([merged.id]);
    expect(state.conflicts['card:card-1']).toEqual([]);
  });

  it('tracks upload jobs and sync inventory across fake Drive cursor advances', () => {
    const job = createUploadJob('batch', 'abc123');
    const retrying = advanceUploadJob(job, 'retry', '429');

    expect(retrying.state).toBe('retry');
    expect(retrying.attempts).toBe(1);

    const state = queueSyncInventory({ cursor: 0, inventory: ['a'], pending: ['a'] }, ['b', 'c']);
    const advanced = advanceSyncCursor(state, 2, ['d']);

    expect(advanced.cursor).toBe(2);
    expect(advanced.inventory).toEqual(['a', 'b', 'c', 'd']);
    expect(advanced.pending).toEqual(['a', 'b', 'c']);
  });

  it('builds an Obsidian export archive with markdown files and attachments', () => {
    const card = createCardFromInput({
      type: 'image',
      title: 'Design mockup',
      note: 'A new landing page concept',
      sourceUrl: 'https://example.com/mockup',
      tags: ['design', 'UI'],
      dataUrl: 'data:image/png;base64,AAAA',
    });
    const collection = createCollectionFromInput({
      name: 'Research',
      cardIds: [card.id],
    });

    const archive = createObsidianExportArchive([card], [collection]);

    expect(archive.manifest.totalCards).toBe(1);
    expect(archive.files.some((file) => file.path === 'manifest.json')).toBe(true);
    expect(archive.files.some((file) => file.path === `cards/${card.title.toLowerCase().replace(/\s+/g, '-')}`)).toBe(false);
    expect(archive.files.some((file) => file.path.includes('design-mockup--'))).toBe(true);
    expect(archive.files.some((file) => file.path.includes('attachments/'))).toBe(true);

    const cardFile = archive.files.find((file) => file.path.includes('cards/') && file.path.endsWith('.md'));
    expect(cardFile?.content).toContain('# Design mockup');
    expect(cardFile?.content).toContain('](../attachments/');
    const collectionFile = archive.files.find((file) => file.path.includes('collections/'));
    expect(collectionFile?.content).toContain('Research');
    expect(collectionFile?.content).toContain('](../cards/');
    expect(archive.manifest.conflictStateIncluded).toBe(false);
    expect(archive.files.find((file) => file.path === 'export-report.md')?.content).toContain('conflict status is unknown');
  });

  it('keeps duplicate and Unicode names safe while escaping YAML and Markdown', () => {
    const first = createCardFromInput({
      id: 'card/one',
      type: 'text',
      title: 'お茶 & Café [ideas]',
      tags: ['#research: "quoted"'],
    });
    const second = createCardFromInput({
      id: 'card two',
      type: 'text',
      title: first.title,
    });
    const collection = createCollectionFromInput({
      id: 'collection/one',
      name: '読書 & ideas',
      cardIds: [first.id, second.id],
    });

    const archive = createObsidianExportArchive([first, second], [collection]);
    const cardPaths = archive.manifest.cards.map((card) => card.file);
    const cardFile = archive.files.find((file) => file.path === cardPaths[0]);
    const collectionFile = archive.files.find((file) => file.path === archive.manifest.collections[0]?.file);

    expect(new Set(cardPaths).size).toBe(2);
    expect(cardPaths[0]).toContain('お茶-café-ideas');
    expect(cardPaths[0]).toContain('card%2Fone');
    expect(archive.manifest.collections[0]?.file).toContain('読書-ideas');
    expect(cardFile?.content).toContain('# お茶 & Café \\[ideas\\]');
    expect(cardFile?.content).toContain('  - "#research: \\"quoted\\""');
    expect(collectionFile?.content).toContain('[お茶 & Café \\[ideas\\]](../cards/');
  });

  it('reports missing image data and exports available revision conflicts', () => {
    const missingImage = createCardFromInput({
      id: 'image-card',
      type: 'image',
      title: 'Missing image',
      blobId: 'unavailable-blob',
    });
    const base = createSyncRevision('card', 'card-1', { title: 'Base' }, 'device-a', [], 1);
    const left = createSyncRevision('card', 'card-1', { title: 'Left' }, 'device-a', [base.id], 2);
    const right = createSyncRevision('card', 'card-1', { title: 'Right' }, 'device-b', [base.id], 2);
    const syncState = applyRevision(applyRevision(applyRevision(createSyncReducerState(), base), left), right);

    const archive = createObsidianExportArchive([missingImage], [], { syncState });
    const conflictFile = archive.files.find((file) => file.path === 'conflicts.json');
    const conflictReport = JSON.parse(String(conflictFile?.content)) as {
      stateIncluded: boolean;
      conflicts: Array<{ entityKey: string; revisions: Array<{ id: string }> }>;
    };
    const reportFile = archive.files.find((file) => file.path === 'export-report.md');

    expect(archive.manifest.missingMedia).toEqual([
      expect.objectContaining({ cardId: 'image-card', blobId: 'unavailable-blob' }),
    ]);
    expect(archive.manifest.conflictCount).toBe(1);
    expect(conflictReport.stateIncluded).toBe(true);
    expect(conflictReport.conflicts).toHaveLength(1);
    expect(conflictReport.conflicts[0]?.entityKey).toBe('card:card-1');
    expect(conflictReport.conflicts[0]?.revisions.map((revision) => revision.id)).toEqual(
      expect.arrayContaining([left.id, right.id]),
    );
    expect(reportFile?.content).toContain('Missing image');
    expect(reportFile?.content).toContain('1 unresolved conflict(s) included');
  });
});

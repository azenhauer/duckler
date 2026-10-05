// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { cardDb, importExtensionBytes } from './cardDb';
import { hashBytes } from '../../../../packages/shared/src/captureProtocol';

const capture = { id: 'capture-atomic-1', kind: 'text', title: 'Original thought', note: 'Save me', createdAt: '2026-10-04T12:00:00Z' };
beforeEach(async () => { await cardDb.cards.clear(); await cardDb.collections.clear(); await cardDb.extensionReceipts.clear(); });
const envelope = async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(capture));
  return { bytes, metadata: { id: capture.id, hash: await hashBytes(bytes), libraryId: 'library-1' } };
};
describe('extension atomic import', () => {
  it('keeps the highlighted note and caption separate and searchable', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...capture, note: 'Original highlighted text', caption: 'My interpretation' }));
    const metadata = { id: capture.id, hash: await hashBytes(bytes), libraryId: 'library-1' };
    await importExtensionBytes(bytes, metadata);
    expect(await cardDb.cards.get(capture.id)).toMatchObject({ note: 'Original highlighted text', caption: 'My interpretation' });
    expect((await cardDb.cards.get(capture.id))?.searchText).toContain('my interpretation');
  });
  it('never stores the autofill page excerpt on the card (I3b zero retention)', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...capture, pageExcerpt: 'Private page text that is only for classification.' }));
    await importExtensionBytes(bytes, { id: capture.id, hash: await hashBytes(bytes), libraryId: 'library-1' });
    const card = await cardDb.cards.get(capture.id);
    expect(card).toBeDefined();
    expect(JSON.stringify(card)).not.toContain('Private page text');
    expect(card?.searchText).not.toContain('private page text');
  });
  it('creates or reuses the named collection and keeps duplicate imports idempotent', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...capture, collectionName: ' Inspiration ' }));
    const metadata = { id: capture.id, hash: await hashBytes(bytes), libraryId: 'library-1' };
    await importExtensionBytes(bytes, metadata);
    await importExtensionBytes(bytes, metadata);
    expect(await cardDb.collections.count()).toBe(1);
    expect((await cardDb.collections.toArray())[0]).toMatchObject({ name: 'Inspiration', cardIds: [capture.id] });
    const second = new TextEncoder().encode(JSON.stringify({ ...capture, id: 'capture-second', collectionName: 'inspiration' }));
    await importExtensionBytes(second, { ...metadata, id: 'capture-second', hash: await hashBytes(second) });
    expect(await cardDb.collections.count()).toBe(1);
    expect((await cardDb.collections.toArray())[0].cardIds).toEqual([capture.id, 'capture-second']);
  });
  it('commits a permanent receipt and preserves edits and trash on duplicate delivery', async () => {
    const { bytes, metadata } = await envelope();
    await Promise.all([importExtensionBytes(bytes, metadata), importExtensionBytes(bytes, metadata)]);
    expect(await cardDb.cards.count()).toBe(1);
    const card = (await cardDb.cards.get(capture.id))!;
    await cardDb.cards.put({ ...card, title: 'Edited later', trashed: true });
    const retry = await importExtensionBytes(bytes, metadata);
    expect(retry.duplicate).toBe(true);
    expect(retry.card).toMatchObject({ title: 'Edited later', trashed: true, capturePayloadHash: metadata.hash });
    expect(await cardDb.extensionReceipts.count()).toBe(1);
  });
  it('retains the receipt after card removal instead of resurrecting it', async () => {
    const { bytes, metadata } = await envelope();
    await importExtensionBytes(bytes, metadata); await cardDb.cards.delete(capture.id);
    await importExtensionBytes(bytes, metadata);
    expect(await cardDb.cards.count()).toBe(0);
  });
  it('rejects a hash mismatch before writing and refuses a conflicting ID', async () => {
    const { bytes, metadata } = await envelope();
    await expect(importExtensionBytes(bytes, { ...metadata, hash: 'wrong' })).rejects.toThrow(/checksum/);
    expect(await cardDb.cards.count()).toBe(0);
    await importExtensionBytes(bytes, metadata);
    const changed = new TextEncoder().encode(JSON.stringify({ ...capture, title: 'Changed payload' }));
    await expect(importExtensionBytes(changed, { ...metadata, hash: await hashBytes(changed) })).rejects.toThrow(/conflicting/);
    expect((await cardDb.cards.get(capture.id))?.title).toBe('Original thought');
  });
  it('rolls back the Card when the receipt write fails, allowing a safe retry', async () => {
    const { bytes, metadata } = await envelope();
    const originalAdd = cardDb.extensionReceipts.add.bind(cardDb.extensionReceipts);
    cardDb.extensionReceipts.add = () => Promise.reject(new Error('Quota exceeded')) as ReturnType<typeof originalAdd>;
    try { await expect(importExtensionBytes(bytes, metadata)).rejects.toThrow(/Quota/); }
    finally { cardDb.extensionReceipts.add = originalAdd; }
    expect(await cardDb.cards.count()).toBe(0);
    await importExtensionBytes(bytes, metadata);
    expect(await cardDb.cards.count()).toBe(1);
  });
});

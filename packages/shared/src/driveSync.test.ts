import { describe, expect, it } from 'vitest';
import { emptyDriveLibrary, mediaFingerprint, mergeLibraries, parseDriveLibrary, toDriveLibrary, type DriveLibrary } from './driveSync';
import { createShareSnapshot, parseShareSnapshot } from './share';
import type { CardRecord, CollectionRecord } from './index';

const t = (minute: number) => new Date(Date.UTC(2026, 9, 6, 12, minute)).toISOString();
const card = (id: string, updatedAt: string, extra: Partial<CardRecord> = {}): CardRecord =>
  ({ id, type: 'text', title: id, note: '', tags: [], createdAt: t(0), updatedAt, trashed: false, searchText: id, ...extra });
const collection = (id: string, cardIds: string[], updatedAt = t(0)): CollectionRecord => ({ id, name: id, description: '', cardIds, createdAt: t(0), updatedAt });
const image = 'data:image/png;base64,' + 'A'.repeat(200);
const otherImage = 'data:image/png;base64,' + 'B'.repeat(300);
const remote = (patch: Partial<DriveLibrary>): DriveLibrary => ({ ...emptyDriveLibrary(), ...patch });
const now = new Date(t(30));

describe('Drive library merge', () => {
  it('uploads a first library: every local record goes to Drive', () => {
    const merged = mergeLibraries({ cards: [card('a', t(1)), card('img', t(1), { type: 'image', dataUrl: image })], collections: [collection('c', ['a'])], tombstones: [] }, emptyDriveLibrary(), now);
    expect(merged.remoteChanged).toBe(true);
    expect(merged.uploads).toEqual(['img']);
    expect(merged.cardsToWrite).toEqual([]);
    const stored = toDriveLibrary(merged);
    expect(stored.cards.find(item => item.id === 'img')).not.toHaveProperty('dataUrl');
  });

  it('takes the newer version of each card, from either side', () => {
    const merged = mergeLibraries(
      { cards: [card('a', t(5), { note: 'local newer' }), card('b', t(1), { note: 'local older' })], collections: [], tombstones: [] },
      remote({ cards: [card('a', t(2), { note: 'remote older' }), card('b', t(3), { note: 'remote newer' })] }), now);
    expect(merged.cards.find(item => item.id === 'a')!.note).toBe('local newer');
    expect(merged.cards.find(item => item.id === 'b')!.note).toBe('remote newer');
    expect(merged.cardsToWrite.map(item => item.id)).toEqual(['b']);
    expect(merged.remoteChanged).toBe(true);
  });

  it('a card deleted on one device is deleted on the others and on Drive, image included', () => {
    const media = { fileId: 'file-img', of: mediaFingerprint(image) };
    // This device deleted it after the last change.
    const here = mergeLibraries({ cards: [], collections: [collection('c', ['img'])], tombstones: [{ id: 'img', kind: 'card', deletedAt: t(10) }] },
      remote({ cards: [{ ...card('img', t(5), { type: 'image' }), media }], collections: [collection('c', ['img'])] }), now);
    expect(here.cards).toEqual([]);
    expect(here.mediaToDelete).toEqual(['file-img']);
    expect(here.collections[0].cardIds).toEqual([]);
    expect(toDriveLibrary(here).tombstones.map(stone => stone.id)).toEqual(['img']);
    // Another device still has it: the deletion reaches it.
    const there = mergeLibraries({ cards: [card('img', t(5), { type: 'image', dataUrl: image })], collections: [], tombstones: [] }, toDriveLibrary(here), now);
    expect(there.cardsToDelete).toEqual(['img']);
    expect(there.cards).toEqual([]);
  });

  it('an edit made after a deletion brings the card back', () => {
    const merged = mergeLibraries({ cards: [card('a', t(20), { note: 'edited later' })], collections: [], tombstones: [] },
      remote({ tombstones: [{ id: 'a', kind: 'card', deletedAt: t(10) }] }), now);
    expect(merged.cards.map(item => item.id)).toEqual(['a']);
    expect(merged.tombstones).toEqual([]);
  });

  it('downloads images that are only on Drive and never deletes them for a missing local copy', () => {
    const media = { fileId: 'file-1', of: mediaFingerprint(image) };
    const merged = mergeLibraries({ cards: [card('img', t(9), { type: 'image', note: 'newer note, image not downloaded yet' })], collections: [], tombstones: [] },
      remote({ cards: [{ ...card('img', t(1), { type: 'image' }), media }] }), now);
    expect(merged.downloads).toEqual(['img']);
    expect(merged.mediaToDelete).toEqual([]);
    expect(toDriveLibrary(merged).cards[0].media).toEqual(media);
  });

  it('a replaced image is uploaded and the old file removed; an unchanged one is not re-sent', () => {
    const old = { fileId: 'file-old', of: mediaFingerprint(image) };
    const replaced = mergeLibraries({ cards: [card('img', t(9), { type: 'image', dataUrl: otherImage })], collections: [], tombstones: [] },
      remote({ cards: [{ ...card('img', t(1), { type: 'image' }), media: old }] }), now);
    expect(replaced.uploads).toEqual(['img']);
    expect(replaced.mediaToDelete).toEqual(['file-old']);
    const unchanged = mergeLibraries({ cards: [card('img', t(1), { type: 'image', dataUrl: image })], collections: [], tombstones: [] },
      remote({ cards: [{ ...card('img', t(1), { type: 'image' }), media: old }] }), now);
    expect(unchanged.uploads).toEqual([]);
    expect(unchanged.downloads).toEqual([]);
    expect(unchanged.remoteChanged).toBe(false);
  });

  it('merges collections by their own updatedAt and keeps deletions for 180 days only', () => {
    const merged = mergeLibraries({ cards: [], collections: [collection('c', [], t(1))], tombstones: [{ id: 'old', kind: 'card', deletedAt: '2025-01-01T00:00:00.000Z' }] },
      remote({ collections: [{ ...collection('c', [], t(4)), name: 'Renamed elsewhere' }] }), now);
    expect(merged.collections[0].name).toBe('Renamed elsewhere');
    expect(merged.collectionsToWrite).toHaveLength(1);
    expect(merged.tombstones).toEqual([]);
  });

  it('parses only well-formed library files', () => {
    const library = toDriveLibrary(mergeLibraries({ cards: [card('a', t(1))], collections: [], tombstones: [] }, emptyDriveLibrary(), now));
    expect(parseDriveLibrary(JSON.stringify(library)).cards[0].id).toBe('a');
    expect(() => parseDriveLibrary(JSON.stringify({ ...library, format: 99 }))).toThrow(/newer Duckler/);
    expect(() => parseDriveLibrary('{"cards": "nope"}')).toThrow();
  });
});

describe('shared collection snapshot', () => {
  const cards = [
    card('note', t(1), { note: 'Plain <b>text</b>', sourceUrl: 'https://example.com/a', tags: ['ref'] }),
    card('pic', t(1), { type: 'image', dataUrl: image, sourceUrl: 'javascript:alert(1)' }),
    card('gone', t(1), { trashed: true }),
  ];
  it('publishes only the collection’s live cards, with safe links', () => {
    const snapshot = createShareSnapshot(collection('Mood', ['note', 'pic', 'gone', 'missing']), cards, 'Paulo', t(2));
    expect(snapshot.cards.map(item => item.title)).toEqual(['note', 'pic']);
    expect(snapshot.cards[1]).not.toHaveProperty('sourceUrl');
    expect(snapshot.cards[1].image).toBe(image);
    expect(JSON.stringify(snapshot)).not.toContain('"id"');
    expect(parseShareSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
  it('rejects anything a viewer should not trust', () => {
    const snapshot = createShareSnapshot(collection('Mood', ['note']), cards, '', t(2));
    const tamper = (patch: Record<string, unknown>) => JSON.stringify({ ...snapshot, cards: [{ ...snapshot.cards[0], ...patch }] });
    expect(() => parseShareSnapshot(tamper({ image: 'data:text/html;base64,PHNjcmlwdD4=' }))).toThrow();
    expect(() => parseShareSnapshot(tamper({ sourceUrl: 'javascript:alert(1)' }))).toThrow();
    expect(() => parseShareSnapshot(tamper({ extra: 'field' }))).toThrow();
    expect(() => parseShareSnapshot(JSON.stringify({ ...snapshot, kind: 'other' }))).toThrow();
  });
});

describe('encrypted share links (Excalidraw scheme)', () => {
  it('round-trips with the key and fails without it', async () => {
    const { createShareKey, encryptShare, decryptShare } = await import('./share');
    const snapshot = createShareSnapshot(collection('Mood', ['a']), [card('a', t(1), { note: 'secret note' })], '', t(2));
    const key = await createShareKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const sealed = await encryptShare(snapshot, key);
    expect(new TextDecoder().decode(sealed)).not.toContain('secret note');
    expect(await decryptShare(sealed, key)).toEqual(snapshot);
    await expect(decryptShare(sealed, await createShareKey())).rejects.toThrow(/does not match/);
    await expect(decryptShare(sealed, 'short')).rejects.toThrow(/incomplete/);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createCardFromInput, createCollectionFromInput } from '@visual-library/shared';
import { activeLibrary, cardDb, libraryIsEmpty, libraryKeyFor, localLibrarySize, readCards, saveCard, saveCollection, switchLibrary } from './cardDb';

const titles = async () => (await readCards()).map(card => card.title).sort();

afterEach(async () => { await switchLibrary(''); await cardDb.cards.clear(); await cardDb.collections.clear(); });

describe('one library per account on a device', () => {
  it('keys accounts by a hash, never the email itself', async () => {
    const key = await libraryKeyFor(' Ana@Example.com ');
    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(key).toBe(await libraryKeyFor('ana@example.com'));
    expect(key).not.toContain('ana');
  });

  it('keeps two accounts apart, and moves the signed-out library only when asked', async () => {
    await saveCard(createCardFromInput({ type: 'text', title: 'Made before signing in' }));
    await saveCollection(createCollectionFromInput({ name: 'Local shelf' }));
    const ana = await libraryKeyFor('ana@example.com'), bea = await libraryKeyFor('bea@example.com');
    expect(await localLibrarySize()).toBe(2);
    expect(await libraryIsEmpty(ana)).toBe(true);

    // Ana signs in first and takes this device's cards with her.
    await switchLibrary(ana, { bringLocal: true });
    expect(activeLibrary()).toBe(ana);
    expect(await titles()).toEqual(['Made before signing in']);
    await saveCard(createCardFromInput({ type: 'text', title: 'Ana only' }));

    // Signed out, then Bea on the same browser: she sees none of Ana's cards.
    await switchLibrary('');
    expect(await titles()).toEqual([]); // moved, not copied
    await switchLibrary(bea);
    expect(await titles()).toEqual([]);
    await saveCard(createCardFromInput({ type: 'text', title: 'Bea only' }));

    // Ana again: her library is still here, without Bea's card.
    await switchLibrary(ana);
    expect(await titles()).toEqual(['Ana only', 'Made before signing in']);

    // Signing out with "remove from this device" deletes Ana's copy here (Drive keeps it).
    await switchLibrary('', { forget: true });
    expect(await libraryIsEmpty(ana)).toBe(true);
    await switchLibrary(bea, {});
    expect(await titles()).toEqual(['Bea only']);
  });
});

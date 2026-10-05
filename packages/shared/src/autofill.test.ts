import {
  AUTOFILL_DEFAULTS, AUTOFILL_MAX_COLLECTIONS, MAX_PROFILE_MEMBERS, MIN_USEFUL_CHARS,
  clipText, collectionProfile, collectionText, cosine, decide, normalizeVector, rankForClip, rejectionKey, usefulTextLength,
  type AutofillInput,
} from './autofill';

const enoughText = 'Lighthouses along the Portuguese coast, photographed at dusk with long exposures.';
const match = (collectionId: string, score: number, strict = false) => ({ collectionId, score, strict });
const input = (ranked: AutofillInput['ranked'], overrides: Partial<AutofillInput> = {}): AutofillInput =>
  ({ cardId: 'card', enabled: true, userChoseCollection: false, freshClip: true, text: enoughText, ranked, rejected: new Set(), ...overrides });

describe('autofill vectors and profiles', () => {
  it('computes cosine similarity safely', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(normalizeVector([3, 4])).toEqual([0.6, 0.8]);
  });

  it('uses only the name for small collections and judges them strictly (D3)', () => {
    const small = collectionProfile('c', [0, 1], [[1, 0], [1, 0]]);
    expect(small.strict).toBe(true);
    expect(small.vector).toEqual([0, 1]);
  });

  it('blends recent member cards (capped) with the name for established collections (D3)', () => {
    const profile = collectionProfile('c', [0, 1], [[1, 0], [1, 0], [1, 0]]);
    expect(profile.strict).toBe(false);
    expect(profile.vector[0]).toBeGreaterThan(profile.vector[1]);
    expect(cosine(profile.vector, [1, 0])).toBeGreaterThan(0.9);
    const many = collectionProfile('c', [1, 0], [...Array(80).fill([0, 1]), ...Array(MAX_PROFILE_MEMBERS).fill([1, 0])]);
    expect(many.memberCount).toBe(MAX_PROFILE_MEMBERS);
    expect(many.vector[1]).toBeCloseTo(0);
  });

  it('ignores the default placeholder description (I7)', () => {
    expect(collectionText('Moodboard', 'User-made collection')).toBe('Moodboard');
    expect(collectionText(' Moodboard ', 'Coastal light studies')).toBe('Moodboard. Coastal light studies');
  });

  it('builds clip text from text fields only and counts useful characters in any language', () => {
    expect(clipText({ title: 'Faróis', sourceUrl: 'https://www.example.pt/a', note: 'Luz  ao  entardecer', caption: '', pageExcerpt: 'Costa' }))
      .toBe('Faróis\nexample.pt\nLuz ao entardecer\nCosta');
    expect(usefulTextLength('Ação · rápida!')).toBe(10);
    expect(usefulTextLength('https://example.com/a/very/long/path ok')).toBe(2);
  });

  it('ranks collections best first, deterministically', () => {
    const ranked = rankForClip([1, 0], [
      { collectionId: 'b', vector: [0.7, 0.7], memberCount: 5, strict: false },
      { collectionId: 'a', vector: [1, 0], memberCount: 5, strict: false },
      { collectionId: 'c', vector: [0, 1], memberCount: 1, strict: true },
    ]);
    expect(ranked.map(item => item.collectionId)).toEqual(['a', 'b', 'c']);
    expect(ranked[2].strict).toBe(true);
  });
});

describe('autofill decisions', () => {
  it('does nothing when the setting is off (I2)', () => {
    expect(decide(input([match('a', 0.9)], { enabled: false }))).toEqual({ status: 'skipped', cardId: 'card', reason: 'disabled' });
  });

  it('never overrides the person: a chosen collection or a non-fresh card means nothing happens (I1)', () => {
    expect(decide(input([match('a', 0.99)], { userChoseCollection: true }))).toMatchObject({ status: 'skipped', reason: 'user-choice' });
    expect(decide(input([match('a', 0.99)], { freshClip: false }))).toMatchObject({ status: 'skipped', reason: 'user-choice' });
  });

  it('stays out of clips with too little text (I6)', () => {
    expect(usefulTextLength('Short title')).toBeLessThan(MIN_USEFUL_CHARS);
    expect(decide(input([match('a', 0.99)], { text: 'Short title https://example.com/page' }))).toMatchObject({ status: 'skipped', reason: 'low-text' });
  });

  it('adds a single clear winner', () => {
    expect(decide(input([match('a', 0.7), match('b', 0.4)]))).toEqual({ status: 'added', cardId: 'card', matches: [{ collectionId: 'a', score: 0.7 }] });
    expect(decide(input([match('a', 0.5)]))).toMatchObject({ status: 'added', matches: [{ collectionId: 'a' }] });
  });

  it('is uncertain under the threshold or without a clear margin (I6)', () => {
    expect(decide(input([match('a', AUTOFILL_DEFAULTS.addThreshold - 0.01), match('b', 0.1)]))).toMatchObject({ reason: 'uncertain' });
    expect(decide(input([match('a', 0.6), match('b', 0.57), match('c', 0.56), match('d', 0.55)]))).toMatchObject({ reason: 'uncertain' });
    expect(decide(input([]))).toMatchObject({ reason: 'uncertain' });
  });

  it('adds a clear leading group of up to three when they all qualify', () => {
    const result = decide(input([match('a', 0.62), match('b', 0.6), match('c', 0.3)]));
    expect(result).toMatchObject({ status: 'added', matches: [{ collectionId: 'a' }, { collectionId: 'b' }] });
    const tooMany = decide(input([match('a', 0.7), match('b', 0.69), match('c', 0.68), match('d', 0.67), match('e', 0.1)]));
    expect(tooMany).toMatchObject({ status: 'skipped', reason: 'uncertain' });
    expect(AUTOFILL_MAX_COLLECTIONS).toBe(3);
  });

  it('requires a higher score for small (strict) collections (D3)', () => {
    const score = AUTOFILL_DEFAULTS.addThreshold + AUTOFILL_DEFAULTS.strictBonus / 2;
    expect(decide(input([match('a', score, true), match('b', 0.1)]))).toMatchObject({ reason: 'uncertain' });
    expect(decide(input([match('a', score, false), match('b', 0.1)]))).toMatchObject({ status: 'added' });
  });

  it('never re-adds a pairing the person undid, and can still pick the next clear option (I5)', () => {
    const rejected = new Set([rejectionKey('card', 'a')]);
    expect(decide(input([match('a', 0.9), match('b', 0.3)], { rejected }))).toMatchObject({ status: 'skipped', reason: 'rejected' });
    expect(decide(input([match('a', 0.9), match('b', 0.7), match('c', 0.2)], { rejected }))).toMatchObject({ status: 'added', matches: [{ collectionId: 'b' }] });
    // A rejection for another card does not apply here.
    expect(decide(input([match('a', 0.9), match('b', 0.3)], { rejected: new Set([rejectionKey('other', 'a')]) }))).toMatchObject({ status: 'added' });
  });
});

// Clip autofill (docs/ai-coop/PROTOCOL.md): when a clip arrives with no collection chosen, add it to
// the best-matching collection(s). Types shared by the extension, the library and the embed Worker.

/** Most collections one clip may be added to automatically (I6). */
export const AUTOFILL_MAX_COLLECTIONS = 3;
/** Upper bound for the page text sent for classification: meta description + first 1500 chars (I3). */
export const MAX_PAGE_EXCERPT = 2000;

/** Why autofill left a clip alone. Every one of these is a silent no-op for the person (I4, I6). */
export type AutofillSkipReason =
  | 'disabled'      // setting off (I2)
  | 'user-choice'   // the capture already had a collection, or the card is not a fresh clip (I1)
  | 'low-text'      // too little useful text to judge (I6)
  | 'uncertain'     // best score under T_ADD, or margin over the runner-up under T_MARGIN (I6)
  | 'rejected'      // the person undid this card/collection pairing before (I5)
  | 'offline' | 'timeout' | 'error'; // service unreachable or slower than 5 s (I4)

export type AutofillMatch = { collectionId: string; score: number };

/** Outcome of one autofill attempt: add-only, never touches anything the person set (I1). */
export type AutofillResult =
  | { status: 'added'; cardId: string; matches: AutofillMatch[] }
  | { status: 'skipped'; cardId: string; reason: AutofillSkipReason };

/** Collapses whitespace and caps page text for classification; non-text or empty input gives undefined. */
export function normalizePageExcerpt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_EXCERPT).trim();
  return text || undefined;
}

// ---------------------------------------------------------------------------------------------
// 1.2: pure ranking and decision rules (no network, no storage). Vectors come from the embedder.
// ---------------------------------------------------------------------------------------------

/** D4 defaults (cosine). Collections with fewer than MIN_MEMBERS cards are judged more strictly (D3). */
export const AUTOFILL_DEFAULTS = { addThreshold: 0.45, margin: 0.08, strictBonus: 0.05 } as const;
export type AutofillThresholds = { addThreshold: number; margin: number; strictBonus: number };
/** Fewer members than this: the profile is name/description only and needs a higher score (D3). */
export const MIN_PROFILE_MEMBERS = 3;
/** Only the most recent member cards shape a collection's profile (D3). */
export const MAX_PROFILE_MEMBERS = 50;
/** Less useful text than this and autofill stays out of it (I6). */
export const MIN_USEFUL_CHARS = 40;
/** The library's default description says nothing about the collection (I7). */
export const PLACEHOLDER_DESCRIPTION = 'User-made collection';

export type Vector = number[];
export type CollectionProfile = { collectionId: string; vector: Vector; memberCount: number; strict: boolean };

export function normalizeVector(vector: Vector): Vector {
  const length = Math.hypot(...vector);
  return length > 0 && Number.isFinite(length) ? vector.map(value => value / length) : vector.map(() => 0);
}

/** Cosine similarity; 0 when either vector is empty, zero or mismatched. */
export function cosine(a: Vector, b: Vector): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

function meanVector(vectors: Vector[]): Vector | undefined {
  const usable = vectors.filter(vector => vector.length && vector.length === vectors[0].length);
  if (!usable.length) return undefined;
  const sum = new Array<number>(usable[0].length).fill(0);
  for (const vector of usable) for (let index = 0; index < vector.length; index += 1) sum[index] += vector[index];
  return sum.map(value => value / usable.length);
}

/** Text that describes a collection for embedding; the default placeholder description is ignored (I7). */
export function collectionText(name: string, description = ''): string {
  const about = description.trim() === PLACEHOLDER_DESCRIPTION ? '' : description.trim();
  return about ? `${name.trim()}. ${about}` : name.trim();
}

/**
 * D3: profile = normalize(mean of the last MAX_PROFILE_MEMBERS member embeddings) blended with the
 * embedding of the collection's name + description. Fewer than MIN_PROFILE_MEMBERS members: name
 * and description only, and the collection is judged strictly.
 */
export function collectionProfile(collectionId: string, nameVector: Vector, memberVectors: Vector[]): CollectionProfile {
  const recent = memberVectors.slice(-MAX_PROFILE_MEMBERS);
  const strict = recent.length < MIN_PROFILE_MEMBERS;
  const members = strict ? undefined : meanVector(recent.map(normalizeVector));
  const name = normalizeVector(nameVector);
  const vector = members && members.length === name.length
    ? normalizeVector(members.map((value, index) => value * 0.75 + name[index] * 0.25))
    : name;
  return { collectionId, vector, memberCount: recent.length, strict };
}

/** What a clip says about itself, for embedding (I3: text fields only, never images). */
export function clipText(clip: { title?: string; sourceUrl?: string; note?: string; caption?: string; pageExcerpt?: string }): string {
  let domain = '';
  try { domain = clip.sourceUrl ? new URL(clip.sourceUrl).hostname.replace(/^www\./, '') : ''; } catch { /* No domain. */ }
  return [clip.title, domain, clip.note, clip.caption, clip.pageExcerpt].map(part => (part ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Letters and digits (any language, so PT accents count) outside URLs: how much there is to judge (I6). */
export function usefulTextLength(text: string): number {
  return (text.replace(/https?:\/\/\S+/g, ' ').match(/[\p{L}\p{N}]/gu) ?? []).length;
}

export const rejectionKey = (cardId: string, collectionId: string) => `${cardId}:${collectionId}`;

/** All collections ranked for a clip, best first. */
export function rankForClip(clipVector: Vector, profiles: CollectionProfile[]): (AutofillMatch & { strict: boolean })[] {
  return profiles
    .map(profile => ({ collectionId: profile.collectionId, score: cosine(clipVector, profile.vector), strict: profile.strict }))
    .sort((a, b) => b.score - a.score || a.collectionId.localeCompare(b.collectionId));
}

export type AutofillInput = {
  cardId: string;
  enabled: boolean;
  /** The capture arrived with any collection chosen by the person (I1). */
  userChoseCollection: boolean;
  /** The card is a just-received clip, not an older or edited card (I1). */
  freshClip: boolean;
  text: string;
  ranked: (AutofillMatch & { strict: boolean })[];
  /** rejectionKey(cardId, collectionId) for every pairing the person undid (I5). */
  rejected: ReadonlySet<string>;
  thresholds?: AutofillThresholds;
};

/**
 * Decides which collections (if any) a clip joins. Add-only and conservative: it picks the smallest
 * top group (1..AUTOFILL_MAX_COLLECTIONS) whose members all clear the add threshold and that leads the
 * next candidate by at least the margin. Anything less clear is "uncertain" and does nothing (I6).
 */
export function decide(input: AutofillInput): AutofillResult {
  const { cardId } = input;
  const skip = (reason: AutofillSkipReason): AutofillResult => ({ status: 'skipped', cardId, reason });
  if (!input.enabled) return skip('disabled');
  if (input.userChoseCollection || !input.freshClip) return skip('user-choice');
  if (usefulTextLength(input.text) < MIN_USEFUL_CHARS) return skip('low-text');
  const t = input.thresholds ?? AUTOFILL_DEFAULTS;
  const candidates = input.ranked.filter(match => !input.rejected.has(rejectionKey(cardId, match.collectionId)));
  const passes = (match: AutofillMatch & { strict: boolean }) => match.score >= t.addThreshold + (match.strict ? t.strictBonus : 0);
  for (let size = 1; size <= AUTOFILL_MAX_COLLECTIONS && size <= candidates.length; size += 1) {
    const group = candidates.slice(0, size);
    if (!group.every(passes)) break;
    const next = candidates[size]?.score ?? -1;
    if (group[size - 1].score - next >= t.margin) {
      return { status: 'added', cardId, matches: group.map(({ collectionId, score }) => ({ collectionId, score })) };
    }
  }
  // Nothing clear enough. If the overall best match was one the person already undid, say so.
  const best = input.ranked[0];
  if (best && input.rejected.has(rejectionKey(cardId, best.collectionId)) && passes(best)) return skip('rejected');
  return skip('uncertain');
}

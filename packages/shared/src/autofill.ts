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

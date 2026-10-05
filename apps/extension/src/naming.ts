/** What the page told us about a captured region; every field is untrusted page text. */
export type RegionHint = { subject?: unknown; pageTitle?: unknown; ogTitle?: unknown; siteName?: unknown; host?: unknown };

// Control, zero-width, line/paragraph separator and bidi override characters (built from code points).
const INVISIBLE = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]]
  .map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`, 'g');
const text = (value: unknown, max = 300) => typeof value === 'string'
  ? value.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const squash = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The excerpt is a title; the complete selection remains in the note body. */
export function selectionTitle(selection: string): string {
  return shorten(text(selection), 60) || 'Saved text';
}

/** Trims to a word boundary so names never end mid-word. */
export function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  if (/\s/.test(value[max - 1])) return `${cut.trimEnd()}…`;
  return `${cut.replace(/\s+\S*$/, '') || cut}…`;
}

/** "(3) Pricing — Stripe" → "Pricing": drops notification counts and a trailing site-name segment. */
export function cleanPageTitle(title: string, siteName = '', host = ''): string {
  let result = text(title).replace(/^\(\d+\+?\)\s*/, '');
  // "www.bbc.co.uk" → "bbc": drop www, the TLD and a second-level suffix such as co/com/org.
  const labels = host.replace(/^www\./, '').split('.');
  if (labels.length > 1) labels.pop();
  if (labels.length > 1 && /^(co|com|org|net|gov|ac|edu)$/.test(labels[labels.length - 1])) labels.pop();
  const site = squash(siteName), domain = squash(labels[labels.length - 1] ?? '');
  const parts = result.split(/\s+[|·•–—-]\s+/);
  if (parts.length > 1) {
    const last = squash(parts[parts.length - 1]), first = squash(parts[0]);
    // Short names only count on an exact match, so "X" doesn't strip every segment containing an x.
    const like = (segment: string, name: string) => !!name && (segment === name || (name.length >= 3 && segment.length >= 3 && (segment.includes(name) || name.includes(segment))));
    const isSite = (segment: string) => !!segment && (like(segment, site) || like(segment, domain));
    if (isSite(last)) result = parts.slice(0, -1).join(' — ');
    else if (isSite(first)) result = parts.slice(1).join(' — ');
  }
  return result.trim();
}

/**
 * Names a region screenshot from what the page says about it: the most prominent text inside the
 * selection (a heading, caption or image alt), otherwise the page's own title, plus the site.
 */
export function screenshotTitle(hint: RegionHint | undefined, tabTitle = ''): string {
  const host = text(hint?.host, 120).replace(/^www\./, '');
  const siteName = text(hint?.siteName, 80);
  const site = siteName || host;
  const page = cleanPageTitle(text(hint?.ogTitle) || text(hint?.pageTitle) || text(tabTitle), siteName, host);
  const subject = text(hint?.subject, 200);
  const main = subject && squash(subject).length >= 3 ? subject : page;
  if (!main) return site || 'Captured area';
  const named = shorten(main, 90);
  return site && !squash(named).includes(squash(site)) ? `${named} · ${site}` : named;
}

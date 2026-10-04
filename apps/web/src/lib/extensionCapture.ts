export type ExtensionCapture = {
  id: string;
  kind: 'bookmark' | 'text' | 'image' | 'screenshot';
  title: string;
  sourceUrl?: string;
  note?: string;
  payload?: string;
  tags?: string[];
  collectionName?: string;
  createdAt?: string;
};

export const parseExtensionCapture = (raw: string | null): ExtensionCapture | null => {
  if (!raw) return null;
  if (raw.length > 1_800_000) throw new Error('The captured item is too large to import.');

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('The extension capture link is invalid.');
  }

  if (!value || typeof value !== 'object') throw new Error('The extension capture is invalid.');
  const capture = value as Record<string, unknown>;
  const allowedKinds = ['bookmark', 'text', 'image', 'screenshot'];
  if (
    typeof capture.id !== 'string' ||
    !capture.id ||
    capture.id.length > 200 ||
    typeof capture.title !== 'string' ||
    !capture.title.trim() ||
    capture.title.length > 1000 ||
    typeof capture.kind !== 'string' ||
    !allowedKinds.includes(capture.kind)
  ) {
    throw new Error('The extension capture is missing required fields.');
  }

  const sourceUrl = typeof capture.sourceUrl === 'string' ? capture.sourceUrl : undefined;
  if (sourceUrl) {
    let url: URL;
    try {
      url = new URL(sourceUrl);
    } catch {
      throw new Error('The extension capture has an invalid source URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('The extension capture source must use HTTP or HTTPS.');
    }
  }

  const note = typeof capture.note === 'string' ? capture.note : undefined;
  const payload = typeof capture.payload === 'string' ? capture.payload : undefined;
  const tags = Array.isArray(capture.tags)
    ? capture.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 100)
    : undefined;
  const collectionName = typeof capture.collectionName === 'string' ? capture.collectionName.trim().slice(0, 120) : undefined;
  if (note && note.length > 100_000) throw new Error('The extension capture note is too large.');
  if (payload && payload.length > 1_500_000) throw new Error('The extension capture image is too large.');
  if ((capture.kind === 'image' || capture.kind === 'screenshot') && payload && !/^data:image\/(png|jpeg|webp);base64,/i.test(payload)) {
    throw new Error('The extension capture image format is not supported.');
  }

  return {
    id: capture.id,
    kind: capture.kind as ExtensionCapture['kind'],
    title: capture.title.trim(),
    sourceUrl,
    note,
    payload,
    tags,
    collectionName,
    createdAt: typeof capture.createdAt === 'string' ? capture.createdAt : undefined,
  };
};

import { z } from 'zod';
export * from './canvas';
export * from './backup';
export * from './obsidianCanvas';
export * from './autofill';

export const cardTypeSchema = z.enum(['bookmark', 'text', 'image', 'pdf']);

/** Text extracted from a card image, bound to the exact image bytes it came from. */
export const ocrTextSchema = z.object({
  text: z.string().max(200000),
  sourceHash: z.string().min(1).max(200),
  languages: z.array(z.string().min(1).max(10)).max(4),
  engine: z.string().max(40),
  engineVersion: z.string().max(40),
  createdAt: z.string(),
  editedByUser: z.boolean(),
});
export type OcrText = z.infer<typeof ocrTextSchema>;

/** A PDF stored with its card: original bytes as a data URL, page count and any embedded text. */
export const pdfDocumentSchema = z.object({
  fileName: z.string().max(300),
  pageCount: z.number().int().min(1).max(10000),
  data: z.string().regex(/^data:application\/pdf;base64,[a-z0-9+/=\s]+$/i),
  text: z.string().max(500000).default(''),
});
export type PdfDocument = z.infer<typeof pdfDocumentSchema>;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
/** True when the bytes start with the %PDF file signature. */
export const hasPdfSignature = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
export type CardType = z.infer<typeof cardTypeSchema>;

export const cardSchema = z.object({
  id: z.string().min(1),
  type: cardTypeSchema,
  title: z.string().min(1),
  note: z.string().default(''),
  caption: z.string().max(10000).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string().min(1)).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  dataUrl: z.string().optional(),
  blobId: z.string().optional(),
  capturePayloadHash: z.string().optional(),
  trashed: z.boolean().default(false),
  searchText: z.string().default(''),
  /** Optional card colour (#rrggbb) chosen in the editor; absent means the global card style. */
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  ocr: ocrTextSchema.optional(),
  pdf: pdfDocumentSchema.optional(),
  /** Provenance for an image captured from a PDF page in the same library. */
  source: z.object({ pdfCardId: z.string().min(1), page: z.number().int().min(1), fileName: z.string().max(300).optional() }).optional(),
  /** Cards connected to this one (stored on both sides); shown as a dialogue of message boxes. */
  links: z.array(z.object({ cardId: z.string().min(1).max(200), createdAt: z.string().max(40) })).max(500).optional(),
});

export type CardRecord = z.infer<typeof cardSchema>;

export type CreateCardInput = {
  id?: string;
  type: CardType;
  title: string;
  note?: string;
  caption?: string;
  sourceUrl?: string;
  tags?: string[];
  dataUrl?: string;
  blobId?: string;
  trashed?: boolean;
};

export const createCardInputSchema = z.object({
  id: z.string().min(1).optional(),
  type: cardTypeSchema,
  title: z.string().min(1),
  note: z.string().optional().default(''),
  caption: z.string().max(10000).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string().min(1)).optional().default([]),
  dataUrl: z.string().optional(),
  blobId: z.string().optional(),
  trashed: z.boolean().optional().default(false),
});

export const collectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().default(''),
  cardIds: z.array(z.string().min(1)).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Parent collection for one level of nesting. Parents are always top-level. */
  parentId: z.string().min(1).optional(),
});

export type CollectionRecord = z.infer<typeof collectionSchema>;

/** Why a collection cannot move under `parentId`, or null when the move is allowed (one nesting level, no cycles). */
export const collectionParentError = (collections: Pick<CollectionRecord, 'id' | 'parentId'>[], id: string, parentId: string | null): string | null => {
  if (parentId === null) return null;
  if (parentId === id) return 'A collection cannot contain itself';
  const parent = collections.find(item => item.id === parentId);
  if (!parent) return 'Collection no longer exists';
  if (parent.parentId) return 'Collections can only be nested one level deep';
  if (collections.some(item => item.parentId === id)) return 'A collection with sub-collections cannot be nested';
  return null;
};

/** Removes parent links that are missing, self-referencing or deeper than one level (used after restore or sync). */
export const normalizeCollectionHierarchy = <T extends Pick<CollectionRecord, 'id' | 'parentId'>>(collections: T[]): T[] => {
  const byId = new Map(collections.map(item => [item.id, item]));
  return collections.map(item => {
    if (!item.parentId) return item;
    const parent = byId.get(item.parentId);
    const valid = parent && parent.id !== item.id && !parent.parentId;
    if (valid) return item;
    const { parentId: _dropped, ...rest } = item;
    return rest as T;
  });
};

/** Top-level collections each followed by their children, for tree display and export order. */
export const orderCollectionTree = <T extends Pick<CollectionRecord, 'id' | 'parentId'>>(collections: T[]): { collection: T; depth: 0 | 1 }[] => {
  const roots = collections.filter(item => !item.parentId || !collections.some(other => other.id === item.parentId));
  return roots.flatMap(root => [{ collection: root, depth: 0 as const }, ...collections.filter(item => item.parentId === root.id).map(child => ({ collection: child, depth: 1 as const }))]);
};

export type CreateCollectionInput = {
  id?: string;
  name: string;
  description?: string;
  cardIds?: string[];
};

export const createCollectionInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  description: z.string().optional().default(''),
  cardIds: z.array(z.string().min(1)).optional().default([]),
});

export const captureQueueItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['bookmark', 'text', 'image', 'screenshot']),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  title: z.string().min(1).default('Captured item'),
  note: z.string().optional().default(''),
  status: z.enum(['queued', 'received', 'saved', 'failed']).default('queued'),
  createdAt: z.string(),
  payload: z.string().optional().default(''),
});

export type CaptureQueueItem = z.infer<typeof captureQueueItemSchema>;

export const enqueueCapture = (
  capture: Partial<Omit<CaptureQueueItem, 'id' | 'createdAt'>> & {
    id?: string;
    createdAt?: string;
    kind?: CaptureQueueItem['kind'];
    title?: string;
    sourceUrl?: string;
    note?: string;
    status?: CaptureQueueItem['status'];
    payload?: string;
  },
): CaptureQueueItem => {
  const item = captureQueueItemSchema.parse({
    kind: capture.kind ?? 'bookmark',
    title: capture.title ?? 'Queued capture',
    sourceUrl: capture.sourceUrl ?? '',
    note: capture.note ?? '',
    status: capture.status ?? 'queued',
    payload: capture.payload ?? '',
    id: capture.id ?? crypto.randomUUID(),
    createdAt: capture.createdAt ?? new Date().toISOString(),
  });

  return item;
};

export const acknowledgeCapture = (queue: CaptureQueueItem[], itemId: string, nextStatus: CaptureQueueItem['status'] = 'received'): CaptureQueueItem[] =>
  queue.map((item) => (item.id === itemId ? { ...item, status: nextStatus } : item));

export type CaptureReceipt = {
  id: string;
  queueItemId: string;
  status: 'accepted' | 'saved';
  receivedAt: string;
};

export const createCaptureReceipt = (
  queueItemId: string,
  status: CaptureReceipt['status'] = 'accepted',
  receivedAt = new Date().toISOString(),
): CaptureReceipt => ({
  id: crypto.randomUUID(),
  queueItemId,
  status,
  receivedAt,
});

export const syncBatchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  cardIds: z.array(z.string().min(1)).default([]),
  status: z.enum(['pending', 'applied']).default('pending'),
});

export type SyncBatch = z.infer<typeof syncBatchSchema>;

export const createSyncBatch = (cardIds: string[], id = crypto.randomUUID(), createdAt = new Date().toISOString()): SyncBatch =>
  syncBatchSchema.parse({ id, createdAt, cardIds, status: 'pending' });

export const applySyncBatch = (state: string[], incoming: SyncBatch): string[] => {
  const merged = new Set([...state, ...incoming.cardIds]);
  return Array.from(merged).sort();
};

export type SyncEntityType = 'card' | 'collection' | 'membership' | 'canvas' | 'placement';

export type SyncRevision = {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  parentIds: string[];
  deviceId: string;
  logicalTime: number;
  updatedAt: string;
  deleted: boolean;
  value: Record<string, unknown>;
};

export type SyncReducerState = {
  seen: Set<string>;
  heads: Record<string, string[]>;
  entities: Record<string, SyncRevision>;
  conflicts: Record<string, string[]>;
};

export const createSyncReducerState = (): SyncReducerState => ({
  seen: new Set(),
  heads: {},
  entities: {},
  conflicts: {},
});

export const getEntityKey = (entityType: SyncEntityType, entityId: string): string => `${entityType}:${entityId}`;

export const createSyncRevision = (
  entityType: SyncEntityType,
  entityId: string,
  value: Record<string, unknown>,
  deviceId: string,
  parentIds: string[] = [],
  logicalTime = 1,
  updatedAt = new Date().toISOString(),
  deleted = false,
  id = crypto.randomUUID(),
): SyncRevision => ({
  id,
  entityType,
  entityId,
  parentIds,
  deviceId,
  logicalTime,
  updatedAt,
  deleted,
  value,
});

export const chooseVisibleRevision = (revisionIds: string[], all: Record<string, SyncRevision>): string | null => {
  if (revisionIds.length === 0) {
    return null;
  }

  return [...revisionIds].sort((left, right) => {
    const leftRevision = all[left];
    const rightRevision = all[right];

    if (!leftRevision || !rightRevision) {
      return left.localeCompare(right);
    }

    if (leftRevision.logicalTime !== rightRevision.logicalTime) {
      return leftRevision.logicalTime - rightRevision.logicalTime;
    }

    if (leftRevision.updatedAt !== rightRevision.updatedAt) {
      return leftRevision.updatedAt.localeCompare(rightRevision.updatedAt);
    }

    return left.localeCompare(right);
  }).at(-1) ?? null;
};

export const applyRevision = (state: SyncReducerState, revision: SyncRevision): SyncReducerState => {
  const nextState: SyncReducerState = {
    seen: new Set(state.seen),
    heads: { ...state.heads },
    entities: { ...state.entities },
    conflicts: { ...state.conflicts },
  };

  if (nextState.seen.has(revision.id)) {
    return nextState;
  }

  nextState.seen.add(revision.id);
  nextState.entities[revision.id] = revision;

  const entityKey = getEntityKey(revision.entityType, revision.entityId);
  const currentHeads = nextState.heads[entityKey] ?? [];
  const nextHeads = new Set(currentHeads);

  if (currentHeads.length === 0) {
    nextHeads.add(revision.id);
  } else if (currentHeads.some((headId) => revision.parentIds.includes(headId))) {
    for (const headId of currentHeads) {
      nextHeads.delete(headId);
    }
    nextHeads.add(revision.id);
  } else {
    nextHeads.add(revision.id);
  }

  const nextHeadList = Array.from(nextHeads).sort((left, right) => {
    const leftRevision = nextState.entities[left];
    const rightRevision = nextState.entities[right];
    if (!leftRevision || !rightRevision) {
      return left.localeCompare(right);
    }
    if (leftRevision.logicalTime !== rightRevision.logicalTime) {
      return leftRevision.logicalTime - rightRevision.logicalTime;
    }
    return left.localeCompare(right);
  });

  nextState.heads[entityKey] = nextHeadList;
  const conflicted = nextHeadList.length > 1;
  nextState.conflicts[entityKey] = conflicted ? nextHeadList : [];

  return nextState;
};

export type UploadJob = {
  id: string;
  type: 'media' | 'batch' | 'backup';
  state: 'pending' | 'uploading' | 'retry' | 'confirmed' | 'blocked';
  driveFileId?: string;
  contentHash: string;
  attempts: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
};

export const createUploadJob = (
  type: UploadJob['type'],
  contentHash: string,
  id = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): UploadJob => ({
  id,
  type,
  state: 'pending',
  contentHash,
  attempts: 0,
  nextAttemptAt: createdAt,
});

export const advanceUploadJob = (job: UploadJob, nextState: UploadJob['state'], errorCode?: string): UploadJob => ({
  ...job,
  state: nextState,
  attempts: job.attempts + 1,
  nextAttemptAt: new Date().toISOString(),
  lastErrorCode: errorCode,
});

export type SyncCursorState = {
  cursor: number;
  inventory: string[];
  pending: string[];
};

export const createSyncCursorState = (cursor = 0, inventory: string[] = []): SyncCursorState => ({
  cursor,
  inventory: Array.from(new Set(inventory)),
  pending: [],
});

export const advanceSyncCursor = (state: SyncCursorState, nextCursor: number, newInventory: string[] = []): SyncCursorState => ({
  cursor: Math.max(state.cursor, nextCursor),
  inventory: Array.from(new Set([...state.inventory, ...newInventory])),
  pending: [...new Set(state.pending)],
});

export const queueSyncInventory = (state: SyncCursorState, newInventory: string[]): SyncCursorState => ({
  ...state,
  inventory: Array.from(new Set([...state.inventory, ...newInventory])),
  pending: Array.from(new Set([...state.pending, ...newInventory])),
});

export const createDriveStatus = (connected: boolean, syncState: string[]) => ({
  connected,
  syncState: Array.from(new Set(syncState)).sort(),
});

export const dedupeQueueItems = (queue: CaptureQueueItem[]): CaptureQueueItem[] => {
  const seen = new Map<string, CaptureQueueItem>();

  for (const item of queue) {
    const signature = `${item.kind}:${item.title}:${item.sourceUrl ?? ''}:${item.payload ?? ''}`;
    if (!seen.has(signature)) {
      seen.set(signature, item);
    }
  }

  return Array.from(seen.values());
};

export const normalizeSourceUrl = (rawSourceUrl?: string): string => {
  const trimmed = typeof rawSourceUrl === 'string' ? rawSourceUrl.trim() : '';
  if (!trimmed) {
    return '';
  }

  const candidates = [trimmed, trimmed.startsWith('www.') ? `https://${trimmed}` : ''];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const normalized = parsed.toString();
        return normalized === `${parsed.origin}/` ? parsed.origin : normalized;
      }
    } catch {
      // Fall through so bare hostnames like example.com are converted below.
    }

    if (/^(?:localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
      return new URL(`https://${trimmed}`).toString();
    }
  }

  return '';
};

export const normalizeTags = (rawTags: string[] = []): string[] =>
  Array.from(
    new Set(
      rawTags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.toLowerCase()),
    ),
  );

export const normalizeCardIds = (cardIds: string[] = []): string[] =>
  Array.from(new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean)));

export const toggleCardInCollection = (collection: Pick<CollectionRecord, 'cardIds'>, cardId: string): string[] => {
  const nextIds = normalizeCardIds(collection.cardIds);
  return nextIds.includes(cardId)
    ? nextIds.filter((id) => id !== cardId)
    : [...nextIds, cardId];
};

export const buildSearchText = (card: Pick<CardRecord, 'title' | 'note' | 'sourceUrl' | 'tags'> & Partial<Pick<CardRecord, 'ocr' | 'pdf' | 'dataUrl' | 'caption'>>): string =>
  [card.title, card.note, card.caption ?? '', card.sourceUrl ?? '', ...card.tags, ocrIsCurrent(card) ? card.ocr!.text : '', card.pdf?.text.slice(0, 200000) ?? '']
    .join(' ')
    .toLowerCase();

/** Cheap, stable fingerprint of a data URL (FNV-1a over length + sampled chars) used to tie OCR to its image. */
export const mediaFingerprint = (dataUrl: string): string => {
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(dataUrl.length / 4096));
  for (let index = 0; index < dataUrl.length; index += step) { hash ^= dataUrl.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return `${dataUrl.length.toString(36)}-${hash.toString(36)}`;
};

/** OCR text only counts as current while the image it came from is unchanged. */
export const ocrIsCurrent = (card: Partial<Pick<CardRecord, 'ocr' | 'dataUrl'>>): boolean =>
  Boolean(card.ocr && card.dataUrl && card.ocr.sourceHash === mediaFingerprint(card.dataUrl));

export const createCardFromInput = (input: CreateCardInput): CardRecord => {
  const now = new Date().toISOString();
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => tag.trim()).filter(Boolean)
    : [];

  const normalized = createCardInputSchema.parse({
    ...input,
    title: input.title.trim(),
    note: input.note?.trim() ?? '',
    sourceUrl,
    tags,
  });

  return {
    id: normalized.id ?? crypto.randomUUID(),
    type: normalized.type,
    title: normalized.title,
    note: normalized.note,
    caption: normalized.caption,
    sourceUrl: normalized.sourceUrl || undefined,
    tags: normalizeTags(normalized.tags),
    createdAt: now,
    updatedAt: now,
    dataUrl: normalized.dataUrl,
    blobId: normalized.blobId,
    trashed: normalized.trashed,
    searchText: buildSearchText({
      title: normalized.title,
      note: normalized.note,
      caption: normalized.caption,
      sourceUrl: normalized.sourceUrl || undefined,
      tags: normalizeTags(normalized.tags),
    }),
  };
};

export const createCollectionFromInput = (input: CreateCollectionInput): CollectionRecord => {
  const now = new Date().toISOString();
  const normalized = createCollectionInputSchema.parse(input);

  return {
    id: normalized.id ?? crypto.randomUUID(),
    name: normalized.name.trim(),
    description: normalized.description,
    cardIds: normalizeCardIds(normalized.cardIds),
    createdAt: now,
    updatedAt: now,
  };
};

export const exportLibrary = (cards: CardRecord[], collections: CollectionRecord[] = []) =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      cards,
      collections,
    },
    null,
    2,
  );

const sanitizeObsidianFileStem = (value: string): string => {
  const normalized = value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return normalized || 'untitled';
};

const encodeObsidianPathSegment = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const decodeImageDataUrl = (dataUrl: string): { extension: string; bytes: Uint8Array } | null => {
  const match = dataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { extension: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
};

const decodeBase64DataUrl = (dataUrl: string): Uint8Array | null => {
  try {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch { return null; }
};

const toYamlList = (values: string[]): string => values.map((item) => `  - ${JSON.stringify(item)}`).join('\n');

const escapeMarkdownText = (value: string): string => value
  .replace(/\\/g, '\\\\')
  .replace(/([`*_{}\x5B\x5D<>()#+\-.!|])/g, '\\$1')
  .replace(/\r?\n/g, ' ');

export type ObsidianExportFile = {
  path: string;
  content: string | Uint8Array;
};

export type ObsidianExportOptions = {
  syncState?: SyncReducerState;
};

export type ObsidianExportArchive = {
  exportedAt: string;
  manifest: {
    version: number;
    exportedAt: string;
    totalCards: number;
    totalCollections: number;
    generatedBy: string;
    cards: Array<{ id: string; title: string; type: string; file: string; tags: string[]; }>;
    collections: Array<{ id: string; name: string; file: string; cardCount: number; }>;
    missingMedia: Array<{ cardId: string; title: string; blobId?: string; reason: string; }>;
    unresolvedCollectionMembers: Array<{ collectionId: string; name: string; cardIds: string[]; }>;
    conflictCount: number | null;
    conflictStateIncluded: boolean;
  };
  files: ObsidianExportFile[];
};

export const createObsidianExportArchive = (
  cards: CardRecord[],
  collections: CollectionRecord[] = [],
  options: ObsidianExportOptions = {},
): ObsidianExportArchive => {
  const exportedAt = new Date().toISOString();
  const activeCards = cards.filter((card) => !card.trashed);
  const cardManifest: ObsidianExportArchive['manifest']['cards'] = [];
  const collectionManifest: ObsidianExportArchive['manifest']['collections'] = [];
  const missingMedia: ObsidianExportArchive['manifest']['missingMedia'] = [];
  const unresolvedCollectionMembers: ObsidianExportArchive['manifest']['unresolvedCollectionMembers'] = [];
  const files: ObsidianExportFile[] = [];
  const activeCardsById = new Map(activeCards.map((card) => [card.id, card]));

  for (const card of activeCards) {
    const fileStem = sanitizeObsidianFileStem(card.title || 'untitled-card');
    const fileName = `${fileStem}--${encodeObsidianPathSegment(card.id)}.md`;
    const filePath = `cards/${fileName}`;
    const tags = card.tags ?? [];
    const imageData = (card.type === 'image' || card.type === 'pdf') && card.dataUrl ? decodeImageDataUrl(card.dataUrl) : null;
    const pdfBytes = card.type === 'pdf' && card.pdf ? decodeBase64DataUrl(card.pdf.data) : null;
    const pdfPath = pdfBytes ? `attachments/${fileStem}--${encodeObsidianPathSegment(card.id)}.pdf` : undefined;
    if (pdfPath && pdfBytes) files.push({ path: pdfPath, content: pdfBytes });
    const attachmentPath = imageData
      ? `attachments/${fileStem}--${encodeObsidianPathSegment(card.id)}.${imageData.extension}`
      : undefined;

    if (attachmentPath && imageData) {
      files.push({ path: attachmentPath, content: imageData.bytes });
    } else if (card.type === 'image') {
      missingMedia.push({
        cardId: card.id,
        title: card.title,
        blobId: card.blobId,
        reason: card.dataUrl
          ? 'The image data is not a valid base64 image data URL.'
          : card.blobId
            ? 'The referenced image blob is not available to the exporter.'
            : 'The card has no image data.',
      });
    }

    cardManifest.push({
      id: card.id,
      title: card.title,
      type: card.type,
      file: filePath,
      tags,
    });

    const frontMatter = [
      '---',
      `id: ${JSON.stringify(card.id)}`,
      `type: ${JSON.stringify(card.type)}`,
      `created_at: ${JSON.stringify(card.createdAt)}`,
      `updated_at: ${JSON.stringify(card.updatedAt)}`,
      `source_url: ${card.sourceUrl ? JSON.stringify(card.sourceUrl) : '""'}`,
      `page_title: ${JSON.stringify(card.title)}`,
      ...(tags.length > 0 ? ['tags:', toYamlList(tags)] : ['tags: []']),
      '---',
      '',
      `# ${escapeMarkdownText(card.title)}`,
      '',
    ].join('\n');

    const bodyParts: string[] = [];
    if (attachmentPath) {
      bodyParts.push(`![${escapeMarkdownText(card.title)}](../${attachmentPath})`);
    }
    if (card.sourceUrl) {
      bodyParts.push(`Source: ${card.sourceUrl}`);
    }
    if (pdfPath) {
      bodyParts.push(`PDF: [${escapeMarkdownText(card.pdf?.fileName ?? card.title)}](../${pdfPath}) (${card.pdf?.pageCount ?? '?'} pages)`);
    }
    if (card.source) {
      bodyParts.push(`Captured from page ${card.source.page}${card.source.fileName ? ` of ${escapeMarkdownText(card.source.fileName)}` : ''}`);
    }
    const connected = (card.links ?? []).map(link => activeCardsById.get(link.cardId)).filter((item): item is CardRecord => Boolean(item));
    if (connected.length) {
      bodyParts.push(`Connected: ${connected.map(item => `[${escapeMarkdownText(item.title)}](${sanitizeObsidianFileStem(item.title || 'untitled-card')}--${encodeObsidianPathSegment(item.id)}.md)`).join(', ')}`);
    }
    if (card.note) {
      bodyParts.push('', card.note);
    }
    if (card.ocr && ocrIsCurrent(card) && card.ocr.text.trim()) {
      bodyParts.push('', '## Text in image (OCR)', '', `> Extracted with ${card.ocr.engine} (${card.ocr.languages.join(', ')})${card.ocr.editedByUser ? ', edited' : ''}. Text recognition can contain mistakes.`, '', card.ocr.text);
    }

    files.push({
      path: filePath,
      content: `${frontMatter}${bodyParts.join('\n')}\n`,
    });
  }

  for (const collection of collections) {
    const fileStem = sanitizeObsidianFileStem(collection.name || 'untitled-collection');
    const fileName = `${fileStem}--${encodeObsidianPathSegment(collection.id)}.md`;
    const filePath = `collections/${fileName}`;
    const exportedMemberIds = collection.cardIds.filter((cardId) => activeCardsById.has(cardId));
    const unresolvedCardIds = collection.cardIds.filter((cardId) => !activeCardsById.has(cardId));
    if (unresolvedCardIds.length > 0) {
      unresolvedCollectionMembers.push({
        collectionId: collection.id,
        name: collection.name,
        cardIds: unresolvedCardIds,
      });
    }
    const memberLinks = exportedMemberIds
      .map((cardId) => {
        const card = activeCardsById.get(cardId);
        if (!card) return null;
        const cardFile = cardManifest.find((entry) => entry.id === card.id)?.file ?? `cards/${sanitizeObsidianFileStem(card.title || 'untitled-card')}--${encodeObsidianPathSegment(card.id)}.md`;
        return `- [${escapeMarkdownText(card.title)}](../${cardFile})`;
      })
      .filter((link): link is string => link !== null)
      .join('\n');

    collectionManifest.push({
      id: collection.id,
      name: collection.name,
      file: filePath,
      cardCount: exportedMemberIds.length,
    });

    files.push({
      path: filePath,
      content: [
        '---',
        `id: ${JSON.stringify(collection.id)}`,
        `name: ${JSON.stringify(collection.name)}`,
        '---',
        '',
        `# ${escapeMarkdownText(collection.name)}`,
        '',
        memberLinks || 'No cards in this collection yet.',
        '',
      ].join('\n'),
    });
  }

  const conflicts = options.syncState
    ? Object.entries(options.syncState.conflicts)
        .filter(([, revisionIds]) => revisionIds.length > 1)
        .map(([entityKey, revisionIds]) => ({
          entityKey,
          revisions: revisionIds.map((id) => options.syncState?.entities[id] ?? { id, unavailable: true }),
        }))
    : null;

  files.push({
    path: 'conflicts.json',
    content: JSON.stringify(
      {
        stateIncluded: options.syncState !== undefined,
        conflicts: conflicts ?? [],
      },
      null,
      2,
    ),
  });
  files.push({
    path: 'export-report.md',
    content: [
      '# Export report',
      '',
      `- Cards exported: ${activeCards.length}`,
      `- Collections exported: ${collections.length}`,
      `- Missing image files: ${missingMedia.length}`,
      `- Unresolved collection members: ${unresolvedCollectionMembers.reduce((total, entry) => total + entry.cardIds.length, 0)}`,
      `- Conflict state: ${options.syncState ? `${conflicts?.length ?? 0} unresolved conflict(s) included` : 'not supplied; conflict status is unknown'}`,
      '',
      ...(missingMedia.length > 0
        ? ['## Missing media', '', ...missingMedia.map((item) => `- ${item.cardId} (${item.title}): ${item.reason}`), '']
        : ['All referenced images were included.', '']),
    ].join('\n'),
  });

  const conflictCount = conflicts?.length ?? null;
  files.unshift({
    path: 'manifest.json',
    content: JSON.stringify(
      {
        version: 1,
        exportedAt,
        generatedBy: 'Visual Library',
        totalCards: activeCards.length,
        totalCollections: collections.length,
        cards: cardManifest,
        collections: collectionManifest,
        missingMedia,
        unresolvedCollectionMembers,
        conflictCount,
        conflictStateIncluded: options.syncState !== undefined,
      },
      null,
      2,
    ),
  });

  return {
    exportedAt,
    manifest: {
      version: 1,
      exportedAt,
      totalCards: activeCards.length,
      totalCollections: collections.length,
      generatedBy: 'Visual Library',
      cards: cardManifest,
      collections: collectionManifest,
      missingMedia,
      unresolvedCollectionMembers,
      conflictCount,
      conflictStateIncluded: options.syncState !== undefined,
    },
    files,
  };
};

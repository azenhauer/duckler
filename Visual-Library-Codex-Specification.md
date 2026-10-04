# Personal Visual Library — Codex Implementation Specification

Version 1.0 • 3 October 2026  
Deliverable: implementation specification, not an implemented or deployed application.

## Implementation contract

Build a personal, local-first visual knowledge library with a static React PWA, a Chromium extension, and Google Drive as durable remote storage.

Follow the milestones in section 20 in order. Every milestone must leave the app runnable. Implement only the current milestone and its necessary foundations. Run its acceptance tests before proceeding. Record commands, results, remaining limitations, and any architectural deviation in docs/progress.md. Do not claim real-browser, cross-device, OAuth, or mobile tests passed when they were only mocked.

The central invariant is **one Card ID, many references**. Collections and canvas placements never contain independent Card content. User edits create revisions of the same Card. Replacing its image changes its media reference; every view resolves the updated Card.

The highest-risk work is synchronization and extension delivery. Design their contracts in the first milestone; implement them in the requested order. Local-only milestones do not claim cross-device synchronization. The first sync release must support two devices, concurrent edits, and offline replay together.

### Decisions fixed for v1

- React, TypeScript, Vite, Dexie, React Flow, and a small pnpm workspace.
- A stable HTTPS origin; installable PWA, with Android Chromium as the first mobile target.
- Client-side Google Identity Services (GIS), Drive API, and the narrow drive.file scope.
- Immutable media plus immutable, batched entity revisions in Drive.
- Conservative entity-level conflicts; preserve every conflicting version.
- One local library per app profile; one linked Google account at a time.
- Extension stores only a delivery queue and pairing configuration. The app owns all library editing and Drive synchronization.
- No backend, AI service, paid canvas dependency, or recurring application subscription is required by this design.
- “Save webpage” means bookmark, title, source URL, and optional captured preview. Full HTML archiving is outside v1.

## 1. Product requirements

### Required behavior

| Area | v1 requirement |
|---|---|
| Cards | Screenshot, imported image, bookmark, selected text, or plain-text note; optional note, tags, title and source metadata |
| Capture | Shortcut → drag rectangle → durable local queue; optional editing after successful capture |
| Library | Image-first responsive grid/masonry, newest-first, incremental loading, local search, detail view |
| Organization | Flat collections; one Card can belong to many; multi-select and bulk assignment |
| Canvas | Pan, zoom, move, resize, selection, library-to-canvas insertion; references to Card IDs |
| Persistence | IndexedDB transaction before local “saved” acknowledgement |
| Sync | Same Drive library on desktop and notebook; offline edits upload after connectivity and authorization return |
| Offline | App shell, metadata, and cached media usable offline; explicit missing-media placeholders |
| Mobile | Browse, edit, upload, crop; share-target support on tested browsers; paste/upload fallback |
| Recovery | Trash/restore, pending-change visibility, preserved conflicts, portable export/import |
| Obsidian | One-way Markdown export with attachments, source links, collection indexes |

### UX requirements

- Capture never requires a collection, tag, note, or Google login.
- Use precise status labels: “Queued in extension”, “Saved on this device”, “Syncing”, “Synced to Drive”, “Reconnect Google”, “Needs review”.
- “Synced” means all relevant metadata and required media uploads have been confirmed.
- A Card may be locally saved while thumbnail generation or remote upload is pending.
- Optional post-capture editing occurs in the extension-owned popup or app. Do not expose library metadata to the source webpage.
- Capture confirmation may appear in the page; it contains no private collection names.
- Selecting a Card opens a detail panel with source link, captured time, title, text, note, tags, and collection assignment.
- Search title, note, selected text, tags, source URL and page title. No OCR in v1.
- Case-insensitive, accent-insensitive search; tags normalized for comparison but retain readable labels.
- Support keyboard navigation, visible focus, Escape, accessible labels and reduced motion.
- Delete from library means trash. Remove from collection or canvas affects only that reference.

### Engineering targets

Measure on the actual notebook before release; these are acceptance targets, not browser guarantees.

- Warm local library: first usable screen within 1 second for 5,000 metadata records.
- Search: under 200 ms after debounce at 5,000 Cards.
- Rectangle release to durable extension queue: p95 under 1 second on a static 1080p fixture.
- App-connected capture appears within 2 seconds of queue commit.
- Canvas: responsive interaction with 200 placements and thumbnail media.
- Initial support envelope: 10,000 Cards, 200 placements per canvas, 20 MiB per imported image, 40 megapixels maximum decoded image.
- Enforce limits before expensive decoding where possible; validate again after decoding.
- Never load all full-resolution images to render the library.

## 2. Explicit non-goals for v1

No collaboration, public sharing, social feed, comments, subscriptions, multi-tenant accounts, server-side sessions, native mobile app, Firefox extension, OCR, semantic search, embeddings, automatic tags, AI summaries, link crawling, full-page screenshot stitching, arbitrary HTML preservation, video/PDF ingestion, canvas drawing, connectors, nesting, card rotation, two-way Obsidian sync, or guaranteed closed-app background synchronization.

Use only raster PNG/JPEG/WebP image ingestion initially. Unsupported formats receive an actionable error.

No automatic destruction of old revisions or unused remote media. No CRDT framework. No merging text character by character. No transparent end-to-end encryption. These features substantially increase implementation and recovery complexity.

## 3. Technology stack and justification

| Layer | Choice | Reason |
|---|---|---|
| Workspace | pnpm workspaces; current supported Node LTS pinned in repository | Shared domain and validation without a heavy build orchestrator |
| UI | React + TypeScript strict + Vite | Mature tooling; static deployment |
| Local storage | Dexie + dexie-react-hooks | IndexedDB transactions, migrations, reactive queries [S7] |
| Validation | Zod | Validate imports, messages and remote JSON at boundaries |
| Canvas | @xyflow/react / React Flow | Existing pan/zoom, selection, custom nodes and resizing; MIT core [S8] |
| PWA | vite-plugin-pwa, injectManifest mode, Workbox | Custom share-target route alongside controlled app-shell caching |
| Extension | Plain MV3 manifest; Vite-built worker, content script and popup | Small number of entry points; shared code without another framework |
| UI state | React state/context; Dexie is persistent truth | Avoid a second normalized client store |
| Styling | CSS modules or ordinary CSS | No design-system dependency required |
| Grid | Responsive CSS grid first; deterministic row virtualization when performance demands it | Accessible stable order; do not depend on experimental native masonry |
| Search | Normalized metadata scan initially; worker if measured latency exceeds target | Avoid an extra persisted search index and synchronization surface |
| Image processing | createImageBitmap, OffscreenCanvas where supported; DOM canvas fallback in app | Crop, thumbnail and hash locally |
| Hashing/IDs | Web Crypto SHA-256; crypto.randomUUID | Immutable media identity and collision-resistant entity IDs |
| Export | A small maintained ZIP library such as fflate | Portable native backup and Obsidian archive |
| Tests | Vitest, fake-indexeddb, Testing Library, Playwright, fast-check for sync properties | Cover state transitions, transactions, real browser behavior and convergence |

Pin actual package versions at implementation time in the lockfile. Check compatibility, licenses and current API docs before installation. Avoid undocumented dependency internals. React Flow stays behind an adapter; its serialized node objects are never the storage format.

## 4. Repository structure

~~~text
apps/
  web/
    src/
      app/
      features/{library,collections,canvas,capture,settings,conflicts}/
      workers/
      service-worker.ts
    public/
    index.html
    vite.config.ts
  extension/
    src/{background,selection,popup,bridge}/
    manifest.production.json
    manifest.development.json
    vite.config.ts
packages/
  domain/        # entities, schemas, IDs, commands, pure revision reducer
  storage/       # Dexie schema, migrations, repositories, blob cache
  protocol/      # extension wire messages and validators
  sync/          # Drive adapter, transfer state machine, revision ingestion
  export/        # portable archive and Obsidian renderer
tests/
  fixtures/
  integration/
  e2e/
docs/
  specification.md
  architecture.md
  google-setup.md
  deployment.md
  recovery.md
  progress.md
  decisions/
AGENTS.md
pnpm-workspace.yaml
package.json
~~~

Dependency direction: web → packages; extension → domain/protocol and its own queue implementation; sync → domain/storage. Domain has no React, browser-extension, or Google dependency.

Expose commands: pnpm dev, pnpm dev:extension, pnpm build, pnpm typecheck, pnpm lint, pnpm test, pnpm test:integration, pnpm test:e2e. The build command builds both deliverables. Document extension loading/reloading separately.

AGENTS.md must require transaction-safe changes, no token persistence, schema validation, explicit tests for sync changes, and preservation of Card references. No new infrastructure or feature expansion without an architectural decision.

## 5. Data models

These interfaces define the persisted semantics. Derive runtime schemas and reject unknown enum values, invalid IDs, non-finite geometry and oversized strings. Optional fields may be absent; JSON must contain no undefined values.

~~~typescript
type ID = string;          // UUID unless a deterministic composite key is specified
type ISODate = string;     // UTC ISO-8601; display in user's locale
type Hash = string;        // lowercase SHA-256 hex

interface Source {
  url?: string;            // http(s) only
  pageTitle?: string;
  imageUrl?: string;       // provenance only, never the authoritative media
  capturedAt: ISODate;
}

interface Card {
  id: ID;
  type: "screenshot" | "image" | "bookmark" | "text" | "note";
  title: string;
  text: string;
  note: string;
  tags: string[];
  source: Source;
  mediaHash?: Hash;
  thumbnailHash?: Hash;
  captureId?: ID;          // capture-created card ID equals captureId
  capturePayloadHash?: Hash; // original delivery identity, immutable across edits
  createdAt: ISODate;
}

interface Collection {
  id: ID;
  name: string;
  description: string;
  createdAt: ISODate;
}

interface Membership {
  id: string;             // collectionId + ":" + cardId
  collectionId: ID;
  cardId: ID;
}

interface CanvasDocument {
  id: ID;
  title: string;
  createdAt: ISODate;
}

interface CanvasPlacement {
  id: ID;                 // independently revisioned placement
  canvasId: ID;
  cardId: ID;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface EntityMap {
  card: Card;
  collection: Collection;
  membership: Membership;
  canvas: CanvasDocument;
  placement: CanvasPlacement;
}
type EntityKind = keyof EntityMap;

interface Revision<K extends EntityKind> {
  schemaVersion: 1;
  revisionId: ID;
  libraryId: ID;
  entityType: K;
  entityId: string;
  parentRevisionIds: ID[]; // one head ordinarily; all heads on resolution
  deviceId: ID;
  logicalTime: number;     // Lamport counter, never wall-clock precedence
  updatedAt: ISODate;
  deleted: boolean;
  value: EntityMap[K];     // full value retained even in tombstones
}
type AnyRevision = {
  [K in EntityKind]: Revision<K>
}[EntityKind];

interface Materialized<T> {
  id: string;
  value: T;
  headRevisionIds: ID[];   // sorted
  visibleRevisionId: ID;
  updatedAt: ISODate;
  deleted: boolean;
  conflicted: boolean;
}

interface MediaDescriptor {
  hash: Hash;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
  role: "original" | "thumbnail";
}

interface CachedMedia {
  hash: Hash;
  blob: Blob;
  lastAccessedAt: ISODate;
  pinned: boolean;
}

interface MediaLocation {
  hash: Hash;
  driveFileId: string;
  verifiedAt: ISODate;
}

interface RevisionBatch {
  schemaVersion: 1;
  libraryId: ID;
  batchId: ID;
  deviceId: ID;
  createdAt: ISODate;
  revisions: AnyRevision[];
  media: Array<MediaDescriptor & { driveFileId: string }>;
}

interface UploadJob {
  id: ID;
  type: "media" | "batch" | "backup";
  state: "pending" | "uploading" | "retry" | "confirmed" | "blocked";
  driveFileId?: string;    // allocated and persisted before upload
  contentHash: Hash;
  attempts: number;
  nextAttemptAt?: ISODate;
  lastErrorCode?: string;
}

interface LibraryBinding {
  libraryId: ID;
  rootFolderId?: string;
  googleAccountKey?: string;  // stable identity obtained via authenticated API
  deviceId: ID;               // local install identity, never copied by restore
  formatVersion: 1;
}

interface CaptureEnvelope {
  protocolVersion: 1;
  captureId: ID;
  targetLibraryId: ID;
  capturedAt: ISODate;
  type: Card["type"];
  title: string;
  text?: string;
  note?: string;
  tags?: string[];
  source: Source;
  media?: MediaDescriptor;
  suggestedCollectionId?: ID;
}

interface CaptureReceipt {
  captureId: ID;
  cardId: ID;
  payloadHash: Hash;
  committedAt: ISODate;
}
~~~

Rules:

- Card content has no embedded collection IDs or canvas layouts.
- App revision IDs are distinct from Google Drive file version/revision identifiers.
- Blob hashes identify exact bytes. Equal image bytes may be shared by distinct Cards.
- Image replacement generates a new hash; old media remains available to history.
- Keep viewport and selection local per device. They do not belong in a synchronized canvas.
- A Card can appear more than once on a canvas through distinct placement IDs.
- Membership ID is deterministic, allowing repeat assignment without duplicate rows.
- Titles max 1,000 characters; text/note each max 100,000; at most 100 tags, each max 100 characters. URL limit 8 KiB. Batch and import limits are validated independently.
- updatedAt is informative. Causality comes from parent IDs; ordering ties use logicalTime, deviceId and revisionId.

## 6. IndexedDB schema

Use one Dexie database named from libraryId. A separate small bootstrap database stores the active local library, pairing settings and its account binding. Never persist OAuth tokens.

| Store | Primary key | Required indexes / purpose |
|---|---|---|
| cards | id | updatedAt, value.type, value.captureId; materialized Card |
| collections | id | value.name |
| memberships | id | value.cardId, value.collectionId, [value.collectionId+value.cardId] |
| canvases | id | updatedAt |
| placements | id | value.canvasId, value.cardId |
| revisions | revisionId | [entityType+entityId], deviceId, updatedAt |
| pendingRevisions | revisionId | local revisions awaiting immutable batch assignment |
| batches | batchId | state; sealed JSON bytes, hash, Drive ID, included revision IDs |
| remoteInbox | driveFileId | state; downloaded unvalidated/pending-dependency batch |
| mediaDescriptors | hash | role |
| mediaBlobs | hash | lastAccessedAt, pinned |
| mediaLocations | [hash+driveFileId] | hash |
| uploadJobs | id | state, nextAttemptAt |
| captureReceipts | captureId | cardId |
| shareInbox | id | createdAt; durable incoming PWA shares before user saves |
| syncState | key | change cursor, root/subfolder IDs, schema version, scan state |
| remoteInventory | driveFileId | kind, state; discovered files independent of cursor |
| conflicts | [entityType+entityId] | unresolved head IDs; derived/rebuildable |
| settings | key | local viewport, cache budget and preferences |

Do not index booleans directly; use numeric flags if indexed filtering is needed. Derived normalized search text may live in each materialized row and is rebuildable.

Every local domain command performs one transaction: persist revision, update entity heads/materialized view, record conflict state, and add pending revision. Imported capture additionally writes media and receipt in that same transaction. If any write fails, no success acknowledgement is sent.

Hash/decode outside transactions. Inside a transaction re-read current heads; abort/retry if the edit's base head changed. Dexie transactions must not await network/image work.

Use BroadcastChannel for invalidation and Web Locks for sync leadership across tabs. Re-check local jobs transactionally even with a lock. If Web Locks is unavailable, only a designated visible tab may run sync; other tabs remain local editors. No fake distributed lock file in Drive.

Schema upgrades must have versioned fixtures and migration tests. If an old tab blocks an upgrade, ask it to reload. Unknown newer remote format pauses sync; local export remains available.

## 7. Google Drive storage format

Human-visible folder structure:

~~~text
Visual Library/
  library.json
  media/
    <sha256>.png
    <sha256>.webp
  database/
    batches/
      <deviceId>_<batchId>.json
  canvases/
    <canvasId>_<snapshotId>.json
  backups/
    <deviceId>_<snapshotId>.json
~~~

### Authority and ownership

- library.json: immutable library ID, formatVersion, createdAt and folder IDs. Upload only after subfolder creation is complete.
- media: immutable original and thumbnail byte files.
- database/batches: authoritative immutable Card, Collection, Membership, Canvas and Placement revisions.
- canvases: optional human-readable derived canvas exports, written only on explicit export. Include canvas ID, metadata and placements with Card IDs. Never import these silently as authoritative state.
- backups: immutable metadata checkpoints; section 19 defines restoration.
- Filenames aid inspection. Drive file IDs and validated app properties establish identity; filenames are not unique keys.
- Set appProperties: app identifier, libraryId, file kind, schema version, batchId or media hash as appropriate.
- Only interpret files belonging to the selected library and recognized subfolders.
- Shared mutable index.json is forbidden. No device rewrites the entire library.

A batch contains full entity revisions, not keystroke operations. Seal at most 200 revisions or 1 MiB of UTF-8 JSON, whichever comes first. Split large pending queues; preserve dependency ordering. A single permitted entity revision must fit the batch limit. Bulk commands may use several batches; transient partial visibility is acceptable and dangling references display as pending.

Store the exact sealed bytes and SHA-256 locally before upload. Retry those bytes and the same preallocated Drive file ID. Additional edits enter a later batch. Seal batches in topological revision order so parents are confirmed or included in the same/earlier batch.

Pre-generate file IDs using Drive files.generateIds for the binary/JSON uploads where supported, persist them, then create files using those IDs. A retry reporting “already exists” must fetch and verify identity/content before confirmation [S3]. Never infer successful upload solely from matching filenames.

Cross-device identical media uploads can still produce multiple remote files. This is harmless: track multiple locations by hash; defer physical deduplication. Avoid a global media-index lock.

### Root discovery

Use the same Google Cloud project/OAuth application across desktop and notebook. Find accessible roots using appProperties under drive.file. Do not assume access to every file under a user-picked folder; folder selection is not recursive authorization [S2].

On first setup, offer “Create library” or “Open existing library”. Later devices select the existing root before making local edits, or explicitly migrate their local draft. Root names alone never select a library.

Two devices can race to create separate roots. Detect and show both; never merge/delete automatically. v1 setup instructs the user to initialize the first device before connecting the second.

Manual edits to authoritative Drive JSON are unsupported. Treat changed bytes under a known immutable file ID as corruption, preserve the prior local version, and surface repair.

## 8. Synchronization algorithm

### Guarantees

At-least-once transfer; idempotent application; eventual convergence after all valid revisions arrive; preserved concurrent versions; no dependence on clock agreement; no remote overwrites of entity state.

Remote atomicity applies to each uploaded batch file, not to the whole library or multiple media files. Drive is a file store, with bounded batches and foreground synchronization.

### Local commit

1. Validate command and expected heads.
2. Generate immutable revision with parents equal to the observed current head for ordinary editing. Editing a conflicted entity requires the resolution flow described below.
3. Set logicalTime to one above the maximum observed counter; allocate UUID and UTC updatedAt.
4. Atomically commit revision, pending status and materialized state.
5. Render from Dexie immediately. Schedule sync without blocking UI.

Coalesce typing in memory with a 500 ms debounce; flush on blur and explicit navigation. Show “Saving…” until committed. Do not rely on beforeunload. Drag/resize commits on gesture end.

### Sync triggers and budgets

Run on app open, focus, online event, manual Sync, and after edits. Use a 15-second upload debounce with a maximum 60-second delay during sustained editing. Poll the changes feed roughly every 60 seconds while visible and authorized. Pause timers when hidden; reopening resumes. Synchronize only if a valid in-memory token is available.

Verify every downloaded media Blob against its declared SHA-256 and byte length before caching it. Use resumable Drive uploads for larger media or unreliable mobile connections; persist the upload session/job and recover a lost session through the same allocated file ID. Small JSON batches use multipart upload.

At most two uploads/downloads concurrently. Serialize batch publication for one installation. Honor Retry-After; exponential backoff with full jitter, initially about 1 second, capped at 5 minutes. Retry budgets reset on meaningful recovery or explicit retry.

### First device connection / new device

1. Authorize and verify account binding and chosen library.
2. Obtain a Drive changes start token **before** the initial full inventory.
3. List all relevant folder files with pagination; validate manifest and format.
4. Persist inventory records. Download authoritative batches and media descriptors; do not download all originals.
5. Validate hashes/schemas and apply revisions in dependency order. Retain unresolved parents in inbox.
6. Drain changes from the initial token to catch files created during listing [S4].
7. Render local metadata as it arrives; show a clear initial-sync progress state.
8. Reconcile pending local revisions, then start upload phase.

### Normal cycle

1. Acquire local sync leadership and validate token/account/root.
2. Read paginated Drive changes. Filter by recognized library identity, file IDs and parents.
3. In a transaction, persist each page's relevant inventory/work items and its next cursor. This makes a cursor advance safe before expensive downloads.
4. Download unprocessed items into durable inbox; process missing ancestors first.
5. Validate batch identity, all revision IDs and values, media metadata, and schema. The same revision ID with different bytes is corruption.
6. Insert unseen revisions and recompute affected heads/materialized rows atomically. Unresolved dependencies stay pending. Missing media does not prevent metadata ingestion.
7. Identify media required by pending local revisions. Upload and confirm those bytes first.
8. Seal revision batches with verified media locations. Every referenced media hash must have a confirmed remote location, unless the batch only tombstones an entity whose media is already known.
9. Publish sealed batches using persisted Drive IDs; confirm via successful response or fetch-and-verify after ambiguous failure.
10. Mark only included revisions remotely confirmed. Newer edits remain pending.
11. Pull once more to detect near-concurrent publications. Release lock.

No GET-then-PATCH shared index and no last-write-wins timestamp overwrite.

If a cursor is rejected or state is suspect, obtain a fresh start token, rescan inventory, then catch up from that token. Replaying already-known files must be harmless. For a 410/invalid cursor, retain local history and pending changes.

Drive deletions, moves or permission loss are **external damage events**, not Card deletions. Show missing-file status. App-level tombstones are the only synchronized deletion mechanism.

No push webhooks or always-running sync server. A closed/suspended app and expired token cannot promise remote progress.

## 9. Conflict resolution

### Revision DAG

Each entity has a directed acyclic graph of revisions. A head is a revision with no known descendant. Parent IDs refer to earlier revisions of the same entity; reject cross-entity parents, cycles and inconsistent Lamport values.

- One head: display it.
- Multiple heads with equal value and deleted flag: display that shared value, retain all heads. A later explicit edit can parent all equivalent heads.
- Different concurrent heads: unresolved conflict.
- Causally later revisions supersede their ancestors regardless of timestamps.
- Arrival order never determines the final materialized state.

Do not automatically field-merge v1 Cards. This preserves whole text versions and avoids subtle reconstruction bugs. Different entities naturally merge: two new Cards, different memberships, and different canvas placements coexist.

### Visible conflict policy

- Choose a deterministic provisional nondeleted head if one exists; otherwise a deterministic deleted head.
- Compare candidates by logicalTime, then deviceId, then revisionId. This is a display tie-breaker, not a claim that one edit is correct.
- Mark every view of the entity as needing review.
- Show both/all values, device IDs and times in a resolution panel.
- User chooses a version or constructs a combined value.
- Resolution creates a new revision with every currently known head as a parent.
- If another concurrent head later arrives, reopen the conflict.

Concurrent delete/edit keeps the live version provisionally visible and preserves the delete intent. Concurrent membership add/remove similarly preserves the active membership until resolved. Concurrent movement of the same placement preserves both geometries and displays one deterministically; two different placements merge normally.

Deleting a Card preserves references. Collections omit trashed Cards from ordinary lists; canvases render a recoverable “Card in trash” placeholder. Restore the Card and all references work again. Trashing a collection/canvas preserves memberships/placements for restoration.

A manual “duplicate this version as a new Card” is optional future recovery tooling, not the default conflict strategy. Normal conflict handling keeps one Card ID.

Property tests must prove permutation-independent convergence, idempotence, clock-skew independence, and preservation of all divergent heads.

## 10. Browser extension architecture

### Components

- MV3 service worker: shortcut/context-menu dispatch, privileged tab capture, cropping, queue persistence and bridge.
- Injected isolated-world selection script: viewport overlay, pointer selection, Escape/cancel and geometry reporting.
- Extension-owned popup: queue status, retry/export, optional quick note/tags and library-opening action.
- Extension IndexedDB: durable capture envelopes, media Blobs, retry state and pairing configuration only.
- Web app bridge: app initiates an externally_connectable Port to the extension.

Minimum permissions: activeTab, scripting, storage, contextMenus. Declare keyboard commands. No tabs permission or permanent all-sites access unless a proven requirement is documented. activeTab grants temporary access after a user invocation [S5].

Use production externally_connectable matches for the exact app host and verify exact URL origin at runtime. localhost belongs only in the development manifest. Pin/configure the extension ID used by the app; document stable ID generation for unpacked builds.

### Delivery protocol

1. User pairs the extension to a library ID and exact app origin through an extension-owned confirmation UI.
2. Queue each capture under its UUID and target library ID.
3. Queue commit is the first durable success boundary.
4. App opens the Port and sends protocol version, library ID and locally paired nonce.
5. Extension validates origin, top-level frame, protocol and pairing; returns queue metadata.
6. App pulls each payload in ordered, bounded base64 chunks, for example 256 KiB raw bytes per chunk.
7. App reassembles and verifies byte length and SHA-256; performs its atomic import transaction.
8. App acknowledges captureId plus payload hash only after commit.
9. Extension deletes acknowledged payload bytes. Keep a small bounded recent receipt list for diagnostics.

Chrome extension messages use JSON serialization; do not send Blob or ArrayBuffer as if structured clone were guaranteed [S6]. Bound chunk count, total bytes and timeouts. Resume by captureId after disconnection; reassembly may restart in v1.

App captureId receipts are retained. Card ID equals captureId for imported captures; preserve capturePayloadHash through every Card revision. Re-delivery finds the receipt and returns success; it never overwrites later edits or resurrects a trashed Card. If a receipt is absent after remote restore, inspect existing Card history for the capture ID/hash and reconstruct the receipt. Payload hash mismatch under one captureId is quarantined. A newly restored device must finish initial metadata ingestion before draining a previously paired queue; it can continue accepting captures into that queue meanwhile.

When the app is closed, keep the queue and badge count. The next app launch drains it. The popup provides “Open library”; do not open a new tab on every capture. No extension Drive client and no extension copy of collections, Cards or canvas state.

Optional collection assignment opens the app's quick-edit route after import. Offline queued captures support note/tags locally; collection selection can wait for the app. Queue envelopes become immutable when transfer begins; later edits use a new metadata command after acknowledgement.

Handle worker termination at every boundary. Persist queue state before success; do not rely on globals or Port lifetime to keep the worker alive [S9]. An interrupted capture before durable save reports failure or disappears without a success indication.

Set a visible queue budget, initially 250 MiB. Warn before capacity, offer queue export, and never discard older pending captures automatically. Extension removal/profile deletion can delete its queue; surface pending captures in settings.

### Other capture modes

- Bookmark: get URL/title from the invoking tab and save immediately.
- Selected text: save plain text from explicit selection/context menu, with page provenance.
- Image: get the selected image's current source; fetch only through permitted origins. Cross-origin image hosts may need optional per-origin permission requested through a user gesture. On CORS/auth/permission failure, offer screenshot-region or upload.
- Arbitrary pasted URL in PWA: save URL immediately. Title/preview fetch is best-effort only where CORS allows; no hidden proxy.
- Do not auto-download third-party tracking thumbnails on every library render.

## 11. Screenshot-region algorithm

Scope: visible viewport on ordinary injectable desktop webpages. A webpage overlay cannot run on every browser-internal/store page even when screenshot APIs have broader privileges. Unsupported pages receive a clear fallback to local screenshot upload.

1. Shortcut/action records tabId, windowId, URL, title, document/navigation identity and capture UUID.
2. Inject one full-viewport overlay in an isolated world, preferably in a shadow root. Keep selection state inside the script.
3. Record visual viewport bounds, innerWidth/innerHeight, devicePixelRatio and browser zoom for diagnostics. v1 rejects pinch zoom when visualViewport.scale is not approximately 1; browser page zoom is supported.
4. Track pointer down/move/up in viewport CSS coordinates. Use pointer capture. Normalize reverse-direction drags and clamp to viewport.
5. Cancel on Escape, navigation, tab activation change, window focus loss, scroll, resize or zoom during selection. Reject selections below 4×4 CSS pixels.
6. Hide the entire overlay, preserving its viewport geometry. Wait two animation frames before requesting capture; avoid scroll-lock CSS that changes scrollbar width or layout.
7. Worker verifies the same tab is active in the same focused window. Call captureVisibleTab(windowId, {format:"png"}) once. Respect its documented call-rate limit [S5].
8. Revalidate tab/document/viewport state after capture. If any changed, discard and offer retry. Never attach a screenshot from a switched tab to the old URL.
9. Decode bitmap using createImageBitmap. Let bitmap dimensions be W,H; recorded viewport coordinate extent be Vw,Vh, including any scrollbar region represented by the screenshot.
10. Compute actual scale from bitmap, rather than multiplying devicePixelRatio and zoom together:

~~~typescript
const sx = W / Vw;
const sy = H / Vh;
const left = clamp(Math.floor(cssRect.left * sx), 0, W);
const top = clamp(Math.floor(cssRect.top * sy), 0, H);
const right = clamp(Math.ceil(cssRect.right * sx), left, W);
const bottom = clamp(Math.ceil(cssRect.bottom * sy), top, H);
~~~

11. Validate scale agreement against measured browser fixtures. Reject ambiguous viewport mapping, unexpected aspect ratios, or zero crop size. Do not silently guess. Split-view configurations require a passing fixture before support is claimed.
12. Crop with drawImage into an OffscreenCanvas and convertToBlob("image/png"). Dispose of the full screenshot; persist only selected pixels.
13. Hash cropped bytes; create CaptureEnvelope and atomically queue Blob + metadata.
14. Show success after commit; optional thumbnail generation follows. Restore/remove overlay in finally on success, failure and cancel.

Browser zoom and OS scaling are already reflected in the bitmap-to-CSS ratio. devicePixelRatio is diagnostic; applying another zoom factor would double-scale.

The image represents the page at capture time after selection; animated content can change while dragging. Freezing/archiving page rendering is outside v1.

Test 80/100/125/150/200% browser zoom, DPR 1/1.25/1.5/2, standard and overlay scrollbars, scrolled documents, reverse drags, display switching, resize, navigation, Escape, iframe regions and tab-switch races. Use known-color pixel fixtures and allow at most one bitmap pixel of rounding error at edges.

## 12. PWA and mobile architecture

Precache app shell and hashed application assets. Return cached shell for supported navigation routes offline. Cache storage contains application assets; user media and metadata remain in IndexedDB.

Implement baseline shell caching by the extension milestone so reopening the app offline can drain the queue. Full install/share/mobile polish remains later.

- Install manifest: stable id, name, icons, start_url, display standalone, theme/background colors.
- Custom service worker handles same-origin share-target POST and shell navigation.
- On supported installed browsers, accept title/text/URL and PNG/JPEG/WebP files [S10].
- Share handler validates size, stores incoming payload in shareInbox transactionally, then redirects with HTTP 303 to a local review route.
- Wrap work in the service-worker event lifetime. Show failure if the payload was not durably saved.
- On first load without an installed/controlling worker, do not promise offline file-share handling.
- Parse URLs from dedicated URL fields and shared text. Shared content may provide incomplete title/source metadata.
- Review supports crop, optional note/tags, Save and Discard. Keep originals in shareInbox until successful save.
- Crop creates a new raster Blob with EXIF orientation respected. A screenshot from the gallery may have no source URL; never invent one.
- Android Chromium is the release target for receiving shares. Other browsers receive paste-link/upload fallback until real device tests pass. Web Share Target is not universally supported.
- Responsive grid and details are required. Mobile canvas browsing, pan/zoom and tap “Add to canvas” are required; sophisticated touch multi-selection can remain desktop-only.

Use navigator.storage.estimate and request persistence where supported. Persistence can be denied. Never automatically evict metadata, revisions, receipts, unuploaded media or pending shares.

Evict only confirmed-uploaded unpinned media under an LRU budget. Default suggestion: 300 MiB desktop, 100 MiB mobile, adjustable based on quota. Pin a collection/canvas for offline use by retaining its originals/thumbnails; report incomplete pin downloads and insufficient space. Cached media absence has explicit placeholders.

On update, notify “Update available”; activate the worker after durable transactions finish. A service-worker upgrade must not delete the user database.

## 13. Canvas architecture

React Flow custom Card nodes resolve Card IDs via the repository; node data contains placement identity and Card ID only. Disable connection handles and edge creation. Use custom rendering with thumbnails and NodeResizer [S8].

- Persist CanvasDocument separately from each CanvasPlacement.
- Map screen drop coordinates using React Flow's screen-to-flow conversion.
- Store dimensions/positions in world units, independent of zoom.
- Minimum placement size 120×80 world units; bounded finite dimensions/coordinates.
- Maintain aspect ratio by default for image Cards; a toggle may permit free resize.
- Local viewport state survives reload per canvas/device.
- Multi-select/multi-drag commits all changed placements in one local transaction.
- Gesture-end commits only; render transient motion in UI state.
- Session undo/redo creates new compensating revisions. If heads changed remotely, require review before applying an undo based on stale state.
- Removing a placement leaves its Card untouched.
- Card edits update all nodes reactively; no duplicated rendered-text persistence.
- Deleted/missing Cards have placeholders and recovery actions.
- Offscreen node culling and thumbnail loading bound work. Full image loads only on detail/appropriate zoom.
- Rotation, freehand tools, grouping, connectors, nested canvases and real-time collaboration remain deferred.

## 14. Authentication design

Google authorization is requested when the user chooses Connect Google Drive. Local functionality works without authorization.

1. Create one Google Cloud project; enable Drive API; configure OAuth consent and an appropriate test/personal app setup.
2. Create a Web OAuth client with exact local development and production JavaScript origins.
3. Use GIS token client with drive.file. Read about.get with fields=user(permissionId,displayName,emailAddress) and bind to user.permissionId, a stable Drive user identifier [S12]. If absent or rejected, stop account binding and investigate; never silently fall back to email matching.
4. Check granted scopes and authenticated account identity before associating local data with the root.
5. Keep access token and expiry in memory only.
6. On expiry/401, pause sync and show Reconnect Google. Call requestAccessToken from user action; do not open repeated popups.
7. Disconnect clears in-memory authorization and stops network sync. Explicit revoke is a separate action.
8. Local data remains unless the user explicitly clears it after pending-data handling.

GIS browser token authorization does not supply a durable background-refresh design; Google documents short-lived access tokens and user-driven renewal [S1]. Reopening the app may require reconnecting. If seamless unattended synchronization becomes essential, that is a separate decision involving a backend/native token solution.

Use a stable account key, never email alone as the database identity. v1 rejects binding an existing populated library to a different Google account. Offer export and a separate new local profile instead.

No client secret belongs in frontend/extension bundles. OAuth client ID is public configuration. Client-side “login” does not encrypt an already-cached library or create a server-enforced local access barrier.

Document current OAuth console testing/publishing behavior during implementation. Do not promise that test-mode grants last indefinitely, or that every organization permits third-party Drive access.

## 15. Security considerations

- Treat webpage text, Drive JSON, image headers, extensions messages and imports as untrusted input.
- Render plain text through React; no raw HTML capture/render, eval or unsanitized Markdown HTML.
- Validate URL schemes; source links use safe external-opening attributes and no referrer.
- Source URLs may include private query parameters. Preserve captured provenance by default; allow the user to edit/remove it. Never include URLs/content in analytics or routine logs.
- Accept only supported raster formats after checking signatures and successful decoding; limit pixel count, decompression, bytes and concurrent decoding.
- Validate ZIP paths, maximum expanded size and file count before restore; reject traversal and duplicate ambiguous entries.
- Deploy a restrictive CSP: self-hosted app assets, specifically permitted Google identity/API endpoints, blob image sources, no arbitrary remote script execution. Test GIS popup/iframe compatibility before tightening COOP.
- No Google tokens in IndexedDB, localStorage, extension queue, URLs, service-worker caches or logs.
- Keep authenticated API responses out of app-shell caching rules.
- Extension external bridge accepts only exact paired app origin, top-level sender and permitted message types. Pairing nonce adds protocol binding; it does not defend against app-origin XSS.
- Capture can only be triggered by a recent user invocation tied to a tab. External bridge cannot execute code, fetch arbitrary URLs, capture other tabs or inspect browsing history.
- Validate internal content-script messages against current capture/tab state.
- No full screenshots passed to page scripts; only extension contexts handle raw capture.
- Drive files remain private; do not create public media URLs.
- No telemetry in v1. Diagnostics contain error codes, counts and redacted identifiers.
- Export archives contain private content. Local and Drive storage rely on device/account security; application-level encryption is outside v1.
- Dependency lockfile, license review and production dependency audit are release gates.

## 16. Deployment architecture

Recommended: static Cloudflare Pages deployment. Vercel static hosting is a valid alternative. Deploy only the web build; distribute the extension separately.

~~~text
Browser PWA → local IndexedDB
Browser PWA → GIS authorization → Drive API
Chromium extension → durable queue → paired PWA connection
Static host → versioned HTML/JS/CSS/service worker
~~~

No always-running process, server function, metadata proxy, object-storage service, hosted database or Google service account.

Build web output to apps/web/dist. Configure SPA fallback while preserving actual static assets and the worker path. Serve HTTPS. Give hashed assets long immutable caching; HTML and service worker must revalidate. Set CSP and security headers. Inspect install scope and base path.

Public environment configuration:
- VITE_GOOGLE_CLIENT_ID
- VITE_EXTENSION_ID
- VITE_APP_ORIGIN
- optional VITE_BUILD_ID

Separate development and production manifests/configuration. Do not authorize wildcard preview deployments for OAuth or extension access. Changing production origin requires a planned local export/migration and new OAuth/extension configuration.

The host serves application code, not private library content. Media consumption uses Drive storage quota. Current Cloudflare Pages free-tier constraints should be checked before deployment [S11]; no dollar amount or unlimited capacity is guaranteed here. A custom domain is optional.

For one user, load the unpacked extension on desktop and notebook using the documented stable ID. Web Store publication is optional and introduces its own review/fee work.

## 17. Testing strategy

### Automated layers

- Unit: validation, normalized search, IDs, hashing, geometry, source URL validation, export escaping.
- Storage integration: atomic capture receipt/media/Card commit, failed transactions, migrations, orphan handling.
- Pure synchronization property tests: randomized delivery order/duplication, missing ancestors, concurrency, deletion and resolution.
- Fake Drive integration: pagination, changes cursor handling, 401/403/404/410/429/5xx, quota errors, delayed responses and ambiguous successful uploads.
- Browser tests: fresh profile, reload, offline shell, blob persistence, two tabs, blocked upgrade, worker update.
- Extension tests: persistent Chromium context, real extension loaded, capture fixture page, queue reconnect and navigation races.
- Security tests: hostile text, oversized payloads, malformed images/JSON, unexpected origins/frames, invalid pairings, import traversal.
- Export tests: stable names, YAML/Markdown escaping, attachment hashes and native archive round-trip.

### Required physical-device gates

- Desktop and notebook: each makes edits offline; reconnect in both orders; compare entity heads and visible content.
- Real browser screenshot matrix; emulated DPR alone does not validate OS display scaling.
- Extension worker stopped/restarted and app closed/reopened.
- Actual GIS popup flow and consent denial/reconnect.
- Actual Drive upload/retry and new-device discovery with drive.file.
- Android install, offline relaunch, share URL, share image, crop and pending upload.
- Unsupported mobile share-target browser shows functional upload/paste fallback.

Use a disposable test library for destructive recovery tests. Do not run fault injection against the user's actual library.

## 18. Error handling and recovery

| Failure | Required behavior |
|---|---|
| IndexedDB quota | No success acknowledgement; preserve existing pending data; offer export and cleanup of uploaded cache |
| Media decode/crop | No partial Card; clear error and retry/upload fallback |
| Thumbnail failure | Keep original and Card; placeholder and retry thumbnail task |
| App closed or bridge lost | Extension retains capture until committed receipt acknowledgement |
| Worker killed before queue commit | Never show success; retry capture |
| Lost upload response | Retry same Drive ID/bytes; verify existing file before confirmation |
| OAuth denied/expired | Local edits continue; pause sync with reconnect action |
| Wrong account | Stop sync before any upload; retain local binding |
| API rate limit/server error | Bounded concurrency, jittered retries and visible pending count |
| Drive quota exceeded | Preserve local queue; actionable storage status; avoid endless rapid retries |
| Missing remote media | Placeholder; try another known location; offer reupload from local cache |
| External Drive deletion | Surface integrity issue; no inferred Card tombstones |
| Invalid batch/new schema | Quarantine raw bytes; mark sync incomplete; offer app update/export |
| Missing ancestor | Keep pending; rescan inventory; report unresolved dependency if still absent |
| Conflicting edits | Preserve heads; deterministic provisional rendering; resolution UI |
| Browser storage cleared | Restore Drive data after reconnect; pending local-only work needs prior export |
| App upgrade failure | Preserve DB; expose export/recovery route; no automatic wipe |
| Damaged library manifest | Pause writes; recovery can attach validated existing folders/batches without replacing originals |

Sync UI reports last successful download/upload separately, pending revision/media counts, conflicts and blocked jobs. Provide Retry, Reconnect, Export diagnostics and Export library. Diagnostics must exclude content and tokens.

A known corrupt batch prevents a blanket “fully synchronized” claim even if unrelated files can continue processing.

## 19. Backup and export strategy

### Native portable archive

Implement a minimal JSON export early; complete portable ZIP before remote-sync release.

Archive contains:
- versioned manifest, library ID and export timestamp;
- all entity revisions, tombstones, heads and capture receipts;
- media descriptors and selected/all required binary media;
- checksums and an explicit completeness report;
- no OAuth tokens, account credentials, active upload leases or reused device ID.

A full backup must fetch missing required originals while authorized, or explicitly report that it is incomplete. Metadata-only export cannot claim to protect images. For large libraries, export numbered bounded archive parts rather than building an unbounded Blob in memory; list all part hashes in the manifest.

### Drive metadata backups

After a successful sync, at most once per device per day with changes, optionally create an immutable checkpoint in backups. Include revision history known to the device, all head IDs, media hashes/locations, covered batch IDs/hashes and schema version.

These checkpoints protect metadata and aid inspection. Media remains in media/. A backup on the same Drive account is not protection against whole-account/library deletion; periodically download a native full archive elsewhere.

v1 does not prune authoritative batches, revisions, tombstones, receipts or remote media. Checkpoints do not authorize log deletion. This avoids breaking a notebook that has been offline for months. Compaction is a later measured optimization.

### Restore

Validate archive and hashes into a separate local database first. Generate a fresh device ID. Show counts, missing media and format compatibility before switching the active local database. Restore capture receipt identity from archived receipts or Card provenance. Local bootstrap restores must not reuse a prior sync cursor as proof that the current remote inventory is complete.

Restore into the same remote library must use preserved revision IDs and rescan current remote history before replaying; no bulk overwrite. New empty remote libraries can be initialized from validated history under the archive's library identity with explicit conflict checks. Do not automatically create a second active root for an existing library.

Provide an offline-capable recovery/export screen even when Google APIs are unavailable.

### Obsidian export

One Markdown file per active Card: cards/<sanitized-title>--<cardId>.md. Attachments use attachments/<hash>.<ext>. Collection index notes live under collections/<name>--<id>.md and link to the same Card files.

Frontmatter: id, type, created_at, updated_at, source_url, page_title and tags. Include image link, quoted selected text if applicable and note body. Serialize YAML safely; escape Markdown filenames/links.

Use collection index notes instead of duplicate Card Markdown in multiple folders. A repeated export uses stable IDs and filenames recorded in an export manifest; output is a new archive, never automatic deletion from an existing vault.

Exclude trash by default. Export unresolved conflict versions into a conflicts/ directory with a report; preserve the canonical Card ID in metadata. Obsidian canvas conversion remains outside v1.

## 20. Runnable development milestones

Every milestone runs typecheck, lint, relevant unit/integration tests and production build. Add targeted tests below; do not rerun unrelated expensive matrices without a reason. The acceptance gate controls completion.

### M1 — Local Card library foundation

**Works:** Vite app, schema v1, local library initialization, plain-text/bookmark/image Cards, grid, detail/edit, source metadata, original Blob persistence, basic thumbnail worker, metadata search, trash/restore and minimal JSON export. Revisions and command transactions exist from day one.

**Unfinished:** Collections, extension, canvas, Drive, mobile shares and complete archive media export.

**Acceptance:** Create/import/edit 100 mixed Cards, reload and see unchanged content; malformed image fails without partial rows; editing persists under the same ID; search and source links work.

**Tests:** Domain schemas, failed transaction rollback, persisted Blob round-trip, trash/restore, reload E2E, hostile text rendering. Run app on notebook and record a baseline.

### M2 — Collections and bulk organization

**Works:** Flat collection CRUD, membership references, multi-select, bulk add/remove and collection filtering.

**Unfinished:** Extension/canvas/Drive; complex ordering, collection nesting and smart collections.

**Acceptance:** Same Card in two collections reflects one edit immediately; removing one membership leaves the Card and other membership; collection trash/restore recovers its membership list.

**Tests:** Duplicate assignment idempotency, bulk transaction rollback, correct reference deletion semantics, search within a collection.

### M3a — Extension capture and durable queue

**Works:** Loadable MV3 extension, configurable keyboard command, overlay selection, crop and durable queue; popup previews/counts/export.

**Unfinished:** Automatic app delivery, collection assignment in popup, other web capture modes, sync.

**Acceptance:** Screenshot crops correctly on supported test page; app can be absent; restart extension worker and queued bytes survive; Escape saves nothing; success follows queue commit.

**Tests:** Crop unit fixtures and actual-browser zoom/DPR subset, reverse drags, navigation/tab-switch rejection, worker stop/restart, quota failure, unsupported-page handling.

### M3b — Capture delivery and other capture modes

**Works:** Exact-origin pairing, app-initiated Port, chunk transport, atomic import/receipt, duplicate-safe ACK, bookmark/text/image context menus, optional notes/tags. Add baseline app-shell offline caching.

**Unfinished:** Canvas, Drive, mobile share target, cross-origin image capture without permission; optional collections route through app.

**Acceptance:** Capture with app closed, reopen offline and import once; disconnect midway and retry without duplicates; capture after Card edit cannot overwrite it; source URL/title/time survive.

**Tests:** Disconnect before/after commit and ACK, hostile origin/frame, mismatched payload hash/library ID, unsupported protocol, image fetch fallback, offline reopening. Complete real capture matrix before calling capture complete.

### M4 — Local canvas

**Works:** React Flow canvas, Card-reference nodes, library drag-in, pan/zoom, resize/move, multi-select/multi-drag, session undo and per-device viewport.

**Unfinished:** Rotation, freehand, edges/groups, remote synchronization and advanced mobile manipulation.

**Acceptance:** Card appears in two canvases and a collection; editing it updates all; moving/resizing one placement affects only that placement; reload restores layout; 200-placement fixture remains usable.

**Tests:** Screen/world coordinate mapping under zoom, reference propagation, placement removal, trashed Card placeholder, multi-drag atomic commit and undo under changed heads.

### M5a — Sync engine against fake Drive

**Works:** Pure revision DAG reducer, conservative conflict UI, durable upload jobs, immutable batches, inventory/cursor state machine, fake Drive adapter and full native ZIP export/restore.

**Unfinished:** Actual Google authorization/network use. UI explicitly calls fake sync a development mode.

**Acceptance:** Two isolated browser databases converge under shuffled/duplicated deliveries; concurrent Card edits stay recoverable; restore into a fresh DB reproduces IDs, media and conflicts.

**Tests:** Property-based convergence/idempotence, delete/edit conflict, late conflict after resolution, missing parents, unknown schema, corrupted bytes, lost responses, cursor pagination/crash, clock skew and archive validation.

### M5b — Google Drive integration and two-device release

**Works:** GIS, account binding, drive.file root create/discovery, media-first upload, real changes-feed pull, retries, conflicts, sync status and metadata checkpoints.

**Unfinished:** Closed-app background guarantees, compaction, automatic remote cleanup and mobile-specific share polish.

**Acceptance:** Desktop creates and syncs library; notebook discovers same root and loads it. Both edit offline, reconnect in either order and converge with preserved conflicts. Expired token leaves pending changes intact. An image Card is marked synced only after its media and batch are confirmed.

**Tests:** Real personal test account on two devices; scope/access discovery; preallocated-ID retry; authorization rejection/wrong account; external file removal; fake network-fault regression; recovery from missing cursor. Verify current GIS/Drive behavior here, not through mocks alone.

### M6a — PWA installation and mobile workflow

**Works:** Manifest/install flow, Android URL/image share target, durable share inbox, crop review, responsive library/details, upload/paste fallbacks and touch canvas pan/zoom/tap insertion.

**Unfinished:** Unverified iOS share-target support, native background services and touch multi-selection parity.

**Acceptance:** Installed Android app receives URL and screenshot, crops/saves offline, survives restart and uploads after reconnect. Browsers without share receiving can paste/upload.

**Tests:** Actual Android share sheets and offline launches, worker POST/303 route, share parsing variants, unsupported MIME/oversize, EXIF rotation, abandoned crop recovery and responsive keyboard/focus checks.

### M6b — Cache, performance and recovery polish

**Works:** Storage estimates, persistence request, LRU confirmed-media eviction, offline pinning, update prompts, diagnostics, tested archive recovery, incremental/virtualized browsing where needed.

**Unfinished:** Automatic metadata compaction, remote garbage collection, AI features and broad browser parity.

**Acceptance:** Pending media survives cache cleanup; missing offline media is clear; schema/worker upgrades preserve content; 5,000-Card target and 200-placement target meet recorded notebook benchmarks.

**Tests:** Quota injection, denied persistence, upgrade with two tabs, interrupted downloads, cache eviction/pinning, export completeness, fresh-profile restore and representative performance profiling.

### M7 — Obsidian export and final v1 gate

**Works:** Stable Markdown/attachments/collection-index ZIP export with provenance, conflict report and export manifest.

**Unfinished:** Two-way sync, direct vault editing, Obsidian Canvas translation.

**Acceptance:** Open exported files in an actual Obsidian vault; links/images work; shared Card occurs once; source metadata survives; title collisions and Unicode names are safe.

**Tests:** YAML/Markdown escaping, duplicate titles, missing media/completeness report, stable IDs, conflict export and manual Obsidian opening. Run the end-to-end workflow: capture → organize → canvas → edit → second device → offline edit → conflict resolution → export.

## Complexity limits and decisions to revisit only with evidence

| Temptation | v1 decision |
|---|---|
| Shared Drive index/database rewrite | Immutable revision batches; no cross-device overwrite |
| Perfect field-level merge | Preserve whole-entity conflicts; explicit resolution |
| Extension as a second full app | Delivery queue only |
| Silent permanent Google login | User-driven reconnect; local work continues |
| Universal mobile sharing | Android target plus universal upload/paste |
| Fetch any site's title/preview | Capture from extension or save a plain URL |
| Full-page screenshot/HTML archive | Visible region plus bookmark |
| Beautiful editor beyond reference cards | React Flow nodes only |
| Premature log compaction | Keep history; measure startup/log growth |
| Unlimited media cache | Bounded cache, explicit pinning, durable pending data |
| Browser storage as the sole backup | Confirmed Drive sync plus portable archives |

The immutable history model adds a small revision reducer, but avoids reliance on unverified Drive compare-and-swap behavior and shared-index races. Its tradeoff is history growth and slower first sync. Measure batch count and cold bootstrap time; design compaction only after a real threshold is reached and with an offline-device recovery protocol.

## Source notes

Platform statements were checked against official documentation. The architecture, thresholds and conflict policy are design decisions, not claims that the platforms implement these behaviors automatically.

- [S1] Google Identity Services: use the token model, including user gestures and token expiration. [https://developers.google.com/identity/oauth2/web/guides/use-token-model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [S2] Drive API scopes and drive.file access. [https://developers.google.com/workspace/drive/api/guides/api-specific-auth](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [S3] Drive file creation, generated IDs and upload formats. [https://developers.google.com/workspace/drive/api/guides/create-file](https://developers.google.com/workspace/drive/api/guides/create-file) and [https://developers.google.com/workspace/drive/api/guides/manage-uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [S4] Drive changes feed and pagination. [https://developers.google.com/workspace/drive/api/guides/manage-changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [S5] Chromium activeTab and captureVisibleTab. [https://developer.chrome.com/docs/extensions/develop/concepts/activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [https://developer.chrome.com/docs/extensions/reference/api/tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [S6] Chromium message serialization and external web-page connections. [https://developer.chrome.com/docs/extensions/develop/concepts/messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [S7] Dexie React integration. [https://dexie.org/docs/Tutorial/React](https://dexie.org/docs/Tutorial/React)
- [S8] React Flow core, node resizing and license. [https://reactflow.dev/learn](https://reactflow.dev/learn) and [https://reactflow.dev/api-reference/components/node-resizer](https://reactflow.dev/api-reference/components/node-resizer) and [https://github.com/xyflow/xyflow/blob/main/LICENSE](https://github.com/xyflow/xyflow/blob/main/LICENSE)
- [S9] MV3 worker lifecycle. [https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [S10] Web app manifest share_target. [https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [S11] Cloudflare Pages limits. [https://developers.cloudflare.com/pages/platform/limits/](https://developers.cloudflare.com/pages/platform/limits/)

- [S12] Drive User resource and permissionId. [https://developers.google.com/workspace/drive/api/reference/rest/v3/User](https://developers.google.com/workspace/drive/api/reference/rest/v3/User)

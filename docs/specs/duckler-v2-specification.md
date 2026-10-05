# Duckler v2 — Private Libraries, OCR, Annotated Canvases and Friends Collaboration

Version: draft 2.0 • 4 October 2026

This is an implementation specification, not evidence that these features or security controls already exist. Intended repository path: `docs/duckler-v2-specification.md`.

## 1. Implementation contract and precedence

Read the existing `docs/specification.md`, applicable `AGENTS.md`, current migrations, revision reducer, extension protocol and sync implementation before coding. Compare this specification with the actual repository. Preserve working implementations and record discrepancies in `docs/progress.md`.

This supplement extends the original Visual-Library-Codex-Specification.md dated 3 October 2026. It overrides the original non-goals ONLY for: multiple people using independent private libraries; explicitly shared workspaces; asynchronous collaboration; OCR; canvas connectors, drawing, annotations and rotation; and the optional PDF and collection-nesting milestones below. All original data-preservation, local-first, low-infrastructure and reference semantics remain in force except the explicit cross-workspace copy boundary described here.

Do not rewrite the application. Implement the milestones sequentially, with a runnable app at every step. This document defines scope, not a request to publish deployments, send invitations or share existing private data. Implementation may proceed through automated gates. A live-account/device/security test may only be marked complete when performed; continue independent work behind a disabled feature flag when a real external gate is pending. Never claim mocks establish Google permission behavior.

Maintain `docs/progress.md` with: milestone status; files changed; commands and results; manual evidence; unresolved risks; next exact action. Record architecture choices in `docs/decisions/`. Any request to broaden Google scopes, introduce a backend, transfer ownership, change the trust model or enable public sharing requires a separate explicit decision.

## 2. Product boundary

Target: the owner and roughly 2–10 trusted friends, each with a Google account, on a shared static app deployment. Everyone can have a private library and join explicitly shared workspaces. There is no app subscription, central content database or community feed.

Required outcomes:

1. Alice's private cards, media, OCR, search results, notes and exports remain inaccessible to Bob through Duckler and its Drive resources unless she intentionally shares a copy.
2. Friends can create their own private libraries using their own Google Drive and quota.
3. Members of a shared workspace can view its entire contents and retained history. Editors can add and edit cards, collections, canvases and annotations asynchronously.
4. Every capture is saved locally before OCR or synchronization. Capture remains fast.
5. Drawing does not alter source-card pixels. Card edits propagate to references inside their workspace.
6. Concurrent edits preserve data and present explicit conflicts.

The static app may be publicly reachable. A deployment URL grants no access to any user's Drive. The intended small audience is an operating scope, not a security boundary enforced by frontend JavaScript. If a hard invitation-only app-access gate is wanted later, use an identity-aware gateway with server-side enforcement under a separate specification. A client-side email allowlist is never authorization.

## 3. Architecture decision: private libraries plus separate shared workspaces

Keep React, TypeScript, Vite, Dexie, React Flow, GIS and Google Drive. No always-on server, central storage bucket, refresh-token service or realtime websocket service is required for this version.

A **workspace** is a complete storage and authorization boundary. Map the existing `libraryId` to `workspaceId` at the application boundary; avoid mechanically renaming every existing wire field. Each workspace has a distinct Drive root, manifest, media namespace, revision history, local database, outbox, inventory and export scope.

- Private workspace: its user's Google Drive folder, created with restricted access and no collaborators.
- Shared workspace: separate top-level folder in its creator's My Drive, explicitly shared with named Google accounts. It is not placed under any private library or broadly shared parent. This does not require the Google Workspace Shared Drives product.
- Each signed-in account can open its own private workspace and accessible shared workspaces.
- One active Google principal per app browser profile at a time. Account changes suspend all old work before loading the new account.
- One Card identity per workspace; collections and canvas placements reference it.

### Explicit exception: copying across privacy boundaries

Never implement sharing by granting access to a private root, private media folder or private revision batch. Never expose a private card by leaving a live cross-workspace reference in a shared canvas.

“Copy to shared workspace” creates a new Card ID, copies explicitly selected current fields, and uploads media into the shared workspace's own namespace. Private and shared copies evolve independently. Deduplicate bytes only inside a workspace. History, private notes, tags, OCR and private membership information are excluded by default; show a field-level preview. The selected image itself may contain private information, so show its actual preview.

Copying a collection/canvas clones selected current cards once per copy operation, rewrites references, then creates the collection or canvas layout in the destination. If a selected card occurs repeatedly, use one new destination Card and several references. Do not copy private ancestors or conflict branches. Store any source-to-destination mapping locally in the source workspace, never as a private Drive ID in shared JSON.

Sharing UI must say “Copy to shared workspace”; never imply that later private edits propagate. Within the shared workspace, all its references still update together.

## 4. Privacy promises, trust model and limitations

Google Drive enforces remote access. Frontend controls improve usability; a malicious user can bypass them, so access tests must call Drive directly with other accounts' tokens.

Protect against accidental cross-account mixing, unauthorized users knowing file IDs, unsafe imported text, malicious URLs/media, wrongly scoped caches, mistaken publication and accidental synchronization conflicts.

Shared-workspace editors are trusted collaborators. Drive writers can have substantial direct access to underlying files. The app's append-only convention cannot prevent an authorized editor from editing or deleting files outside Duckler. Client-provided author IDs are advisory, not a cryptographically verified audit trail. If adversarial-editor resistance, tamper-proof attribution or strict application-only authorization is required, this design needs a mediated backend and a new threat model.

Revocation denies future remote access when effective Drive permissions are removed. It cannot recall previously downloaded files, screenshots or offline copies. A device without network access cannot discover a newly revoked permission. UI and documentation must describe this accurately. Do not claim DRM or remote erasure.

Local IndexedDB separation prevents application routing mistakes; it is not encryption against someone controlling the same browser profile, disk or an XSS vulnerability. For shared computers recommend separate browser/OS profiles. Sign-out clears private local content by default after pending work is resolved or exported. Optional offline retention requires an explicit personal-device choice and shows the account identity.

Duckler's host operator does not receive Drive content through an application backend in this design. The operator controls delivered JavaScript and therefore remains a trusted party. Do not claim privacy from a malicious host operator or from Google. No end-to-end encryption is claimed.

## 5. Authentication and authorization

Preserve GIS's client-side token flow. Obtain the account's stable identity using an authenticated Google API; reuse the existing validated Drive `User.permissionId` binding if implemented. Email and display name are presentation fields, never database identity or authorization proof. If OpenID identity is used, bind the selected identity to the actual Drive token's account before loading or sending data.

- Keep access tokens in memory; never in localStorage, IndexedDB, URLs, logs, caches, exports or extension queues.
- Expiration pauses network jobs with a Reconnect action; local private editing continues. Reconnection is user-driven when GIS requires it.
- Request `drive.file`; do not silently escalate to broad Drive access.
- Enable/configure Google Picker where needed to authorize existing shared roots. Knowing a root ID is insufficient: both app scope and Drive ACL must allow access.
- Treat OAuth app audience/test-user configuration as deployment setup, not a replacement for file permissions. Verify current Google requirements and token behavior before inviting friends; document setup per environment.
- Public client ID and restricted Picker browser API key may be shipped in the frontend. No OAuth client secret or service-account credential belongs there.
- Restrict authorized origins and Picker key referrers/APIs to documented environments. Configure production build values and prove their availability in the built app; do not infer build-time values solely from runtime bindings.

### Roles

| Role | App behavior |
|---|---|
| Owner | Workspace creation, content editing, membership management, recovery and export |
| Editor | Add/edit/trash/restore shared content; resolve conflicts; export accessible content |
| Viewer | Browse/search/read; export/download accessible content; no shared mutations |
| Non-member | No content access, even with known root, media, batch or invite URLs |

Use actual Drive capabilities to enable actions, and expect every remote operation to be independently authorized by Drive. Cached roles are never authority. Serialize permission mutations, re-read permissions after changes, and surface partial failures. Hide member-management actions from editors in Duckler; verify actual Drive resharing restrictions before describing them as enforced.

Default permissions are named-user reader/writer. Never create `anyone`, domain or group permissions in this release. Query inherited and direct access where available. A collaborator-owned file may retain access for its owner after folder removal; this must be measured and included in revocation reporting. Do not promise that the workspace creator owns every contributor upload or pays every byte of quota.

## 6. Mandatory collaboration feasibility gate

Before implementing shared editor UX, run a small real-account prototype using three disposable personal Google accounts: A owner, B friend and C outsider. Use production-equivalent OAuth scopes and the actual app client/project. Preserve evidence with sensitive details redacted.

Prove all of the following:

1. A creates a separate root, manifest, nested media and immutable batch files.
2. A invites B as viewer; B authorizes through Picker as needed and loads manifest, existing descendants and newly created descendants with `drive.file`.
3. B's direct API writes are denied as viewer. C cannot read any known IDs.
4. A upgrades B; B can create media/batches and A can discover/read them, including after re-login and on a fresh browser profile.
5. Changes-feed or inventory discovery catches new files created by either account, delayed visibility and permission changes. Document an inventory rescan fallback.
6. Record actual ownership, quota attribution, delete and resharing capabilities for every file class created by B.
7. Downgrade and revoke B; check root and individual descendants, including B-owned files and any direct grants. Verify what remains accessible and why.
8. Prove that private roots and private media never acquire shared permissions.

Root selection with Picker must not be assumed to grant recursive app access to all descendants. Test it. A requirement to manually authorize every media/batch file is not an acceptable seamless workflow.

If any essential test fails, keep collaboration disabled and write a decision report with observed behavior and options. Do not bypass the failure by requesting broad scopes or public links. Independent private accounts, OCR and drawing can still ship. This gate is a dependency, not an excuse to leave the entire app unfinished.

## 7. Domain models and compatibility

Use the existing Card/revision models and runtime Zod schemas. These interfaces define additions; adjust naming to repository conventions without changing semantics.

```typescript
type UUID = string;
type ISODate = string;
type WorkspaceId = string;
type AccountKey = string; // stable authenticated identity, opaque locally

interface WorkspaceBinding {
  workspaceId: WorkspaceId; // maps to wire libraryId
  accountKey: AccountKey;
  rootFolderId: string;
  mode: 'private' | 'shared';
  deviceId: UUID;
  formatVersion: number;
  lastPermissionCheckAt?: ISODate;
  cachedRole?: 'owner' | 'editor' | 'viewer'; // display hint only
}

interface WorkspaceManifestV2 {
  formatVersion: 2;
  workspaceId: WorkspaceId;
  mode: 'private' | 'shared';
  createdAt: ISODate;
  requiredFeatures: string[];
  folderIds: { media: string; batches: string; backups: string };
  // No member list or role stored here is an authorization source.
}

interface OcrText {
  id: UUID;
  cardId: UUID;
  sourceMediaHash: string;
  text: string;
  languages: string[];
  engine: string;
  engineVersion: string;
  createdAt: ISODate;
  editedByUser: boolean;
}

interface Point { x: number; y: number; pressure?: number }
interface ElementStyle {
  stroke: string; // validated palette/hex color only
  strokeWidth: number;
  fill?: string;
  opacity: number;
}
interface CanvasElementBase {
  id: UUID;
  canvasId: UUID;
  x: number; y: number;
  width: number; height: number;
  rotation: number; // degrees
  zIndex: number;
  createdAt: ISODate;
  anchorPlacementId?: UUID;
  // When anchored: x/y and dimensions use placement-local coordinates.
  // Otherwise: canvas-world coordinates. Never both.
}
type CanvasElement = CanvasElementBase & (
  | { kind: 'stroke'; points: Point[]; style: ElementStyle }
  | { kind: 'rectangle' | 'ellipse'; style: ElementStyle }
  | { kind: 'text'; text: string; fontSize: number; color: string }
);
interface CanvasConnector {
  id: UUID;
  canvasId: UUID;
  source: { type: 'placement' | 'element'; id: UUID };
  target: { type: 'placement' | 'element'; id: UUID };
  label: string;
  arrow: 'none' | 'end' | 'both';
  style: ElementStyle;
}
interface PlacementV2 {
  id: UUID; canvasId: UUID; cardId: UUID;
  x: number; y: number; width: number; height: number;
  zIndex: number; rotation: number; // old placements default to zero
}
interface LocalCaptureDestination {
  accountKey: AccountKey;
  workspaceId: WorkspaceId;
  pairingId: UUID;
  pairingGeneration: number;
}
interface CopyOperation {
  id: UUID;
  destinationWorkspaceId: WorkspaceId;
  state: 'preparing' | 'committed' | 'syncing' | 'complete' | 'blocked';
  destinationCardIds: UUID[];
  // Local source-side record; source mappings never enter shared batches.
}
```

Add separately revisioned entity kinds `ocrText`, `canvasElement` and `canvasConnector`. Add rotation with a backward-compatible zero default. Revision envelope retains `libraryId`, parent revision IDs, Lamport time, device ID, tombstones and full recoverable value. Optional author display metadata is untrusted. Reject cross-workspace references and non-finite geometry. Each revision belongs to exactly one workspace.

Keep formatVersion, IndexedDB schema version and app version distinct. New shared roots use format v2. For existing private libraries, write an explicit compatibility plan before migration: preserve all v1 history, decode v1 records, and upgrade manifest/feature metadata without rewriting immutable batches. Old clients must pause safely on unsupported features. An offline old client may still upload v1 history; ingest valid history without discarding it. Do not rely on a manifest flag to remotely disable unmodified old binaries. Before a user's migration, require upgrading their known devices and exporting a complete backup. Rollback restores into an isolated database; never silently downgrade a database.

## 8. IndexedDB, worker, extension and cache isolation

Separate database per `(accountKey, workspaceId)`. Use an opaque stable encoding in DB names. Bootstrap contains bindings only; it must not contain private card thumbnails, note previews or search content. Existing anonymous/local v1 data is a separate unbound namespace until an explicit migration binds it to one verified account.

New stores: `ocrTexts`, `ocrJobs`, `canvasElements`, `canvasConnectors`, `copyOperations`, `permissionState`. All live in the workspace database. Index elements by canvas and anchor placement; connectors by canvas and endpoints; OCR by card and source hash. Jobs include source hash, state, attempts and cancellation/generation IDs. Permission cache is non-authoritative.

Account switch sequence: suspend capture import and sync; cancel HTTP/worker tasks; invalidate the session generation; close DB subscriptions and BroadcastChannels; revoke Blob URLs and clear visible UI; clear in-memory tokens; then verify the new identity and open its namespace. Every async completion checks its captured session/account/workspace generation before committing or displaying a result. Namespace Web Locks, BroadcastChannels, thumbnails, search indexes, object URLs, receipts and diagnostics.

CacheStorage holds public app assets and OCR assets only. Keep private/shared media in the correct IndexedDB workspace. Never let Workbox cache OAuth, Drive responses, bearer requests or private JSON by URL. Do not use a bare media hash as a global private cache key. Enforce a total device cache budget as well as per-workspace limits.

Extension remains a capture queue. Bind each queued capture immutably to its account/workspace/pairing generation at capture time. Show destination in the extension-owned UI. Default to private capture. Switching workspace/account never retargets queued data. A mismatched destination pauses delivery with an explicit reassignment/copy flow. Re-pairing invalidates old active sessions, preserving queued bytes. Never reveal private workspace names or content to a source webpage.

PWA shared uploads use a neutral inbox and require destination selection when account/workspace context is ambiguous. A logged-out share must not silently bind to the next person who signs in. Existing local-only captures remain recoverable through an explicit owner selection/import screen.

## 9. OCR and search

Use Tesseract.js in a dedicated worker, loaded only when needed. Pin and preferably self-host its scripts, WASM and selected language assets; include licenses. Default languages English and Portuguese; download only selected assets. No paid OCR API or upload to a third-party OCR provider.

First version: Extract text, progress, cancel, retry, copy, edit and re-extract. Opt-in background processing may follow measured performance. Never block capture, thumbnail display or sync waiting for OCR. One OCR job at a time on the initial mobile/notebook targets; pause background jobs under heavy interaction.

Downscale oversized OCR input without changing the stored original. Enforce image and output text limits. Bind each result to sourceMediaHash; if media changes while a job runs, store as stale history or discard the new derivative safely, never present it as text from the new image. Keep manual corrections as revisions; do not overwrite them automatically. Search indexes include only active, non-stale OCR for the current workspace. Search by text does not imply visual image understanding.

OCR text is potentially sensitive card content. Shared OCR jobs run only on shared media and write results into that shared workspace. Copy-to-shared excludes pre-existing private OCR by default, even if a user may separately extract the same visible text after sharing.

## 10. Canvas drawing, annotation, rotation and connectors

Extend the existing React Flow adapter. Use custom nodes/edges and SVG paths behind a small rendering adapter. Do not replace the canvas engine or introduce an entire second editor library before profiling proves it necessary. Persist domain shapes, never React Flow internals or arbitrary SVG/HTML.

Toolbar: Select, Hand, Pen, Highlighter, Rectangle, Ellipse, Text, Connector, Undo, Redo. Provide a small color palette, stroke sizes, opacity, object eraser/delete, and rotation reset. Initial eraser removes a whole stroke/object. Exclude pixel erasing, brushes, layers UI, threaded comments and collaborative cursors.

Coordinate behavior:

- All pointer positions convert screen-to-world once through the canvas adapter.
- Freehand points are local to the stroke's bounding box; normalize on commit.
- Pen/highlighter drawing commits one revision per finished stroke, not per pointer event.
- Pointer capture handles leaving bounds; Escape cancels only the active gesture. Pointer cancellation must never create malformed paths.
- Mouse/pen drawing and touch pan/zoom have explicit modes. Disable conflicting node drag/selection during drawing. Test actual Android behavior.
- Selection, viewport, tool and hover stay local. Persist geometry on gesture completion; text commits on blur or bounded debounce.
- Multi-object move writes one local transaction; each changed object has an independent revision.

Card annotation is anchored to a particular placement. It follows that placement's position/scale/rotation via a local transform; repeated appearances elsewhere do not inherit it. Canvas-global annotations remain fixed in world coordinates. Removing a placement hides its anchored annotations, preserving them for restore; offer an explicit detach action if keeping them on the board. Replacing card media may invalidate annotation meaning: mark anchored annotations for review using a local/recorded source hash association.

Rotation belongs to placements/elements; source images remain untouched. Connectors refer to placement/element IDs, never Card IDs. Endpoint movement/rotation updates their geometry. Deleted endpoints hide connectors reversibly and show an orphan count in recovery. Resolving references may require fetching missing revisions; missing objects do not authorize deletion.

Shared undo creates compensating revisions only for the local user's command, after checking current heads. If another edit intervened, offer conflict review instead of reverting a collaborator's work silently.

Initial limits: 200 card placements, 500 annotation elements, 200 connectors per canvas; 5,000 sampled points per stroke; 20,000 characters per text element. Simplify stroke samples with bounded visual error. Validate limits on import and remote ingestion. Measure the mixed fixture on the actual notebook and phone; reduce visible detail adaptively, never discard persisted data for performance.

## 11. Shared Drive storage and publishing

```
My Drive/
  Visual Library/                  # each user's existing PRIVATE root
  Duckler Shared - <name>/         # separate explicitly shared root
    library.json                  # workspace manifest v2
    media/
    database/batches/
    canvases/                     # derived exports only
    backups/
```

Preserve immutable media and revision batches. Workspace IDs, actual root/parent relationships and validated manifests constrain discovery; appProperties alone are not a security boundary. A remote record naming a foreign Drive file must not cause the app to fetch from private roots. Validate each media location's workspace containment before use; cache verified containment and recheck on suspicious changes/moves. Shared JSON must never reference private Drive IDs.

Shared media hashes may match private bytes, but remote file locations must be separate. Do not use Drive shortcuts into private roots. Shared exports/backups include only shared data and must live inside the same access boundary or be explicitly downloaded by an authorized member.

Copy/publish transaction: prepare sanitized snapshot and fresh IDs locally; persist destination media and revisions atomically in the destination database; queue media uploads; publish metadata batches after all required media is confirmed. Keep a durable copy operation ID for retry deduplication. A network interruption must not duplicate cards. Members may temporarily see partial grouped publication; mark loading dependencies accurately rather than claiming cross-file Drive transactions.

## 12. Membership, joining and revocation UX

Create a shared workspace empty first. Verify its restricted ACL. The owner types a friend's exact Google email and selects Viewer or Editor. Show workspace name, recipient, role and the fact that all workspace contents/history are included before submission. Sending Drive invitation notifications requires this explicit user action; tests use disposable accounts.

An invitation/join URL contains a root locator only. No bearer token, private content or broad access grant is encoded. Opening it requires Google authorization and actual access. Prefer a URL fragment for locator transport; remove it after use and set a restrictive Referrer-Policy. Handle wrong account, revoked invite and malformed locator without showing workspace contents.

Only mark invitation successful after Drive confirms the grant and a permission re-read. If a timeout leaves the outcome uncertain, inspect existing grants before retrying. Separate “permission granted” from “friend has opened the workspace.” Exclude in-app email sending services.

On startup, foreground/resume, manual sync and before uploading queued shared edits, refresh capabilities. Use a bounded background recheck while online. API denial immediately suspends the affected operation. Distinguish expired authorization, rate limits, missing resource and revoked access; avoid treating every 403 as revocation.

On confirmed loss of access, stop shared sync, hide workspace content, invalidate its media URLs/search results and schedule deletion of clean shared cache. Preserve unuploaded user changes in a quarantined recovery bundle until the user explicitly exports or discards them; never upload under another account. Do not claim that local purging removes external downloads.

Revocation workflow must inspect effective root and descendant grants and ownership, sequentially remove grants the owner can remove, then report remaining access truthfully. “Fully revoked” requires evidence for the supported ownership pattern. If collaborator ownership prevents that guarantee, label the result partial and explain the exact remaining file access. Collaboration release must expose this behavior rather than hide it behind a success toast.

## 13. Synchronization and conflict handling

Reuse the v1 immutable revision DAG, media-first uploads, idempotent transfer IDs and conservative reducer. Use one account-bound Drive client and independent workspace sync state. Never mix revisions from different workspaces in one batch or assign one workspace's changes cursor to another without the existing account-level dispatcher contract.

Suggested defaults: debounce changed metadata for about 5 seconds after interaction; cap upload frequency during continuous editing to roughly once per 15 seconds; pull active shared workspace about every 30 seconds while online/visible, plus manual refresh and foreground. These are tunable targets subject to Drive quotas/backoff. Suspend idle/hidden polling. UI says “Updates appear after sync”; there are no realtime guarantees.

Different objects edited by different people merge naturally as separate entities. Concurrent revisions of the same card, text annotation, stroke, placement or connector preserve multiple heads. Render a deterministic provisional head with a conflict badge. Provide Keep mine, Keep other, or Duplicate as new object where valid. Resolution revisions reference all reviewed heads. Wall-clock timestamps do not decide winners. Delete-versus-edit retains both for recovery.

Permissions are never merged as ordinary content revisions. Drive is authoritative. A viewer with stale editor UI may create local work due to a race; remote writes must fail and the local work enters recovery. Changing a local role field must never grant remote write access.

Do not implement leases stored in Drive, per-pointer network traffic, character-level merges or a CRDT framework. Deduplicate OCR jobs opportunistically; independent conflicting OCR results remain recoverable. Do not attempt globally exclusive background-worker locks across users.

## 14. Security implementation requirements

- Plain text rendering for titles, annotations, OCR, tags and connector labels; no `dangerouslySetInnerHTML` for saved content.
- Reject executable URLs and arbitrary imported SVG/HTML. Resolve only allowed http(s) source links; use safe external-link attributes.
- Validate JSON structures, schema versions, IDs, parents, hashes, MIME signatures, decoded dimensions, finite geometry, counts and nesting limits before materializing remote/imported records.
- Archive import limits cover expanded bytes, entry count, path traversal, duplicate filenames and decompression bombs. Validate into a staging DB before activation.
- Configure a restrictive production CSP with only required Google endpoints and self-hosted application/OCR assets. Avoid unsafe-eval. Test workers and WASM against the actual policy.
- Keep all Google/API authorization out of diagnostic logs; diagnostics omit card text, email addresses, file contents and tokens by default.
- No analytics/session replay on private views. Never load source-page tracking images as authoritative card thumbnails.
- Never fetch an arbitrary user-supplied URL through a future server proxy without a separate SSRF design.
- Freeze exact-origin extension allowlists per environment; validate sender, frame, nonce, protocol, account and workspace binding.
- Ignore member/owner claims supplied by content files when authorizing operations. Inspect effective Drive access.
- Show Private or Shared prominently in the library, capture destination and canvas toolbar. Sharing requires an explicit destination and preview.

No automatic destructive cleanup of remote history, tombstones or unused media. Shared history can expose removed text to workspace members: warn at publication preview that subsequent deletion is not secure redaction. Provide separate-workspace publication for a clean current snapshot. Do not market ordinary trash as confidential erasure.

## 15. Repository changes

Extend existing packages instead of creating a service framework:

```
packages/domain/      # new entities, workspace boundary validation
packages/storage/     # account/workspace DB resolver, migrations
packages/sync/        # per-workspace orchestration, permission adapter
packages/protocol/    # destination-bound capture and pairing generation
packages/export/      # v2 full-fidelity archive + annotation export
apps/web/src/features/{workspaces,sharing,ocr}/
apps/web/src/features/canvas/{tools,elements,connectors}/
apps/web/src/workers/ocr.worker.ts
tests/{security,migrations,collaboration}/
docs/{privacy,sharing,google-setup,recovery,progress}.md
```

Tesseract.js is the only required major new feature dependency initially. React Flow supports custom edges; inspect its current adapter before adding drawing helpers. Pin dependencies, review licensing and lazy-load large modules. PDF.js is optional and loaded only for PDF workflows.

## 16. Backups, export and recovery

Native archive v2 includes all new entities, tombstones, conflict heads, required media, schema/features and a completeness report. Exclude OAuth credentials, permission grants as executable instructions, account bindings, device IDs to be reused, and private-source copy mappings from shared exports.

Restoring a shared archive into a private workspace creates an explicit independent fork with new workspace identity and remapped references; retain provenance inside the archive report. It must not recreate membership grants or reconnect to a shared root automatically. Restoring history into the same shared workspace requires current write access, a fresh remote scan and the original revision IDs for deduplication.

Metadata backups on the same Drive are insufficient against authorized collaborator deletion. Offer downloadable complete archives and owner-held private backups of shared workspaces. Clearly label that a private backup contains previously shared material; revocation cannot erase it. Never merge these backups into unrelated personal library cards automatically.

Obsidian export includes OCR as an optional clearly labeled section, plus text annotations and a canvas preview if implemented. Exact editable drawings/connectors/rotation are preserved in the native archive. Do not claim full Obsidian fidelity unless a separately tested canvas export exists.

## 17. Runnable milestones

Every milestone: run repository typecheck, lint, relevant unit/integration tests, relevant browser E2E and production build. Record the actual commands. Run additional real-device/account tests only where required. Each milestone must leave existing features runnable and maintain an export/recovery route.

### M8 — Baseline audit and compatibility foundation

**Works:** existing app; feature flags default off; verified full native export/restore; repository-to-spec gap report; v2 schemas with compatibility tests.

**Unfinished:** new user-facing features and sharing.

**Acceptance:** preserve IDs, media, receipts, conflicts and pending jobs through migration fixtures; confirm original live Drive/offline/Obsidian gates or record them as pending. No rewrite or destructive migration.

**Tests:** baseline smoke, restore in fresh DB, interrupted migration, old-tab upgrade blocking, unknown-feature handling, v1 batch ingestion after v2 upgrade.

### M9 — Independent private accounts and safe switching

**Works:** each friend uses their own private Drive-backed library; account/workspace-scoped stores, workers and extension destinations; explicit anonymous-library binding.

**Unfinished:** shared workspaces; OCR/drawing.

**Acceptance:** A and B use the app independently; neither can see the other's cards/search/thumbs or cause cross-account upload. Switch accounts with pending sync, capture and media requests without leakage.

**Tests:** real A/B accounts, direct unauthorized Drive reads, generation-race tests, service-worker cache inspection, account switching across tabs, sign-out cleanup with pending edits, capture destination mismatch, ambiguous mobile shares.

### M10 — On-demand OCR

**Works:** extraction, cancel/retry, copy/edit, stale detection, private-workspace text search and sync of OCR entities.

**Unfinished:** auto OCR on every capture, semantic search, AI tagging/summaries.

**Acceptance:** English/Portuguese fixtures produce useful searchable text; screenshot save remains immediate; original media replacement cannot show obsolete text as current.

**Tests:** worker cancellation/account switch, memory/size limits, offline language availability, extraction failure, corrected-text preservation, two-device OCR conflicts, representative notebook/phone timing.

### M11a — Canvas connectors and rotation

**Works:** placement rotation/reset; reference-based arrows/lines and labels; local undo; export/restore.

**Unfinished:** drawing, shared editing and elaborate connector routing.

**Acceptance:** endpoints follow geometry; repeating the same Card uses independent placements; removal/restore retains recoverable connectors.

**Tests:** zoom/rotation hit-testing, endpoint validation, multiple placements, dangling references, undo after changed heads, archive round-trip.

### M11b — Drawing and annotations

**Works:** pen, highlighter, rectangle, ellipse, plain text, object eraser, selection, anchored annotations and gesture commits.

**Unfinished:** live cursors, threaded comments, pixel eraser, pressure-sensitive brush engine.

**Acceptance:** draw/pan/zoom with mouse, stylus where available and actual Android touch; annotations survive reload/sync/export; source images remain original; mixed-canvas fixture meets recorded interaction targets.

**Tests:** transform mapping, pointercancel/Escape, long strokes, text injection, gesture transaction count, media replacement, anchor removal/restore, multi-object undo and concurrent annotation conflicts.

### M12 — Real Drive collaboration feasibility prototype

**Works:** developer-only disposable shared workspace with the complete section 6 test harness and evidence report.

**Unfinished:** production invitations and friends collaboration UX; flag remains off.

**Acceptance:** real A/B/C tests establish discovery, scoped authorization, new-file ownership and effective revocation behavior. Document any remaining ownership limitations and how UI will represent them.

**Tests:** section 6 matrix, repeat on fresh browser profiles, force token expiration and reconnect, create files from both accounts. No broad-scope/public-link workaround.

### M13 — Explicit sharing and viewers

**Works:** create separate shared workspace, preview/copy selected private content, named viewer invitations, join flow, read-only shared browsing and access status.

**Unfinished:** shared editor mutations, presence and public publishing.

**Acceptance:** A shares a sanitized copy; B sees it; C cannot access known IDs; A's private note edits never propagate. Viewer direct writes are denied. Partial publication/retry does not duplicate cards.

**Tests:** copied-field allowlist, media containment, repeated references, copy transaction failure, permission grant timeout, wrong-account join, viewer API write rejection, full archive leakage inspection, revoked clean-cache invalidation.

### M14 — Asynchronous collaborative editing

**Works:** editor role, shared cards/collections/canvases/OCR/annotations, sync status, conflicts, downgrade and truthful revocation/recovery.

**Unfinished:** realtime presence, character-level merge, adversarial-writer protection, ownership transfer and guaranteed closed-app sync.

**Acceptance:** A/B independently edit different objects and converge; same-object edits preserve both; offline reconnect works; role changes prevent unauthorized remote writes; contributor-owned-file access is correctly reported on removal.

**Tests:** randomized DAG delivery/duplication/order, delete-vs-edit, concurrent stroke edits, permission change while uploading, late async completion after switch, malicious batch references, direct out-of-app modifications, lost upload responses, actual A/B devices and C outsider.

### M15 — Friends pilot and privacy release gate

**Works:** documented onboarding, recovery, privacy controls, scoped exports and a limited pilot with real friends after test-account gates pass.

**Unfinished:** optional features below; no growth/SaaS infrastructure.

**Acceptance:** each pilot participant independently creates a private library; at least two collaborate successfully; private test content never appears in another account; backups restore; manual outstanding gates are explicit. Review the actual access model with pilot users.

**Tests:** production HTTPS/CSP/OAuth/PWA/extension integration, fresh-device onboarding, restore after cache loss, exported shared-history review, logout/account-switch regression and a recorded outsider-access test. Inspect production logs for content/tokens. Release sharing only after M12–M15 evidence is complete.

### M16 — Optional PDF ingestion, after the pilot

**Works:** PDF file Card, first-page thumbnail, lazy PDF.js viewer, selected-page image capture linked to source PDF/page; plain text extraction for searchable text-based PDFs.

**Unfinished:** video, PDF editing, whole-document scanned-PDF OCR, automatic remote URL crawling.

**Acceptance:** bounded local PDFs render; page captures preserve provenance and workspace boundary; shared PDF copies are explicit. Existing images remain compatible.

**Tests:** corrupt/password-protected files, large-page limits, worker resource cleanup/account switch, hostile links, source-page round-trip, offline cached viewing. Start with a documented 25 MiB/200-page limit and lazy rendering; tune only from measurements.

### M17 — Optional shallow collection nesting

**Works:** one additional parent/child level inside a workspace; existing flat collections remain roots.

**Unfinished:** arbitrary depth, nested canvases, per-subcollection permissions.

**Acceptance:** moves preserve memberships; cross-workspace parents are rejected; cycles and invalid concurrent parent changes become recoverable conflicts. Nesting never changes Drive ACLs.

**Tests:** cycle prevention, concurrent reparent/delete, migration of flat fixtures, hierarchy export/restore and explicit orphan rendering.

## 18. Release-blocking tests and operational limits

Required matrix: owner A, editor B, viewer V, outsider C; two browser profiles; desktop/notebook; actual Android for touch/share; online/offline; expired token; downgraded/revoked membership; fresh/cached data. Accounts may be reused sequentially for roles, but record each transition.

Security tests must try direct API requests and guessed/known identifiers, not only hidden buttons. Inject foreign workspace IDs/file IDs into media descriptors, batches, deep links, extension messages, exports and search callbacks. No private read/upload/UI render may result. A content hash match must never let one workspace borrow another's private file location.

Performance gate: no substantial regression against recorded v1 capture/library benchmarks; OCR disabled has no OCR bundle in the critical initial path; drawing emits bounded revisions; visible shared polling is bounded with exponential backoff and jitter. Stop retry storms on quota/auth failures. Instrument only timings/counts by default.

## 19. Features deliberately deferred

No social feed, public link sharing, subscriptions, central tenant admin, threaded comments, notifications service, native app, Firefox work without a concrete need, AI summaries/tags, embeddings/semantic search, HTML archive, video ingestion, full-page stitching, two-way Obsidian sync, remote garbage collection, CRDT, permanent background sync or end-to-end encryption.

The largest new complexity is authorization and privacy-boundary correctness, followed by shared ownership/revocation and offline conflict UX. The number of friends does not remove these obligations. Keep private multi-user use independently shippable if Drive-native collaboration fails its gate.

## 20. Source notes and design assumptions

Checked 4 October 2026. These sources support platform capabilities; proposed limits, milestones, privacy UX and architecture are project decisions. Recheck current docs at implementation time.

- Drive permissions/capabilities, inheritance and sequential permission operations: https://developers.google.com/workspace/drive/api/guides/manage-sharing
- Narrow per-file OAuth scope: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Picker integration and app authorization: https://developers.google.com/workspace/drive/picker/guides/web-picker
- GIS token flow and expiration: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Google auth flow comparison: https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model
- Tesseract.js browser OCR: https://github.com/naptha/tesseract.js
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges
- PDF.js browser examples: https://mozilla.github.io/pdf.js/examples/

The Drive feasibility test is mandatory precisely because general documentation cannot establish that this application's folder tree, narrow scope, cross-account uploads and revocation behavior compose as required.

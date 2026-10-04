# Progress log

## Specification authority

The repository contains two specification documents:

- `docs/specification.md` is an earlier, generic scaffold specification for the monorepo foundation and milestone 1 only.
- `Visual-Library-Codex-Specification.md` is the detailed product and engineering specification selected as the authoritative baseline for this project.

The later document takes precedence for architecture, product requirements, non-goals, and milestone ordering. The earlier docs/specification file was preserved as historical context and does not override the later selection.

## Historical command history

These commands record the earlier pnpm-based scaffold. The current workspace uses npm and `package-lock.json`; use the npm commands in README.md for current development and deployment.

- `corepack enable`
- `corepack prepare pnpm@9.15.0 --activate`
- `corepack pnpm install`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`
- `curl.exe -I http://localhost:5176`

Verification evidence from that earlier scaffold:
- Test suite passed: 34/34 tests (15 shared, 8 web app, 2 extension-import, 3 share fallback, 3 Cloudflare Pages Function, 3 extension-worker).
- `corepack pnpm lint` passed.
- `corepack pnpm typecheck` passed.
- `corepack pnpm build` passed; Vite reports the existing large-chunk advisory.
- Extension JavaScript syntax and Manifest V3 JSON/resource-reference validation passed.
- Extension worker tests verify queue persistence across a simulated worker restart; this is a mock, not a real Chrome lifecycle test.
- Local app responds with HTTP 200 on http://localhost:5176.

## Results

- Monorepo scaffold created for the personal visual library v1 foundation.
- Shared validation and card schema are implemented in the shared package.
- The web app initializes a Dexie-backed local library and supports adding/searching/editing/trashing cards.
- JSON export is available for the current in-memory library state.
- Milestone 2 adds flat collections, collection membership, multi-select bulk assignment, and collection filtering.
- Milestone 3a includes an unpacked Chromium MV3 extension with a page/note capture popup, selection/link/page context menus, visible-region screenshot overlay and crop, shortcut, durable extension queue, queue export, app URL configuration, and local app import.
- Milestone 3b now includes exact-origin/library pairing, authenticated app-initiated Ports, bounded chunk transport with SHA-256 validation, and atomic card/receipt commits before extension ACK. Capture itself no longer opens app tabs or sends payloads in navigation URLs.
- Milestone 4 adds a simple local canvas view with card nodes and viewport controls for the local-first visual library.
- M5a includes a pure revision DAG reducer, conflict tracking, upload jobs, and fake Drive cursor/inventory state.
- M5b adds a real OAuth hook for Google Drive via Google Identity Services and a visible configuration gate in the app UI when VITE_GOOGLE_CLIENT_ID is absent.
- M6a adds responsive mobile navigation, pending share queue persistence, and a share-target flow that accepts incoming shared URLs/text and imports them into the library once the app opens.
- M6b adds local cache diagnostics, persistence controls, and the recovery polish required for storage and upgrade safety.
- M7 adds a one-way Obsidian export archive with Markdown cards, collection indexes, attachments, and a root manifest for manual import into an Obsidian vault.
- M7 export coverage now verifies Unicode-safe stable paths, Markdown/YAML escaping, working relative attachment/collection links, missing-media and unresolved-membership reports, and optional sync conflict snapshots in the export report.
- The library UI now includes media-type filter chips, a visual collection gallery with card previews, and a compact local profile with editable name, @tag, and photo.
- Profile name, handle, and photo persist only in this browser profile; photos are limited to JPEG/PNG/WebP up to 1 MiB. Tests cover profile field persistence and photo removal.
- Cloudflare Pages configuration now includes the monorepo build/output settings, cache/security headers, a share-target POST fallback, Wrangler preview/deploy commands, and deployment/OAuth setup documentation.
- Tests cover schema normalization, collection membership logic, queue events, deduplication, the app render flow, the sync-engine state transitions, and the Obsidian export manifest.

## Remaining limitations

- M5b is now validated with real Drive access and a second-browser confirmation: the app can sign in and sync correctly across devices.
- Full Android share-sheet validation remains external and device-dependent, but the web app side is now ready for the real device test.
- Real Chrome/Edge capture acceptance remains pending: full Chromium could not launch in this Windows environment (`spawn UNKNOWN`). DPR/zoom screenshots, keyboard commands, context menus, live worker restart, and real storage quota behavior require acceptance testing. M3b pairing/transport/atomic ACK behavior is implemented and unit-tested; the generated MV3 development build is available at `apps/extension/dist/development`.
- M7's final release gate remains open: the exported archive has not been opened in an actual Obsidian vault, and the current web app does not supply its live sync conflict state to the exporter. Exports mark conflict status as unknown rather than reporting a false zero.
- Full background sync, archive backup, and direct two-way Obsidian vault editing remain outside the v1 scope.
- Export remains local JSON and one-way Obsidian archive unless a later milestone adds archive-backed backups.

## UX refinement and extension hardening (October 2026)

- Card selection, edit, move, and delete controls now sit in a reserved row above the card. Hover/focus reveals background-free icons; touch keeps them visible. Move and permanent delete are direct buttons, with only a destination picker for movement. Moving atomically replaces prior collection memberships; permanent deletion retains its confirmation.
- The floating + menu opens on hover or keyboard focus, with a pointer bridge to its menu. Cards reveal an explicit Edit button and larger options target on hover/focus; touch keeps both visible. Card editing now uses the supplied compact pill-toolbar reference, a large note area, optional source/collection controls, and explicit Save. Card edits and collection membership commit atomically; closing without Save discards edits.
- Screenshot review and toolbar capture now offer editable Title and optional Collection fields without the extra explanatory subtitles. Collection names travel in the validated capture payload; import atomically creates or reuses the named collection alongside the card and receipt. Repeated deliveries preserve later membership edits. The compact toolbar layout keeps Save and footer controls within the visible popup.
- Card hover/focus now reveals a local options menu for note editing, collection membership, trash, and confirmed permanent deletion. Touch devices keep these controls visible. Bulk actions appear only for two or more selected cards and stay in document flow. Permanent deletion atomically cleans stored collection references.
- Region capture now returns an unsent screenshot draft and opens an on-page review dialog with a note field, explicit Save, and Discard. Queue delivery starts only after Save; failures retain the review for retry. Regression coverage verifies single/multiple selection, collection assignment, deletion persistence, note inclusion and discard without delivery.
- Capture popup now follows the supplied dark panel reference with rounded segmented tabs, capture-mode icons, a visible note label, and neutral gradient controls. Settings and library links remain visible controls; oversized content scrolls within Chromium's popup height limit. Both extension builds were rebuilt, 23 extension tests passed, and the layout was rendered locally with browser API mocks (not a live extension acceptance test).
- npm workspaces remain the monorepo toolchain. Both extension and app build locally.
- The refs workspace is centered, defaults to dark, uses bundled/offline-cached Inter, and uses the supplied duck artwork without a header wordmark.
- Cards have natural image proportions, rounded corners, compact captions and external collection pills. Profile hover is read-only; editing and connections live in Settings.
- Home always keeps search and distinct animated Collections/Canvas launchers, with filled icons and the complete bottom dock. Empty libraries remain empty; filtering controls are text-first and only appear inside all notes or a collection. Internal pages have back navigation.
- Search follows scrolling with a floating treatment and limited card clearance (6 px desktop, 3 px phone). Reduced-motion preferences disable ornamental movement.
- Browser checks cover 320/360/390/414/768/1024 px, landscape, menu bounds, editor Save visibility, modal dismissal, empty state and scroll behavior. Automated unit/integration coverage passes for durable capture queues, defensive origins, receipt replay and atomic note/collection saves.
- Google Drive authorization and synchronization implementation were not changed in this pass.
- The extension popup now has a visible Settings label and a connection-settings footer link, with options-page fallback and explicit failures. Both generated extension builds retain the Manifest V3 options page.
- The profile identity rectangle alone uses a glass texture and a locally saved, user-selectable accent color; hovering remains read-only.
- Canvas opens a centered collection gallery. Each collection has its own live card membership, draggable positions and viewport stored separately in IndexedDB. These layouts remain local and are not yet included in Drive synchronization or the card JSON/Obsidian exports.
- `npm run test:canvas:ui` verifies gallery bounds, collection isolation, dragging, viewport storage and persistence after a full browser reload in an isolated profile.

## Architectural note

The design follows the selected Visual-Library specification by keeping the content model immutable at the card level, modeling collections as reference lists, and treating sync as a revision DAG with conservative conflict detection before remote delivery. The app now makes the external Google credential requirement explicit instead of masking it as a local success.

## Required unblock for M5b

To finish the M5b validation gate, provide:

1. A valid `VITE_GOOGLE_CLIENT_ID` for the web app.
2. A Google account with Drive API access and a personal test library root.
3. A second device or browser profile for the cross-device sync test.

After those are available, run the desktop + notebook sequence described in the specification: create/open the library, edit offline, reconnect in either order, and verify convergence with preserved conflicts.

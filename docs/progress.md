# Progress log

## Specification authority

The repository contains two specification documents:

- `docs/specification.md` is an earlier, generic scaffold specification for the monorepo foundation and milestone 1 only.
- `Visual-Library-Codex-Specification.md` is the detailed product and engineering specification selected as the authoritative baseline for this project.

The later document takes precedence for architecture, product requirements, non-goals, and milestone ordering. The earlier docs/specification file was preserved as historical context and does not override the later selection.

## Command history

- `corepack enable`
- `corepack prepare pnpm@9.15.0 --activate`
- `corepack pnpm install`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`
- `curl.exe -I http://localhost:5176`

Latest verification evidence:
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
- Milestone 3b includes a foreground handoff that opens the configured app with a stable capture ID; app storage prevents duplicate Cards on retries. App-side share captures also retain duplicate-safe processing.
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
- The browser extension has not yet been loaded in Chrome/Edge for real-browser validation. Screenshot DPR/zoom behavior, keyboard commands, context menus, real service-worker restart, and actual queue quota failure still require browser acceptance testing. M3b's exact-origin pairing, chunk transport, app-initiated Port/ACK flow, and atomic import/receipt remain unimplemented; current foreground deep-link handoff is functional but does not claim those guarantees.
- M7's final release gate remains open: the exported archive has not been opened in an actual Obsidian vault, and the current web app does not supply its live sync conflict state to the exporter. Exports mark conflict status as unknown rather than reporting a false zero.
- Full background sync, archive backup, and direct two-way Obsidian vault editing remain outside the v1 scope.
- Export remains local JSON and one-way Obsidian archive unless a later milestone adds archive-backed backups.

## Architectural note

The design follows the selected Visual-Library specification by keeping the content model immutable at the card level, modeling collections as reference lists, and treating sync as a revision DAG with conservative conflict detection before remote delivery. The app now makes the external Google credential requirement explicit instead of masking it as a local success.

## Required unblock for M5b

To finish the M5b validation gate, provide:

1. A valid `VITE_GOOGLE_CLIENT_ID` for the web app.
2. A Google account with Drive API access and a personal test library root.
3. A second device or browser profile for the cross-device sync test.

After those are available, run the desktop + notebook sequence described in the specification: create/open the library, edit offline, reconnect in either order, and verify convergence with preserved conflicts.

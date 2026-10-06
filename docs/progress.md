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

- Local reskin pass in progress (not committed): the existing navigation and card architecture now has an isolated Sony / PlayStation-era token layer, a smooth center-lit CRT charcoal surface without texture overlays, restrained interaction motion, angled card selection details, external card action styling, and matching extension popup material. Settings includes live editable appearance presets and per-user color tokens; review is pending before commit.
- Card selection, edit, move, and delete controls now sit in a reserved row above the card. Hover/focus reveals background-free icons; touch keeps them visible. Move and permanent delete are direct buttons, with only a destination picker for movement. Moving atomically replaces prior collection memberships; permanent deletion retains its confirmation.
- The floating + menu opens on hover or keyboard focus, with a pointer bridge to its menu. Cards reveal an explicit Edit button and larger options target on hover/focus; touch keeps both visible. Card editing now uses the supplied compact pill-toolbar reference, a large note area, optional source/collection controls, and explicit Save. Card edits and collection membership commit atomically; closing without Save discards edits.
- Screenshot review and toolbar capture now offer editable Title and optional Collection fields without the extra explanatory subtitles. Collection names travel in the validated capture payload; import atomically creates or reuses the named collection alongside the card and receipt. Repeated deliveries preserve later membership edits. The compact toolbar layout keeps Save and footer controls within the visible popup.
- Card hover/focus now reveals a local options menu for note editing, collection membership, trash, and confirmed permanent deletion. Touch devices keep these controls visible. Bulk actions appear only for two or more selected cards and stay in document flow. Permanent deletion atomically cleans stored collection references.
- Region capture now returns an unsent screenshot draft and opens an on-page review dialog with a note field, explicit Save, and Discard. Queue delivery starts only after Save; failures retain the review for retry. Regression coverage verifies single/multiple selection, collection assignment, deletion persistence, note inclusion and discard without delivery.
- Capture popup now follows the supplied dark panel reference with rounded segmented tabs, capture-mode icons, a visible note label, and neutral gradient controls. Settings and library links remain visible controls; oversized content scrolls within Chromium's popup height limit. Both extension builds were rebuilt, 23 extension tests passed, and the layout was rendered locally with browser API mocks (not a live extension acceptance test).
- npm workspaces remain the monorepo toolchain. Both extension and app build locally.
- The refs workspace is centered, defaults to dark, uses bundled/offline-cached Inter, and uses the supplied duck artwork without a header wordmark.
- Cards have natural image proportions, rounded corners, compact captions and external collection pills. Profile hover is read-only; editing and connections live in Settings.
- Home always keeps search and distinct animated Collections/Canvas launchers, with reconstructed outline icons and the complete bottom dock. Empty libraries remain empty; filtering controls are text-first and only appear inside all notes or a collection. Internal pages have back navigation.
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


## Completion specification kickoff — October 4, 2026

- Added the supplied feature and security/privacy specifications to docs as requirement references, with scope and pending release gates in `docs/completion-roadmap.md`. They are product documents, not agent instructions or authorization to publish.
- Preserved the pre-existing uncommitted reskin and extension work. This increment changes local collection removal and Undo only; it does not claim backend authorization or multi-user readiness.
- Added `setCardCollectionMembership`, a transactional update against current IndexedDB records. Removing a relationship leaves the card and other memberships intact. Undo adds only that relationship and preserves later collection edits. Missing cards/collections fail rather than being recreated.
- Removal and Undo update optimistically; persistence failures restore the affected relationship, show a compact error and retain failed Undo for retry. Undo expires after seven seconds when idle, with timer cleanup and protection against overlapping badge/Undo requests.
- Added four storage regression tests, an app integration test with failed Undo/retry and a focused Chromium acceptance test. Updated an existing appearance assertion to its actual accessible name and existing UI smoke expectations for hover animation completion and the current 7 px reskin corners.

Verification:
- `npm test`: 91/91 passed across 16 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed for extension, web and shared package; existing large-chunk advisory remains.
- `npm run dev`: app running at http://localhost:5177 (5176 was occupied).
- `DUCKLER_PREVIEW_URL=http://localhost:5177 node scripts/membership-smoke.mjs`: passed in real headless Chromium, including preserving a collection rename after removal, seven-second expiry, other memberships and reload persistence. Repeat with `npm run test:membership:ui` and the preview URL environment variable.
- `npm run test:ui` against that server: removal/Undo/reload checks passed, but the broader suite stops on the existing profile preview blur assertion. Current reskin computes `blur(13px) saturate(1.15)` on the popup; the test expects `none`. Styling was preserved and this unrelated layout gate remains open.
- Initial sandboxed test execution could not access the Windows ancestor directory used by the build helper; the authorized local verification succeeded with elevated tool execution.

Next: accessible badge popovers and a shared searchable picker with inline creation. Backend identity/isolation, secure private media, sharing and Brazil-specific operational/legal review remain pending as recorded in the roadmap.


## Security foundation increment — October 4, 2026

- Implemented the first private API backend in a reusable TypeScript npm workspace (`packages/backend`) and a Cloudflare Pages route (`functions/api/[[path]].ts`). Kept the existing personal UI/Drive model intact; no automatic migration, external provisioning or deployment.
- Added a real SQLite/D1-compatible migration for private users, hashed server sessions, owner-scoped cards/collections and indexed many-to-many membership. Composite owner foreign keys reject cross-user memberships even through direct database writes; API reads/searches/updates/deletes always filter by session owner. D1 has no PostgreSQL RLS; direct privileged database reads remain an operational trust boundary.
- Added 256-bit opaque Secure/HttpOnly/SameSite=Strict host cookies, hash-only session storage, idle/absolute expiry, disabled-account denial, logout and revoke-all-session invalidation. Session issuance is an internal helper only; there is no username login, public session issuance, authentication bypass or open registration.
- Added exact-origin mutation checks, cross-site rejection, streaming JSON limits, strict fields, safe URL schemes, generic errors, private/no-store responses, API-only CSP and production HSTS. Excluded API navigation from offline shell fallback. Added ignored server env/secret files and a disabled configuration example.
- The API fails closed without all required settings and a database binding. It remains disabled by default until invite-based trusted authentication is implemented. Uploads/sharing and other private object routes are unavailable.
- Added commit-pinned, read-only GitHub Actions checks for tests, type checks, lint, builds and runtime dependency scanning. Remote CI/branch protections have not yet been exercised.
- Documented scope, configuration, runtime requirements and open security/privacy gates in `docs/security-foundation.md`; updated the completion roadmap and README.

Verification:
- `npm run test:security`: 14/14 passed against a real in-memory SQLite database with a D1 transport adapter; includes cross-user denial, membership constraints, session expiry/revocation, CSRF/origins, unsafe configuration, invalid input, cache headers and error redaction.
- `npm test`: 105/105 passed in 17 files, including existing local feature tests.
- `npm run typecheck`: passed, including the Pages TypeScript entry point.
- `npm run lint`: passed.
- `npm run build`: passed for extension, app, shared and backend workspaces; existing Vite chunk-size advisory remains.
- Bundled `functions/api/[[path]].ts` with the existing esbuild runtime successfully for the browser/Worker target (local output in ignored `.tmp`). This is compile verification, not a deployed Cloudflare/D1 acceptance test.
- Existing local app responded HTTP 200 at http://localhost:5177. Its UI still uses the personal local library.
- `git diff --check`: passed.

Remaining: trusted invite-only passkey/magic-link onboarding, rate limits/audit/reauthentication, frontend/extension identity and account-switch cache isolation, private uploads, sharing, remaining objects, account rights, full app CSP and operational/Brazil/minors release gates. Do not describe this increment as complete authentication, a secure multi-user release or legal compliance.

## Core and expanded local Canvas — October 4, 2026

- Added separate document, placement, annotation and connector stores with lazy migration of existing positions. Repeated placements reference the same card without copying content.
- Implemented library click/drag insertion, individual/group movement, resize with optional image proportion lock, rotation, pan/zoom/fit, drawing, highlighting, shapes, editable text, connectors and labels.
- Card-attached marks follow transforms, support detach/review, and recover together with removed placements. Card edits propagate through references; missing/trashed cards show placeholders.
- Atomic command saves, 50-edit session Undo/Redo, cross-tab revision guards, rollback, strict object validation and limits protect saved content.
- The capacity test identified repeated node measurement/context redraws. Batched measurements and stable node context resolved it: the complete 200-card/500-annotation/200-connector fixture opened in 1,410 ms in local headless Chromium, with culling, pan and fit verified.
- `npm test`: 114/114 passed across 17 files. TypeScript, lint and all workspace builds passed. The existing Vite large-chunk advisory remains.
- The running local app at http://localhost:5177 passed the Canvas gallery and expanded-tool Chromium checks, including group Undo, zoomed library drop, reload persistence, stale Undo from a real second tab and mobile viewport overflow checks.
- Scope and usage are documented in `docs/canvas-tools.md`. Canvas sync/export, server-side ownership, real mobile/stylus acceptance and the generated Home logo assets remain pending; the security foundation stays disabled by default.

## Approved Home artwork — October 4, 2026

- Integrated the supplied transparent CD stack as `apps/web/public/icons/home-collections.png` and the chrome punk album with red ink eye mark as `apps/web/public/icons/home-canvas.png`. The original image bytes are preserved.
- Home's expanded navigation icons use these assets with proportional sizing and no added glow. Compact navigation retains its existing icons, following the user's Home-only instruction.
- Read `duckler_ui_notes_audio_patch_spec.md` as a product document. Its other notes/editor/theme/picker/audio proposals remain future work; authentic PS2 sound files have not been supplied.
- Updated the existing Home assertions; all 21 app tests passed. Chromium verified loaded images, transparent corners, proportional sizing, Home-only placement and no horizontal overflow at 1440, 390 and 320 px. Reviewed the phone screenshot locally.
- Raised the offline per-file cache limit to 3 MiB for the supplied 2.46 MiB album PNG so the approved artwork can be bundled offline.

## Notes/editor and artwork motion increment — October 4, 2026

- Screenshot notes use the existing independent note field and save/export/sync paths. Grid notes now render outside image frames as plain-text bubbles, clamp to four lines and expand in normal layout flow. Whitespace-only notes render no bubble; titles and image bytes are preserved.
- The editor is 660 px wide at most, with Details/Source/Note/Collections sections retaining one complete draft. Trash/Restore and permanent deletion keep their original handlers in the top bar. Cancel/Save remain fixed; visual viewport changes resize the form, previews disappear at small heights, and only long text/collection lists scroll internally.
- Corrected modal stacking so the floating Add button cannot intercept Save. Existing focus trapping, Escape, background locking and return focus remain supplied by Dialog.
- Added semantic scrollbar styling and connected light mode to shared appearance tokens. The background gradient now follows the selected skin. Full reskin/portal/account-isolation audits remain pending; this is a local appearance correction.
- Approved Home PNGs now lift and tilt on hover or keyboard focus using the prior 320 ms motion timing. Reduced motion suppresses the artwork transforms.
- Two local Vite previews were competing over dependency optimization. Restarted a single root-runtime preview with forced optimization at http://localhost:5176. The browser check saw no server errors.
- `npm test`: 114 tests passed after the notes/editor changes. TypeScript and lint passed. `npm run test:notes:ui` passed for note expansion/plain text, title/draft/reload preservation, blank-note removal, editor shell/form fit at 1366×768, 1024×600, 390×844, 390×350 and 683×384, light tokens and hover/reduced-motion behavior. The latter small-height fixtures do not replace real mobile-keyboard or browser 200% zoom acceptance.
- Reviewed light-mode and phone editor screenshots in ignored `.tmp/ui-checks`. The product attachment is preserved as `docs/duckler_ui_notes_audio_patch_spec.md`; it is not an agent instruction source.
- Still pending: shared searchable membership picker beneath cards, avatar quick appearance controls/settings entry refinements, remaining appearance coverage, audio service/settings/hooks and authentic supplied PS2 samples. No sound assets have been provided.

## Merged specs, backups, collection picker, account menu, CSP and capture cue — October 4, 2026

- Merged the seven product specs into `docs/duckler-master-spec.md` with a precedence table and per-item status. Source specs are in `docs/specs/`. A root `PROGRESS.md` gives a short checklist. The owner chose Drive-first (`docs/decisions/0001-drive-first-privacy-architecture.md`).
- Finding: Drive *content* sync was never implemented (only sign-in and root-folder discovery). Canvases were therefore protected by adding them to the native backup instead: export format v2 now includes every canvas (document, placements, annotations, connectors, viewport). The new **Restore backup** validates with Zod plus `validateCanvasContent`, strips non-http(s) source links, rejects non-raster image data, and restores additively (existing IDs are kept unchanged and reported).
- Collection badges under cards now open one anchored multi-select picker: search with exact/prefix ranking, checkboxes, a separate Open action, inline create (auto-selected), empty/no-match states, arrow keys, Escape with focus return, and a portal into the app shell so themes apply. Cards without collections show "Add to collection". Duplicate names show item counts. Membership changes are serialized per relationship, so rapid toggles apply in order. Open now creates browser history entries, and Back/Forward move between collections.
- Added a Settings gear beside the avatar. The avatar opens an Account menu with Light/Dark/System, a skin selector and account actions, sharing state with Settings. Removed the redundant sidebar light/dark toggle. Mapped the remaining legacy tokens and hard-coded canvas, thumbnail and image-card colours to `--ui-*`.
- Security: added a production Content-Security-Policy (GIS script/frame/connect only, `frame-ancestors 'none'`, `object-src 'none'`). Moved the share-target inline script to `share-target/share-target.js`. Replaced the extension popup's `innerHTML` collection rendering, which interpolated user collection names, with DOM text nodes. Confirmed Drive tokens are memory-only and no saved content uses `dangerouslySetInnerHTML`.
- Screenshot capture cue: newly arriving image cards (extension, share, upload or composer; batches of 5 or fewer) play a capture sound layered from the two existing pack samples, plus a shutter flash, corner-tick draw-in and image settle. Reduced motion keeps only a brief fade. The sample provenance caveat in the master spec still applies.
- Verification from Claude's Linux shell: `npm run typecheck` passed; ESLint passed on every changed TS/TSX file; `node --check` passed for changed JS. Backup parser tests (5) passed under a temporary runner. `npm test`, `npm run build` and the Playwright smokes could **not** run there: npm registry access is blocked and `node_modules` contains only Windows native binaries. Run them on Windows before committing. Updated `App.test.tsx` and `scripts/membership-smoke.mjs` for the picker and account menu.
- CSP note: verify Google sign-in in the deployed build. If GIS needs another endpoint, add only that origin.

## PS2 schematic redesign, canvas studio, hover menus — October 4, 2026

- Visual direction set from the owner's references: the PSX2 line-art schematic, the controller blueprint sheet, the PS2 system menu and the aqua PS2 print ad. New `apps/web/src/schematic.css` (loaded last) gives flat line-art panels, square corners, an offset print shadow, a fixed dashed sheet frame, Arial caps callout labels, a yellow PS2-menu active state, a decorative face-button hint bar (✕ ○ △ □), and static grain plus scanlines. No blur, loops or hover transforms; all motion is 90–110 ms opacity or colour. The owner rejected an intermediate synthwave/glass pass as too modern and slow, and it was removed.
- Skins: "PSX2 Schematic" (default; black with cyan lines and yellow), a new "Blueprint" (royal blue with white lines), and the existing skins. Light mode is now the PS2 aqua print ad (pale silver-blue, deep blue ink). Named presets always load their current colours, so saved preset choices pick up updates; custom colours are unchanged.
- Canvas: rebuilt as a full-height studio. All controls float inside the board as icon toolbars (new `CanvasIcon`): a vertical tool dock, a top action bar (Back, Find on board, Undo/Redo/Fit, rotate/remove/select), a style bar that appears only while drawing (ink swatches, custom colour, stroke, opacity, toggles), a board-background picker (match theme, 7 presets, custom colour; saved on the canvas document and included in backups), a hidden-objects popover and an "Add cards from library" drawer with thumbnails. Accessible names match the previous buttons so the canvas smoke scripts still apply. "Find on board" dims non-matching cards. Styles are in `canvas-studio.css`.
- Search adapts to the page: "Search refs" on Home; elsewhere a compact field labelled for the page ("Search Synthwave", "Search collections", "Search canvases") that widens when used, with Clear and Escape. The Collections page now filters by name. The global bar is hidden inside a canvas, which has its own find.
- Hover: a shared `useHoverIntent`/`detailsHover` (90 ms open, 450 ms close, ignored on touch) now drives the account menu, add menu, collection menu, view options, storage menu, card Move menu and the card collection picker. Whatever a click shows also opens on hover and stays reachable. The old hover-only profile tooltip was folded into the Account menu.
- Profile photo: the picture itself (in Settings and the Account menu) is the upload control, with a camera overlay on hover; the separate "Add photo" button was removed.
- Performance: removed the per-scroll measurement that nudged every card away from the docked search.
- Verified visually in the running dev server (dark, Blueprint, light; library, collection picker hover, canvas studio). `npx tsc -b` passed after each step. Vitest/Playwright still need to run on Windows.

## Feedback round: action-focused motion, new icons, editor, card style, sound control — October 4, 2026

- Motion is back, but only on actions and icons: icons lift on hover and press in on click; the gear turns; the + button tilts (−9°) again on hover; editor action glyphs pop. A small light now rises from beneath the selected dock icon (and the active canvas tool). Popovers rise 4px in 130 ms. There are still no page-level or looping ambient animations (the speaker's level bars move only while hovered).
- New schematic icon set for every icon except the two Home artworks: disc stack (Collections), ring-bound sketchbook (Canvas), D-pad (Move), memory card (Note), disc-tray eject (Upload), cable plug (Link), lens with crosshair (Search), square-tooth gear, speaker/mute, restore, close. Square caps and mitred joins throughout, including the canvas icons.
- Scrollbars are hidden app-wide (scrolling still works). Hover menus now close after 170 ms (was 450) and open after 70 ms; invisible bridges keep menus reachable. Clicking the avatar now always opens the menu rather than toggling it closed after a hover-open.
- Removed location subtitles ("REF. SHEET /", the fixed "DUCKLER // PERSONAL VISUAL SYSTEM" label).
- Card editor redesigned as one sheet with no tabs: image preview with registration marks on the left; Title, Note, Source, Tags, collection chips and **card colour** on the right; icon-only Trash/Delete/Close in the top bar; footer "○ Cancel" and "✕ Save". Per-card colour is a new optional `color` field on cards (validated `#rrggbb`, kept in backups) and tints that card's frame and caption.
- New Settings → Cards section: card background (match skin, presets, custom), frame (line/dashed/double/none), corners (square/soft/round), show titles, glow on hover. Stored per browser under `duckler-card-style-v1`.
- Sound: a visible speaker button in the dock (click to mute or unmute; hover shows a volume slider, previewed on release). Cue variety comes from pitching and layering the two pack samples: hover, select, open, back/cancel/Escape, toggle on/off, save, delete and capture each sound different. Settings has preview buttons for each cue.
- Note for the dev server: Vite sometimes misses edits made from Claude's shell (seen with an appended CSS file). If something looks stale, restart `npm run dev`.

## OCR + PDF work in progress (October 5, 2026, morning — superseded by the next entry)

The owner installed `tesseract.js@7` and `pdfjs-dist@6` (root `package.json`). This work is **written and typechecks, but has not been run in a browser yet**. The PDF browser test was interrupted before it ran.

Done (uncommitted until this entry, now committed as work in progress):
- Card schema: new `pdf` card type; optional `ocr` (text, source fingerprint, languages, engine, edited flag), `pdf` (file name, page count, PDF data URL, embedded text) and `source` (PDF card + page provenance). Helpers `mediaFingerprint`, `ocrIsCurrent`; `buildSearchText` now includes current OCR text and PDF text. The editor's save uses `buildSearchText`.
- `apps/web/src/lib/ocr.ts`: lazy tesseract.js (EN+PT by default), worker/core bundled via Vite `?url` (SIMD core when supported), downscales to 2400 px, cancel via AbortSignal, one job at a time, 200k-char cap. Language data comes from the tesseract.js-data CDN unless `VITE_OCR_LANG_PATH` is set.
- `apps/web/src/components/OcrPanel.tsx` in the card editor (image cards): EN/PT toggles, Extract / Cancel / Retry / Re-extract / Copy, progress bar, editable text marked "edited", stale warning when the image changed (stale text is excluded from search).
- `apps/web/src/lib/pdf.ts`: lazy pdf.js with bundled worker; 25 MB / 200-page limits, `%PDF` signature check, password/corrupt messages, first-page thumbnail, embedded text extraction.
- Upload now accepts PDFs (`handleAddPdf`): creates a PDF card (thumbnail as image, PDF bytes + text kept), added to the open collection.
- `PdfViewer` in the editor for PDF cards: page navigation and **Capture page**, which creates an image card with `source` provenance (added to the same collections). Captured cards link back to their PDF in the editor.
- Cards show a "PDF · n p" badge and a "Page n" badge for captured pages. PDF thumbnails render in the grid, canvas and collection previews.
- Obsidian export: OCR section (current text only), PDF attachment link, page provenance.
- CSP: `'wasm-unsafe-eval'` added to script-src; `https://cdn.jsdelivr.net` added to connect-src (OCR language data).

Next steps:
1. Restart `npm run dev`, then test: upload a PDF (text-based and scanned), page through it, capture a page; run Extract text on an image card (needs internet the first time for language data); search for an OCR'd word; edit the text and check the stale warning after replacing an image.
2. Check `npm run build`: the tesseract core `.wasm.js` assets are large. Consider runtime caching for them in `vite.config.ts` (Workbox) and confirm the CSP allows the workers in production.
3. Add tests: schema round-trip for `ocr`/`pdf`/`source` in backups, `ocrIsCurrent`, the PDF signature check.
4. Optionally self-host `eng`/`por` traineddata under `public/ocr/lang` and set `VITE_OCR_LANG_PATH`.
5. Move `tesseract.js` / `pdfjs-dist` from the root `package.json` into `apps/web/package.json` (run `npm install` on Windows after the move).

## OCR + PDF verified; all checks green — October 5, 2026

Picked up on a second Windows PC (fresh clone, `npm install`, Node 24). Every step of the handoff list is done except the optional self-hosted language data.

Command results:
- `npm run typecheck`: pass. `npm run lint`: pass (allowed `_`-prefixed unused variables, the rest-omit convention already in use; escaped one apostrophe).
- `npm test`: 20 files, 132 tests pass. Three App tests were stale (the editor's Collections toggle is gone; Back navigation goes through `history.back()`, so tests now await `popstate`). New `packages/shared/src/ocrPdf.test.ts` covers `mediaFingerprint`/`ocrIsCurrent`, stale OCR excluded from search, `hasPdfSignature`, backup round-trip and rejection for `ocr`/`pdf`/`source`, and the Obsidian OCR section, PDF attachment and provenance. A `cardDb` test covers the rebuilt search index.
- `npm run build`: failed at first because the two ~3.9 MB tesseract cores exceeded the Workbox precache limit. They are now excluded from the precache (`globIgnores`) and cached CacheFirst on first use in `duckler-engines` (which also holds the pdf.js worker, never precached because the glob has no `.mjs`); the jsdelivr language data goes in `duckler-ocr-languages`.
- Playwright smoke scripts (after `npx playwright install chromium`): `ui-smoke`, `canvas-smoke`, `canvas-tools-smoke`, `notes-editor-smoke`, `membership-smoke`, `canvas-capacity-smoke` (200 placements / 500 annotations / 200 connectors open in ~800 ms) and `extension-smoke` all pass against `npm run dev`. The scripts were updated for the redesign.
- `npm run pages:preview` couldn't start on this machine: workerd failed with `SQLITE_CANTOPEN` on its local state. The built `dist` was served instead by a small Node server that applies `dist/_headers` exactly, and checked in the browser: the CSP header is present, the service worker controls the page, PDF import/view/paging and OCR all work with no CSP violations and no console errors, and after first use the runtime caches hold the PDF worker, the SIMD core and `eng`/`por` traineddata.

Browser testing (dev server):
- PDF: a text PDF (3 pages) and a scanned PDF (2 pages) import; viewer paging and bounds work; Capture page creates "<title> — p. 2" with `source` provenance and a "Page 2" badge; PDF text is searchable. Errors: corrupt → "could not be read", not a PDF → "not a PDF", password → "password-protected", 26 MB → "up to 25 MB", 201 pages → "up to 200 pages".
- OCR: English and Portuguese (with accents) extracted exactly in about 1–2 s; Cancel mid-run returns to Extract; Retry works; edits are marked "Edited by you"; OCR is saved with the card on Save; OCR'd and edited words are searchable; the stale warning appears when the image changes.

Bugs found and fixed:
- `PdfViewer`: Capture page could save the previous page's image under the new page number while the next page rendered; and the viewer gave up after polling 2 s for the document, so a slow-opening PDF stayed on "Loading page…". The document now lives in state and the rendered image is tied to its page.
- Search: `searchText` is stored, so OCR that no longer matched its image (or a restored card with a stale or empty index) kept matching. `readCards` now rebuilds `searchText` on read.
- OCR Copy failed silently when the clipboard was refused; it now says so.
- `useHoverIntent` spread a `cancel` function onto DOM elements (React warning).
- Popovers: `sx-rise`/`sx-leave` animated `transform`, overriding the `translateX(-50%)` centring, so the account menu and collection menu sat half their width to the right (off-screen at 320 px). The keyframes now use the individual `translate`/`scale` properties.
- The library options menu went off the left edge at 768 px (right-anchored to a left-aligned title); the account menu rose past the top on a 667×375 landscape phone (it now scrolls on short screens); the Settings → Cards Frame segment overflowed at 320 px.
- Reduced motion didn't stop the Home artwork, + button, theme toggle or Back ring hover motion (specificity lost to `!important` hover rules).
- Dev only: React StrictMode re-attaching refs made the exit animation leave a ghost copy every time a dialog opened.
- Backups now require the PDF data URL body to be base64, like images.

Also: `tesseract.js`, `tesseract.js-core` (imported directly for the `?url` core assets) and `pdfjs-dist` moved from the root `package.json` into `apps/web/package.json`.

Still open: optional self-hosted traineddata (`VITE_OCR_LANG_PATH`); OCR directly on scanned PDF pages; whether status notices should auto-dismiss (they stay until replaced and, on some layouts, can sit over the Back button); checking Google sign-in on the deployed build with the CSP.

## UI rounds, extension side panel, connections and clip autofill — October 5, 2026 (afternoon/evening)

Everything below is on `main` and was deployed by the git-connected Pages project. Each round passed typecheck, lint, the unit suite and the Playwright smokes on Windows.

Web app:
- Notifications ("achievement" panels) replaced the status banner; zoned UI sounds (menus, cards, settings, canvas) with canvas tool cues, select/deselect and gear cues; Settings → each sound and each group is an on/off switch.
- Cards: click toggles selection (command strip shows), double-click/Enter edits, 2° italic lean; B ("○ BACK") close buttons; soft corners; earlier + button motion; boxless dock and top controls with soft scrims; phone canvas puts Home/Collections/Canvases/Settings in the board's top bar (Back and Settings in opposite corners at every width).
- "All cards" collection tile; empty canvases ("New canvas"); right-click rename for collections and canvases (Codex finished 6722a0b); search started on Home returns there when emptied.
- PDF page text panel with OCR for scanned pages; "Note from selection" → note linked to the PDF page, shown as message boxes over the page.
- Card connections: connect icon (click then pick, or drag onto a card), "Connect these two" for two selected cards, ⇄ badge, editor "Dialogue" (open/disconnect), connected notes over images. Right-click selected note text → "New note from selection" (connected to its source).
- Custom PS2 colour picker for UI colours (Settings, card style, card editor, profile card); fixed hidden-behind-editor and account-menu closing bugs.
- Fixes found by the smokes: popovers mis-centred by animations, overflows at 320/768 px, reduced motion, StrictMode exit ghosts, stale searchText, PDF viewer capture race.

Extension (Codex built the side panel 47f93bd; follow-ups here):
- Highlights: optional `<all_urls>` access with an in-panel "Allow on all websites" prompt (activeTab only covered the tab the panel opened on); frames; SPA URL changes; append to an edited note.
- Autofill from page metadata (cleaned title · site, description, tags, last-used collections — see D6), card colour swatches (validated `#rrggbb` in the capture protocol).
- Screenshots: reviewed in the side panel only (no on-page pop-up); Alt+Shift+D opens the panel first; without a panel the shot is saved directly; Shot asks for site access in the same click; scripts orphaned by an extension reload reinstall themselves.

Clip autofill (docs/ai-coop):
- 1.1 optional `pageExcerpt` (never persisted, I3b); 1.2 pure profile/rank/decide rules; 1.3 `/api/embed` + `/api/embed/token` (stateless HMAC install tokens, KV daily counters keyed by hashes, size caps, 5 s timeout, same-origin, no-store, no logging; 503 until configured); 1.4 `wrangler.jsonc` bindings `AI` + `EMBED_USAGE` (KV 704af653…), secret `CLASSIFY_TOKEN_SECRET` set by the owner.
- Zero retention verified by tests; Workers AI keeps no inputs/outputs unless storage is attached.

Notes for the next agent: Wrangler's OAuth login on this PC expired during 1.4 (re-run `npx wrangler login` for CLI work; pushes still deploy). Untracked `ai-coop/` (owner's PT checklist) and `.claude/` are intentionally not committed.

## Simplify the extension, profile photo cropper, AI frozen — October 5, 2026 (night)

The owner froze all AI integration (clip autofill) and asked for a better, simpler app with less over-engineering.

Extension, modelled on Obsidian Web Clipper and simov/screenshot-capture:
- Permissions: `<all_urls>` is now a required host permission (Obsidian does the same). The optional grant, the "Allow on all websites" banner and every `hasSiteAccess` branch are gone. The panel follows the active tab, and `activeTab` alone never covered that.
- Screenshots belong to the panel: it injects `content.js`, sends `start-region-capture` and waits. The picker answers when the drag ends, with the crop (from the worker's `crop-region`) or a cancel or error. That removed the worker's panel receipts, delivery timeouts, the `panelFor` polling, start-region window checks, the buffered screenshots and the `prepare-region-review` path (it was part of Codex's uncommitted draft, which never cleared its `initializing` flag, so screenshots were buffered forever).
- Alt+Shift+D: an open panel gets `start-shot` on its port. Otherwise the worker opens the panel and leaves `duckler-start-shot` in `storage.session`, which the panel picks up on load.
- Picker: it follows the viewport until pointerdown; a resize mid-drag no longer cancels, and the final `unchanged()` check refuses a crop whose viewport really changed.
- Tests: new `background.test.ts` / `content.test.ts` / `popup.test.ts` cases. `scripts/extension-native-smoke.mjs` drives the real side panel (4/4 runs pass) and uses `viewport: null`, because an emulated viewport never matches `captureVisibleTab`. The duplicate real-drag step in `extension-smoke.mjs` was removed.

Web app:
- Profile photo: any JPEG/PNG/WebP/GIF/AVIF up to 30 MB opens a cropper (drag, wheel/slider zoom, arrow keys). It saves a 256 px JPEG of a few dozen KB; a 4.9 MB test image became 11 KB. This replaces the 1 MB rejection.
- Clicking the name on either profile card renames in place (Enter or blur keeps it, Escape restores the old name).
- Dialog: only the topmost dialog handles Escape and Tab, so Escape in the cropper no longer closes Settings underneath.
- `wrangler.jsonc`: removed the JSON comments, which broke `scripts/deployment-config.test.ts` from caf31f0 until now.

Speed (measured on the production build with 300 cards, 100 of them images):
- Selecting a card took ~340 ms; now ~25-35 ms. A search keystroke took ~33 ms; now ~5-15 ms.
- Cards are a memoized `LibraryCard` and read handlers through a stable getter, so a click re-renders one card, not all of them.
- Selection no longer re-lays-out the grid: every card has a baseline `skewX(0deg)` (going from `none` to a transform changed the containing block, ~60 ms), and the corner marks always exist (they used to be inserted).
- Per-card `:has()` selectors became classes (`.library-card.is-checked`, `.card-external-actions.is-open`, `.library-grid.is-connecting`); filter animations on image cards were removed.
- The grid shows 720 px thumbnails (`lib/thumbnails.ts`, made off the main thread, held for the session); the editor shows the original.
- Arrivals start visible (opacity .6-.7, not 0), and exits take 90 ms instead of 140 ms.
- Esc is Back when nothing smaller wants it (dialogs, menus, pickers, fields, selection and canvas tools come first).
- Thumbnails are saved on the card (`thumb: { url, of }`; `of` fingerprints the source image, an empty url means the image is already small). They are made once and stored without touching `updatedAt`, and are left out of backups. After a reload, 100 images show on the first frame (it used to take ~15 s to remake them each session).
- Open: opening a 300-card view is still ~350 ms of layout (batching would need a different grid; deferred).
- Drive: cards are not uploaded to Drive yet (connect only creates the root folder), so deleting a card has nothing to remove there. Content sync (M5b) must propagate deletions when it is built.

## Google accounts, Drive sync and encrypted share links — October 6, 2026

The owner asked for Drive integration, account creation and sharing collections by link, and chose Google sign-in plus view-only links (decision 0002). Open-source references were checked first: Vync (Drive sync with LWW and tombstones, MIT) and Excalidraw's encrypted share links (MIT).
- `packages/shared/src/driveSync.ts`: the Drive library format and a pure merge. Records go to the newest `updatedAt`; deletions win over older versions, with tombstones kept 180 days. Images are uploaded and downloaded separately, and a missing local image never deletes Drive's copy.
- `packages/shared/src/share.ts`: view-only snapshot (strict schema; raster data URLs and http(s) links only) plus AES-GCM encryption with the key in the #fragment.
- `apps/web/src/lib/driveSync.ts`: Drive REST client, `Duckler/` root found by appProperties, `syncLibrary` (redone when `library.json` changed meanwhile; uploaded images reused on retry), `editLibraryFile`.
- `apps/web/src/lib/shareLinks.ts`: share, stop sharing (deletes the file), refresh after sync, open with a browser API key. `lib/googleDrive.ts`: token-only GIS sign-in, kept in memory.
- `lib/useDriveSync.ts`: account, status and share state. Sync runs after sign-in, 3 s after local changes (Dexie hooks, silent for sync's own writes and for thumbnails), on focus and every 5 min.
- `cardDb`: `tombstones` table (v6), recorded by `removeCard`/`deleteCollection`; `applySyncedLibrary`.
- UI: Settings → Account & sync; account menu entry; collection right-click → Share link… (`ShareDialog`); `/s/<id>#<key>` → `SharedCollectionPage` (viewer's theme, "Save a copy to my library").
- Removed the placeholder Drive state (`syncState`, fake card ids, root-folder debug panel).
- Tests: merge rules, snapshot safety, encryption, and an in-memory fake Drive (two devices, image transfer, deletion propagation, newer-wins, concurrent `library.json` write, share/open/stop).
- Needs the owner: Google Cloud project, OAuth client and API key in Cloudflare (`docs/google-setup.md`). Real-account testing can't be done by an agent.

## Profile card image, distinct sounds, real-looking shared pages, security pass — October 6, 2026 (later)
- Profile card image: the cropper handles wide images (`CARD_IMAGE_SHAPE`, 900×360 JPEG, ~26 KB from 3.6 MB). Shown translucent behind the card (`.has-cover::after`); a picture button sits on both profile cards.
- Sounds: each cue now has its own synthesized tone layer (waveform + pitch movement) on top of the shared PS2 samples, plus a new `share` cue. A test asserts no two cues are identical.
- Refresh keeps the current page (the initial view comes from `history.state`).
- Collection description: click to edit under the name (Ctrl+Enter / blur saves, Esc cancels); included in share links.
- Collection header: the owner row (picture + name; the profile card appears on hover, `ProfileHover`) sits above the name row; Share is icon-only.
- Shared page rebuilt from the collection page's own parts: search, Back, header, media filters, sort, `LibraryCard` (new `readOnly` mode), sounds, a read-only card view, and the sharer row with their hover card (snapshot carries the owner's name, photo, tag, bio, colour and card image, all validated).
- Security pass: see `docs/security-review-2026-10-06.md`. Shared-in items need confirmation; the dead `?ducklerCapture=` import was removed; AI routes return 404; dev server is localhost-only; HSTS added.
- Note: the uncommitted `wrangler.jsonc` edit (`VITE_GOOGLE_*` under `vars`) must not be committed. Those values belong in the Pages build variables.


## Drive sync: wasted work, leaks and hardening — October 6, 2026 (night)
- Quiet syncs are free: each run remembers library.json's Drive `version`. When neither this device (Dexie change event) nor Drive changed, a run is one listing request. It used to read every card, images included, out of IndexedDB and download library.json every 5 minutes and on every focus.
- Hidden tabs no longer poll; returning to the tab syncs.
- Share links: re-publishing now saves `sharedAt` on the Drive file (multipart PATCH). Before, an edited shared collection was re-encrypted and re-uploaded on every sync forever. `refreshShares` returns the updated records.
- The per-run extra `readLibraryFile` is gone (`syncLibrary` returns the stored library and its version). Cards are read only when Drive brought changes or links exist.
- Orphan sweep (once per sign-in): image files no card points to, older than 1 h (so another device's in-flight upload is safe), are deleted. These were left behind by interrupted syncs.
- Sign-out or account switch during a run: the old run stops writing state and the loop picks up the new session.
- Security: Drive file ids and page tokens are URL-encoded; share-link downloads are capped at `MAX_SHARE_BYTES` while streaming (a link can point at any public file); the stored Google account is validated on read and no longer keeps the photo URL (it was never shown).
- Leaks: the Google script loader is a single cached promise (a failed load used to leave a dead tag that later calls waited on forever, adding listeners each time); the thumbnail session cache drops entries once the card carries its thumbnail.
- Checked and fine: listeners/observers/timers in App, pickers, sounds (AudioContext closed on unmount), OCR worker termination, extension bridge.
- Tests: skip/no-skip, orphan sweep, id encoding, share re-publish once, oversized share link. Note: `apps/extension/src/popup.test.ts` has 4 timing-flaky cases under the full parallel suite (they pass alone).

## Usage fixes: right-click, Enter to save, drag and drop — October 6, 2026 (night, later)
- Right-click "Quick add" items did nothing with a real mouse: the global pointerdown handler closed the menu on any press, including inside it, so the item was gone before its click. Presses inside the menu no longer close it.
- Enter saves a note from the composer body (Shift+Enter is a new line); a note without a title is named after its first words (`titleFromText`), a link after its site. Saving no longer reopens the new card in the editor; made outside the library, it lands in its collection (a history entry).
- Empty library/collection: a paired browser is offered "New note" instead of "Connect your browser".
- Drag and drop (pattern from react-dropzone / Obsidian): dropping a link, text, image or PDF anywhere opens the composer prefilled, with the collection tile it was dropped on (or the open collection) selected. Dropping onto an open composer adds to that card: text and extra links into the note, the first link as source, an image as its picture. Only http(s) links; Duckler's own drags are left alone; text dropped into a field goes to the caret. `lib/drop.ts` + tests.
- Notices: progress notices are capped at 60 s; on phones the stack sits above the dock, clear of Back and Settings (they auto-dismissed already).
- Collection menu list and "create collection" go through `navigateTo`, so Back returns to the previous collection.
- Fixed the flaky `popup.test.ts`: the panel's `window.close()` 650 ms after a send tore down jsdom's document mid-file on slow runs; the test stubs it.
- Not covered yet: dropping into the card editor (only the new-card composer accepts drops).

## One action list for + and right-click; canvases in Drive sync — October 6, 2026 (night, later still)
- `+` and right-click menus render one `createActions` list. Right-click "Upload" did nothing before (its file input lived inside the + menu, which was closed); there is now one always-mounted input.
- Confirmed: the card editor's collection checkboxes are a draft applied on Save.
- Canvases sync through Drive: each canvas travels whole in `library.json` (the backup's `CanvasBackup` shape and validation, minus the per-device viewport). Newer `document.updatedAt` wins; a canvas goes with its collection's deletion. Applied canvases get a new local revision so a stale tab reloads instead of overwriting. Board colour changes now bump `updatedAt`. Canvas edits trigger sync (hook on the `canvases` table). An open canvas remounts when Drive brought changes.
- Older clients ignore `canvases` and could drop it from library.json; the next new client re-uploads its copy (no data loss, devices update on reload).
- Next: XSS sweep, Obsidian conflict status, sound events, then a speed pass (measure slow paths, e.g. the ~350 ms 300-card open).
- XSS sweep: an App test puts script/HTML payloads in every text field (card title, note, caption, tags, javascript: source; collection name/description; profile name/bio) and checks they render as text on the collection page and in the editor. No HTML sinks exist; the only data-driven link (shared pages) is http(s)-only.
- Obsidian export: the app passes an empty conflict state, because Drive sync resolves conflicts during the merge (newer edit wins); the manifest no longer says "unknown".
- Sound events: the spec's hover/select/open/back/save map was already complete (spec entry was stale).

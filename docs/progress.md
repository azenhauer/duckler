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

# Duckler progress tracker

A plain checklist across every spec. Detailed requirements: `docs/duckler-master-spec.md`. Engineering log with command results: `docs/progress.md`.

Legend: `[x]` done · `[~]` partial · `[ ]` not started · `[!]` blocked (outside decision, device or account needed)

Last updated: 2026-10-05

## Now (this session)
- [x] Merge seven specs into `docs/duckler-master-spec.md`; source specs saved in `docs/specs/`
- [x] Decision: Drive-first privacy architecture (D1 backend stays disabled)
- [x] Canvases included in backup export + new **Restore backup** (additive, validated)
- [x] Collection picker under cards (search, multi-select, Open, inline create, Add to collection, duplicate names, browser Back/Forward)
- [x] Settings gear + avatar Account menu (mode, skin, actions) + theme token sweep
- [x] Security headers (CSP, frame-ancestors), XSS sweep (fixed extension popup), token-storage check
- [x] Screenshot capture sound + shutter/corner-tick animation
- [x] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` and all Playwright smoke scripts pass (Oct 5)
- [ ] **You:** check Google sign-in still works on the deployed build with the new CSP

## Redesign (PS2 schematic) — Oct 4
- [x] Look based on your references: black + cyan schematic (default), Blueprint skin, PS2 aqua light mode
- [x] Flat line-art panels, dashed sheet frame, Arial caps labels, PS2 button-hint bar, static grain + scanlines
- [x] Fast: no blur or looping animation; ~100 ms colour/opacity feedback only
- [x] Canvas controls moved inside the board as icon toolbars; board background colour picker
- [x] Search works on the current page (collection, collections list, canvases; Find on board in a canvas)
- [x] Click-menus also open on hover and stay open long enough to reach
- [x] Click your profile picture to change it
- [x] Motion back on actions + icons; light beneath the selected icon; + button tilt restored
- [x] New schematic icon set (all except the two Home artworks)
- [x] Scrollbars hidden; hover menus close faster (170 ms)
- [x] Location subtitles removed
- [x] Card editor redesigned (one sheet, preview, chips, icon actions, ○ Cancel / ✕ Save)
- [x] Per-card colour + Settings → Cards (background, frame, corners, titles, glow)
- [x] Visible speaker button with hover volume; more sound variety (open, back, toggle, save, delete…)
- [ ] **You:** restart `npm run dev` if anything looks stale, then review at full desktop width

## Clip autofill (protocol: docs/ai-coop/PROTOCOL.md)
Auto-add a clip to the best-matching collection(s) when no collection was chosen. Opt-in, add-only, zero retention on the server.
- 1.1 ok — optional `pageExcerpt` in the capture protocol + autofill result types; never stored on cards. next=1.2 (pure ranking/decision rules)
- 1.2 ok — pure ranking + decision rules (profiles, margin, max 3, strict small collections, undo memory, low-text). next=1.3 (embed Worker)
- [x] Provider confirmed: Workers AI `@cf/baai/bge-m3`
- 1.3 ok — `/api/embed` + `/api/embed/token` (zero retention, per-install tokens, daily caps, size caps, 5 s timeout); answers 503 until configured. next=1.4 (bindings + setup)
- 1.4 — bindings in `wrangler.jsonc`: `AI` (Workers AI) + `EMBED_USAGE` KV (id 704af653…). Setup, for reference:
  - `npx wrangler kv namespace create EMBED_USAGE` (done)
  - secret: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | npx wrangler pages secret put CLASSIFY_TOKEN_SECRET --project-name duckler` (done by the owner; never pasted anywhere)
  - pushes to `main` deploy automatically (Pages is git-connected)

## Small patches (Oct 5, afternoon)
- [x] Notifications: console "achievement" panels (✕ success · ○ error · △ info · □ progress), auto-dismiss, chime per kind; replace the old status banner
- [x] Sounds separated by zone (menus, cards, settings, canvas) + canvas tool sounds (draw, highlight, shape, text, erase, connect, place, move, rotate, undo/redo); grouped previews in Settings
- [x] Motion polish, action-only: press feedback, one-time grid arrival, selection pops (scale/translate only, nothing loops, off with reduced motion)
- [x] "All cards" shown as a collection on the Collections page
- [x] Search typed on Home goes back to Home when emptied
- [x] PDF page text → "Note from selection" (linked to PDF + page), shown as message boxes over the page; scanned pages can be read with OCR; captured page images can do the same
- [x] Screenshot names inferred from the page (heading/caption/alt inside the selection, page title, site) instead of "Screenshot — …"; uploads use image metadata or a meaningful file name
- [ ] "All cards" canvas (canvases still need a real collection)

## OCR + PDF verified (Oct 5)
- [x] Lint, typecheck, 132 unit tests, production build and all 7 Playwright smoke scripts pass
- [x] PDF tested in the browser: text + scanned PDFs, paging, capture page with provenance, PDF text search, errors (corrupt, not a PDF, password, >25 MB, >200 pages)
- [x] OCR tested in the browser: EN and PT, cancel mid-run, retry, edit, copy, OCR text search, stale warning
- [x] Production build under the real CSP: pdf.js and tesseract workers + WASM run with no CSP violations; OCR cores cached on first use (not precached)
- [x] Bugs fixed along the way: PDF capture could save the previous page; large PDFs could hang on "Loading page…"; stale OCR still matched search; popovers off-centre/off-screen (animation overrode centering); Settings overflow at 320px; reduced motion ignored on Home artwork and + button
- [ ] Optional: self-host eng/por language data (`VITE_OCR_LANG_PATH`) instead of jsdelivr
- [x] Status notices auto-dismiss (now notifications)

## Round 4 (Oct 4) — done
- [x] Bulk selection bar: "+ New collection…" creates a collection on the spot with the selected cards
- [x] Click the profile card to change its colour; profile description (256 chars) shown on the card
- [x] Closing animation for dialogs and popovers
- [x] + button tilts the other way; icon light: cyan on hover, yellow when selected; only icons react (no box highlight); same light on the two Home artworks
- [x] Back = controller circle button (black cap, red ring)
- [x] Volume + Settings moved to the top right; reference-style layout (back top-left, tools top-right, small left-aligned title)
- [x] Round avatar, matte titles, tiny worn texture on panels
- [x] Collection pages keep only the smaller title
- [x] Each step committed to git

## V2 feature checklist
Legend: [x] done · [~] partial · [ ] not started · [!] blocked (reason given)

### Accounts, workspaces & sharing
- [!] Multiple users with separate private libraries: needs account-scoped storage (M9) **and** Drive content sync, which doesn't exist yet (only sign-in + root folder)
- [~] Google account login (GIS sign-in exists) · [ ] safe account switching
- [!] Private Drive-backed workspace per user: Drive content sync not built
- [!] Shared workspaces, Viewer/Editor roles, invites, join flow, upgrade/downgrade/revoke: blocked on the M12 real-account Drive test (needs 3 disposable Google accounts)
- [!] Copy cards / collections / canvases into a shared workspace, copy preview: depends on shared workspaces
- [!] Asynchronous collaborative editing (cards, collections, canvases, OCR, annotations) and offline collaborative sync: depends on Drive sync + sharing
- [~] Conflict detection: the shared revision reducer keeps concurrent heads, but there's no UI · [ ] Keep Mine / Keep Other / Duplicate · [ ] delete-vs-edit recovery UI

### OCR
- [x] OCR for screenshots and images · [x] English and Portuguese · [x] progress, cancel, retry, copy, edit, re-extract · [x] search by OCR text · [x] stale-OCR detection
- [ ] OCR on scanned PDF pages directly (today: capture the page, then extract text from the image card)

### Canvas
- [x] Card rotation · [x] Rotation reset
- [x] Connectors · [x] Arrows and lines between cards/elements · [x] Connector labels · [x] Connector direction controls (line / arrow / double) · [x] Connectors follow moved/rotated objects
- [x] Pen · [x] Highlighter · [x] Rectangles · [x] Ellipses · [x] Text annotations · [x] Object eraser/delete
- [x] Annotation selection and movement · [x] Annotation colours · [x] Stroke sizes · [x] Opacity
- [x] Undo and redo · [x] Annotations attached to card placements · [x] Canvas-global annotations
- [x] Board background colour

### Backup & export
- [~] Backup format for V2: cards, collections (with nesting), canvases, drawings, connectors, rotation, per-card colour, OCR text, PDFs and page provenance are included; conflicts and revision history aren't, because those features don't exist yet
- [!] Shared-workspace backups · [!] Restore a shared workspace as a private copy: depend on shared workspaces
- [x] Obsidian export with text annotations · [x] Obsidian export with canvas previews (SVG)

### PDF
- [x] PDF ingestion · [x] PDF cards · [x] first-page thumbnails · [x] built-in viewer · [x] capture pages as image cards · [x] page provenance · [x] search text-based PDFs
- [x] Obsidian export with OCR, PDF attachment and page provenance (unit-tested)

### Nested collections
- [x] Nested collections · [x] Parent and child collections · [x] One additional hierarchy level
- [x] Moving collections between parents · [x] Hierarchy preserved in export and restore

## Collections
- [x] Many-to-many memberships, multiple badges
- [x] Remove one membership with 7 s Undo
- [x] Extension multi-select picker with inline create
- [x] Right-click quick add (Shift+F10 / ContextMenu key)
- [~] Quick add and `+` menu share one action list (needs verification)
- [ ] Editor Collections tab uses the same searchable picker
- [ ] Collection metadata cache / prefetch (measure first)

## Notes & editor
- [x] Screenshot notes as bubbles outside the card, 4-line clamp
- [x] Compact 660 px editor, removal actions in top bar, no shell scroll
- [!] Real mobile-keyboard and 200% zoom check

## Appearance & reskin
- [x] Presets + custom colours (`--ui-*` tokens), Light/Dark/System
- [x] Dark CRT background, themed scrollbars, angled selection frame
- [~] Light mode / reskin coverage: legacy tokens and canvas colours mapped; visual check of every overlay still needed
- [x] Contrast warning + live preview in Appearance (already existed)
- [~] Frosted icon family for non-Home icons
- [!] Appearance saved per account (needs account work)

## Motion
- [x] Easing tokens, menu entry animations, reduced motion
- [ ] Bottom-nav indicator slide, tab underline slide
- [ ] Delete fade/collapse, tag chip in/out, extension "Saved" state

## Sound
- [x] Sound service with On/Off, volume, Preview
- [~] Event map: hover, click, screenshot capture (open/back/save cues still to map)
- [!] Verified PS2 samples: current files are partly SteamOS-derived, licence unconfirmed

## Canvas
- [x] Rotation, connectors, drawing, anchored annotations, Undo/Redo
- [x] Canvas data in backups
- [!] Real Android touch/stylus check

## Platform (V2 milestones)
- [ ] M8 compatibility audit + v2 schemas
- [ ] M9 account/workspace-scoped storage, safe account switching
- [x] M10 on-demand OCR (Tesseract, EN/PT)
- [!] Drive content sync (M5b): only sign-in + root folder exist today
- [!] M12 collaboration feasibility (3 disposable Google accounts)
- [!] M13–M15 sharing, collaboration, friends pilot

## Security & compliance
- [x] D1 API foundation with isolation tests (disabled)
- [x] Content-Security-Policy in `_headers`
- [~] XSS: no unsafe HTML rendering in the app; extension popup fixed; restore strips unsafe links (automated payload test still to add)
- [!] Privacy notice, terms, retention, incident process (needs your controller/contact details)
- [!] LGPD / Marco Civil / minors legal review

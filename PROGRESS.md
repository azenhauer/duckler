# Duckler progress tracker

A plain checklist across every spec. Detailed requirements: `docs/duckler-master-spec.md`. Engineering log with command results: `docs/progress.md`.

Legend: `[x]` done · `[~]` partial · `[ ]` not started · `[!]` blocked (outside decision, device or account needed)

Last updated: 2026-10-04

## Now (this session)
- [x] Merge seven specs into `docs/duckler-master-spec.md`; source specs saved in `docs/specs/`
- [x] Decision: Drive-first privacy architecture (D1 backend stays disabled)
- [x] Canvases included in backup export + new **Restore backup** (additive, validated)
- [x] Collection picker under cards (search, multi-select, Open, inline create, Add to collection, duplicate names, browser Back/Forward)
- [x] Settings gear + avatar Account menu (mode, skin, actions) + theme token sweep
- [x] Security headers (CSP, frame-ancestors), XSS sweep (fixed extension popup), token-storage check
- [x] Screenshot capture sound + shutter/corner-tick animation
- [ ] **You:** run `npm test`, `npm run lint`, `npm run build` on Windows (they can't run from Claude's shell), then commit
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
- [ ] M10 on-demand OCR (Tesseract, EN/PT)
- [!] Drive content sync (M5b): only sign-in + root folder exist today
- [!] M12 collaboration feasibility (3 disposable Google accounts)
- [!] M13–M15 sharing, collaboration, friends pilot

## Security & compliance
- [x] D1 API foundation with isolation tests (disabled)
- [x] Content-Security-Policy in `_headers`
- [~] XSS: no unsafe HTML rendering in the app; extension popup fixed; restore strips unsafe links (automated payload test still to add)
- [!] Privacy notice, terms, retention, incident process (needs your controller/contact details)
- [!] LGPD / Marco Civil / minors legal review

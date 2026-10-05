# Duckler — Merged Master Specification and Implementation Status

Date: 2026-10-04
Status: merges seven product specs into one ordered plan and records what the repository already does. These are product requirements, not agent instructions. Status was checked against the working tree (including uncommitted changes) on 2026-10-04.

## 0. Sources and precedence

| # | Source (in `docs/specs/` unless noted) | Covers |
|---|---|---|
| A | `Visual-Library-Codex-Specification.md` (repo root) | Original local-first v1 foundation |
| B | `duckler-v2-specification.md` | Workspaces, OCR, canvas annotations, Drive collaboration (M8–M17) |
| C | `duckler_security_privacy_brazil_spec.md` (`docs/`) | Backend auth, isolation, LGPD/Marco Civil |
| D | `duckler_new_features_completion_spec.md` (`docs/`) | Collections, extension picker, quick add, CRT background |
| E | `duckler_collection_patch_spec.md` | Same scope as D, more detail (API, caching, prefetch) |
| F | `duckler_ui_notes_audio_patch_spec.md` (`docs/`) | Notes, compact editor, themes, picker, settings, PS2 audio |
| G | `duckler_playstation_reskin_spec.md` | Visual reskin, icons, appearance settings |
| H | `duckler_micro_animations_spec.md` | Motion system |

The two uploaded copies of the security spec are identical. Only one is kept.

**Precedence when sources conflict:** newer and more specific wins: F > E ≈ D > H > G for UI. B governs data and sync architecture. C governs security *principles* (default deny, isolation tests, XSS/CSP, logging, LGPD) whatever architecture is chosen.

### Resolved conflicts

| Topic | Conflict | Resolution |
|---|---|---|
| Badge click | D/E: Open/Remove popover. F: multi-select picker | **F wins.** Picker with checkboxes and a separate "Open collection" row action. Undo still applies (D/E §4). |
| Background texture | G §6 grain/scanlines 2–6%. D/E: no texture. H §22: optional drift | **No texture** on the background (D/E, newest). Grain may be used only on card/panel surfaces at ≤3%, or omitted. |
| Icons | G: frosted icy-blue family. F: chrome CDs and punk album | Chrome artwork on **Home only** (user decision, already shipped). G's frosted family for every other icon. |
| Corner radius | G: firmer corners. F: editor 16–20 px | Cards and panels firmer (4–8 px). The editor dialog keeps F's 16–20 px. |
| Appearance | G: dark-only custom tokens. F: Light/Dark/System + reskins | One token set (`--ui-*`). Presets are reskins, and each preset defines light and dark values. Custom colours override on top. |
| Theme change speed | F "immediately". H 180–260 ms interpolation | Applied immediately, with colour transitions interpolated over 180–260 ms. Reduced motion means instant. |
| Membership API | E suggests `POST`. Repo uses `PUT` | Keep `PUT` (idempotent). |
| Settings gear | G: bottom nav fixed (Home/Collections/Canvas/Profile) | Gear sits by the account controls, **not** in the bottom nav. |

### Open decision (blocks multi-user work only)

**Privacy architecture.** B (Drive-only, no backend, no public links) and C (server sessions, passkeys/magic links, DB isolation, public/unlisted links, follows) describe different trust models. The repo has a disabled D1 API foundation for C, while the app runs on B's Drive model.

- *Recommended:* **Drive-first (B).** Keep the D1 API disabled and record it in `docs/decisions/`. Apply C's principles (§14–18 CSP/XSS, §35 logging, §44 analytics, §45–55 LGPD documentation) to the static app. Public/unlisted links and follows are deferred.
- Alternatives: backend-first (C), or hybrid (backend for identity, invites and profiles; Drive for content).

Single-user UI work below does not depend on this decision.

---

## 1. Status legend

✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on external gate or decision

## 2. Collections (D, E, F §8)

| Requirement | Status | Notes |
|---|---|---|
| Many-to-many membership, IDs not names | ✅ | Local `cardIds` lists. The server `card_collections` table exists in the disabled D1 API |
| Multiple badges under cards, wrapping | ✅ | `CollectionBadge` |
| Remove one membership + 7 s Undo, rollback on failure | ✅ | Roadmap increment 1, tested |
| Badge click opens **multi-select picker** (F §8) | ✅ | Still the D/E Open/Remove popover. Needed: search, checkboxes, separate Open row, inline create, empty/loading/retry, keyboard, viewport positioning, per-relationship serialization |
| "Add to collection" for cards with no memberships | ✅ | |
| Same picker inside the editor (draft until Save) | 🟡 | Editor has a Collections section. Confirm it is the shared picker with draft semantics |
| Extension multi-select picker, search, inline create, auto-select | ✅ | `popup.js`. Check prefix-match ranking and the "No collections yet" state |
| Duplicate names disambiguated (`Research · 12 items`) | ✅ | Card picker and badges |
| Open collection keeps browser history | ✅ | Only `replaceState` is used, so Back does not return to the previous collection |
| Collection metadata cache, stale-while-revalidate, conservative prefetch | ⬜ | Local IndexedDB is fast, so this matters mostly once remote data exists. Measure first |
| Stable shell, no re-render of nav/search on switch | 🟡 | Needs a profiling pass |
| Right-click quick add, Shift+F10/ContextMenu, viewport clamp | ✅ | `openQuickAddMenu` |
| Quick add and `+` share one action registry | 🟡 | Verify one definition list. Native menus must stay on inputs, selections, links and images |
| Server-side authorization of collection ops | 🔒 | Depends on the architecture decision |

## 3. Notes and editor (F §2–3)

| Requirement | Status | Notes |
|---|---|---|
| Separate note field, plain-text bubble outside the image | ✅ | `ScreenshotNote`, uncommitted |
| 4-line clamp, Show more/less, no overlap | ✅ | Smoke-tested |
| Compact 660 px editor, tabs, fixed toolbar/footer, no shell scroll | ✅ | |
| Both removal actions in top toolbar with original semantics | ✅ | Trash/Restore + permanent delete |
| Real mobile-keyboard and 200% zoom acceptance | 🔒 | Real-device check |

## 4. Appearance, reskin and themes (F §4–7, G)

| Requirement | Status | Notes |
|---|---|---|
| `--ui-*` token model; presets PlayStation/Graphite/PS Blue/Warm CRT/Custom; hex rows, reset | ✅ | `appearance.ts`, `AppearanceSettings` |
| Light/Dark/System with persistence | ✅ | `themeMode` |
| Dark CRT radial background following the skin | ✅ | `playstation.css:27` |
| Themed scrollbars | ✅ | |
| Full light/reskin coverage (all card types, portals, tooltips, toasts, canvas) | 🟡 | Progress notes say the portal/reskin audit is pending. Hard-coded colours remain (e.g. `styles.css` is about 2,800 lines) |
| Contrast guardrails for custom colours | ✅ | G §17A: warn or correct unreadable values |
| Live preview tile in Appearance | ✅ | |
| Appearance preferences per account | 🔒 | Currently `localStorage`, unscoped. Depends on account work (B M9) |
| Settings **gear** next to account controls | ✅ | A gear-icon button toggles light/dark; another opens sync settings. F wants one "Settings" gear, with the theme toggle moved into the avatar menu |
| **Avatar menu** with Appearance section (mode, reskin, intensity) + account actions | ✅ | Avatar currently opens Settings directly |
| Frosted icon family (G §9) for remaining icons | 🟡 | Check `InterfaceIcon`/`NavigationIcon` against G's list |
| Typography (techno-geometric display, uppercase micro labels) | 🟡 | Verify |
| Angled selection frame + floating Edit/Move/Delete toolbar above cards | ✅ | `clip-path`, `CardActions` |

## 5. Motion (H)

| Requirement | Status | Notes |
|---|---|---|
| Easing tokens, menu/popover entry animations | ✅ | `--ease-*` |
| Reduced motion | ✅ | |
| Bottom nav active indicator slide; tab underline slide | ⬜ | Verify |
| Card hover lift 1–2 px; selection corner line-draw | 🟡 | Verify |
| Delete fade + collapse; move translucency; tag chip in/out | ⬜ | Verify |
| Extension save "Saved" state; mode indicator slide | ⬜ | Verify |
| Canvas selection/connector settle | ⬜ | |

## 6. PS2 UI sounds (F §9)

| Requirement | Status | Notes |
|---|---|---|
| Audio service, unlock on gesture, 100 ms throttle, hidden-tab suppression, single voice | ✅ | `UiSounds.tsx` |
| On/Off, volume, Preview in Settings | ✅ | Stored in unscoped `localStorage` |
| Event map: hover, select, open, back/cancel, save | 🟡 | Only hover and click are mapped |
| Authentic PS2 samples + manifest | ⚠️ | The two files are named `deck_ui_*`, and the manifest says the pack is partly combined with **SteamOS** audio. F explicitly forbids Steam sounds labelled PS2. No redistribution licence was found. Replace with verified PS2 extracts or relabel |

## 7. Canvas (B §10)

| Requirement | Status | Notes |
|---|---|---|
| Rotation, connectors, labels, pen/highlighter/shapes/text, anchored annotations, eraser, Undo/Redo, limits | ✅ | `docs/canvas-tools.md`. 200/500/200 fixture opens in about 1.4 s |
| Canvas in native backup export/restore | ✅ | Drive content sync for *anything* is still unbuilt (M5b) | Canvas data is local only. Risk of data loss on device change |
| Real Android touch/stylus acceptance | 🔒 | |

## 8. V2 platform milestones (B)

| Milestone | Status | Notes |
|---|---|---|
| M8 baseline audit, v2 schemas, compatibility tests, feature flags | ⬜ | |
| M9 account/workspace-scoped DBs, safe switching, capture destinations | ⬜ | No `accountKey`/`workspaceId` in code |
| M10 on-demand OCR (Tesseract.js, EN/PT, self-hosted) | ⬜ | |
| M11a/b connectors, rotation, drawing | ✅ local | Sync/export gap, see §7 |
| M12 Drive collaboration feasibility (real A/B/C accounts) | 🔒 | Needs three disposable Google accounts |
| M13–M15 sharing, collaboration, friends pilot | 🔒 | After M12 |
| M16 PDF, M17 collection nesting | ⬜ optional | |

## 9. Security and compliance (C, B §14)

| Requirement | Status | Notes |
|---|---|---|
| Plain-text rendering, no `dangerouslySetInnerHTML` for saved content | 🟡 | Verify with an XSS payload test across all text fields |
| Restrictive production **CSP** | ✅ | `_headers` has nosniff/referrer/frame/permissions policies but no `Content-Security-Policy`. Needs the Google endpoints plus self-hosted workers/WASM |
| `frame-ancestors 'none'` | ✅ | `X-Frame-Options: SAMEORIGIN` only |
| Tokens in memory only, `drive.file` scope | 🟡 | Verify in `googleDrive.ts` |
| D1 API: owner-scoped CRUD, hashed sessions, revocation, isolation tests, CI | ✅ disabled | `docs/security-foundation.md` |
| Passkeys / magic links / invites, rate limits, audit log | ⬜ 🔒 | Only if backend-first or hybrid |
| Privacy notice, terms, retention schedule, processor inventory, incident process, data-subject workflow | ⬜ | Controller/contact details must come from the owner, not be invented |
| Marco Civil access-log assessment, minors safeguards | 🔒 | Legal review |

## 10. Recommended implementation order

1. **Data safety:** add canvas data to Drive sync and native export/restore (§7).
2. **Collection picker under cards** (F §8), Open with real history entries, "Add to collection" empty state, duplicate-name disambiguation.
3. **Settings gear + avatar Appearance menu**; move the light/dark toggle out of the sidebar.
4. **Theme coverage audit:** replace hard-coded colours with tokens, cover portals, add contrast guardrails and a preview tile.
5. **Motion gaps** (H §4–15) and the full sound event map. Resolve the sample provenance.
6. **Security hardening for the static app:** CSP, `frame-ancestors`, XSS test sweep, token-handling check.
7. **Architecture decision** recorded in `docs/decisions/`, then M8 → M9 → M10 (OCR).
8. External gates: M12 real-account tests, real-device acceptance, legal documentation.

## 11. Environment notes

- `node_modules` was installed on Windows. Linux tooling (Rollup native binary) can't run Vitest or Vite from the Cowork shell. `npm run typecheck` passes. Run `npm test`, `npm run lint` and `npm run build` on Windows.
- 76 files show as modified in git, but most diffs are line-ending changes only (CRLF). Real changes are in about 9 files plus 5 new ones (notes, sounds, smoke script). Consider adding a `.gitattributes` and committing the notes/editor increment.

# Duckler — Notes, Appearance, Editor and Audio Patch

Date: 2026-10-04  
Status: implementation-ready draft; final icon and sound assets must be identified before asset integration.

## 1. Scope and precedence

Implement this as an incremental patch to the existing Duckler app. Inspect the current components, schema, theme system and action handlers before making changes. Reuse existing infrastructure and preserve saved content, permissions, collection relationships, synchronization and recovery behavior.

This specification covers:
- Separate screenshot notes displayed outside cards as dialogue-like bubbles.
- A smaller, rounded card editor with removal actions in its top toolbar.
- Scrollbars consistent with the app’s aesthetic.
- Complete light-mode and reskin coverage, including items.
- Previously requested collection/canvas artwork.
- A settings icon and appearance controls inside the avatar menu.
- A collection multi-select opened from collection names beneath cards.
- PS2 system UI interaction sounds.

This is a separate patch from `duckler_collection_patch_spec.md`. Its collection-name click behavior supersedes that file’s initial relationship-only popover. Preserve its many-to-many model, membership undo, authorization, extension picker, navigation improvements and right-click quick-add parity. Its dark CRT background remains the dark-mode baseline; light mode receives its own complete palette.

### Draft decisions

These are implementation defaults where the request leaves details open:
- One editable plain-text note per screenshot; this is a card annotation, with no threaded conversation or new messaging system.
- Notes appear directly beneath the screenshot frame, followed by collection controls.
- Collection clicks manage membership through checkboxes; an explicit action opens a collection.
- Quick appearance choices live under the avatar. The settings icon opens the full settings surface.
- The two existing removal actions retain their actual meanings. Inspect them before changing placement; their exact labels are not supplied in this request.
- “Editor never scrolls down” means its dialog, page background and form layout never scroll. Long text may scroll inside its focused text field so all content remains editable.

## 2. Screenshot notes outside the card

### Data and editing

Give screenshot cards separate `title` and `note` fields, using the existing naming conventions in code. Adding, editing or removing a note must never overwrite the title, filename, image, source URL or collection membership.

Use the existing card save, sync, permission and conflict-handling paths. Include notes in existing exports/backups and restore them with the card. Existing cards without notes remain valid. Do not infer that an existing title is a note or migrate titles automatically. Render note content as escaped plain text with line breaks.

Provide a clearly labeled Note field in the card editor. If screenshot capture already exposes a note input, route it into the same field. An empty or whitespace-only note creates no visible bubble. Keep the draft on save failure and offer retry.

### Presentation

- Render the note outside the image card’s border as an attached speech bubble with a small pointer toward its card.
- Use a compact rounded surface, readable type, subtle border and restrained shadow consistent with the active skin.
- Preserve the original screenshot pixels and aspect ratio. The note does not overlay or become part of the image.
- Place title metadata with the card, then the external note, then the collection controls. Maintain a clear visual connection between all three.
- Allocate real layout height for the bubble. Adjacent cards must never overlap it; masonry/virtualized layouts must remeasure after edits and expansion.
- Initially show up to four lines, with a keyboard-accessible “Show more” action for longer notes and “Show less” after expansion. Expansion changes layout height without an internal bubble scrollbar.
- Keep the note selectable and readable on touch devices. Show text actions on keyboard focus as well as hover.
- Render the annotation consistently in library and collection grids and any shared card renderer. Canvas instances using that renderer must account for the attached bubble in their bounds and hit testing.

## 3. Compact editor redesign

### Layout

Use a centered compact dialog with approximately 600–680 px maximum width, 16–20 px corner radius and tight, deliberate spacing. Width must shrink to the viewport with safe margins. Use the available visual viewport height, including when a mobile keyboard is open.

Suggested structure:
1. Fixed top toolbar: edit label, the two existing removal actions, close.
2. Bounded image preview and a short set of visible fields.
3. Fixed footer: Cancel and Save.

At roomy desktop sizes, a two-column preview/form layout is appropriate. Reduce preview height first when space is tight. Use compact named tabs such as Details, Note and Collections when the fields cannot fit. Each tab must fit its allocated space; keep drafts when switching tabs. Save applies the complete edit draft.

The dialog shell and editor form must have no vertical scrolling. Opening the editor must not change the underlying page’s scroll position. Lock background scrolling while open, then restore the original position on close.

Do not hide overflow to conceal unreachable controls. At small heights or enlarged text, progressively remove the decorative preview and use short field steps with fixed Previous/Next controls. A multiline text field may scroll internally for long content. Any bounded collection list inside a popover may scroll separately. These exceptions never scroll the editor shell.

### Removal actions

- Move both current removal buttons into the editor’s top toolbar, not the app’s global navigation.
- Preserve their handlers, permission checks, existing confirmation/undo behavior and distinct meanings.
- Use compact icons with accessible names and tooltips; clearly identify the action’s target. Do not introduce a second ambiguous trash icon with the same label.
- If one action removes collection membership, it must identify the collection and preserve the card and all other memberships. If another deletes the card, its wording must communicate that broader effect.
- Keep both controls visually separate from Close. Destructive emphasis appears on intentional hover/focus, with a visible label where ambiguity would otherwise remain.

### Motion and interaction

Use subtle 120–180 ms color, border, highlight or 1–2 px movement transitions on toolbar controls. No layout shift or continuous animation. Provide equivalent focus feedback and honor reduced-motion preferences.

Trap keyboard focus within the open dialog; Escape follows the existing unsaved-change behavior. Restore focus to the triggering control after close. Keep Save, Cancel and Close reachable at all supported sizes.

## 4. Scrollbar visual pass

Style all app-owned scrollable surfaces: library, settings, collection lists, menus and long text fields. The editor shell remains non-scrollable as specified above.

- Use a slim 6–8 px visual track with a rounded thumb, muted chrome/graphite colors in the dark skin and corresponding darker-on-light colors in light mode.
- Use a transparent or very quiet track. Give the thumb enough contrast to remain discoverable.
- Increase thumb emphasis on hover/focus without widening or shifting surrounding layout.
- Use native scrolling behavior and browser-supported scrollbar styling. Preserve wheel, trackpad, touch and keyboard scrolling; avoid a custom scrolling engine.
- Provide standard scrollbar properties and browser-specific fallbacks where needed. Let forced-color or unsupported environments retain legible native controls.
- Avoid unnecessary nested scroll areas. Reserve scrollbar space where necessary to prevent content shifts.

## 5. Repair light mode and all reskins

### Required behavior

Theme changes must update the complete interface immediately, including already-rendered items and open overlays. Fix the shared styling system instead of applying isolated background overrides.

Create or complete semantic tokens for page background, item surface, raised surface, input surface, primary/muted text, borders, accents, selected states, hover states, focus indicators, destructive states, shadows, scrollbars and icon treatment. Audit hard-coded colors and detached/portal-mounted overlays.

Coverage must include:
- Screenshot, image, link and text cards and their metadata.
- External note bubbles, collection badges and selected chips.
- Collection tiles, canvas UI and canvas item frames.
- Edit dialog, menus, picker, tooltips, notifications and empty/loading/error states.
- Avatar menu, settings controls, navigation and scrollbars.

Light mode must have genuinely light page and item surfaces, readable dark text and restrained chrome details. Dark mode retains the very dark charcoal CRT treatment with faint illumination. Existing reskins must visibly affect item frames, surfaces, accents and state styling. Original screenshots and other user media retain their colors; do not invert or recolor media to make a theme appear complete.

Persist appearance settings using the existing user preference system. Apply them on startup without a flash of the wrong theme where practical. Respect System mode when selected. Keep preferences isolated between accounts on shared devices.

## 6. Implement the requested icons

Use the actual approved artwork from the earlier design work:

| Destination | Artwork reference |
| --- | --- |
| Collections | Three shiny chrome CDs in a restrained fan arrangement, with the middle disc slightly higher and slightly displaced in the opposite direction. |
| Canvas | Slim, slightly taller DIY album/book with punk stickers and chrome coloring. The eye sticker has a red ink-like mark/sparkle. |

Integrate these assets wherever the same collection or canvas navigation action appears, including relevant creation menus. Reuse one icon component/asset mapping per concept. Preserve the artwork’s proportions and transparency; avoid opaque image boxes, stretching and excessive glow.

Use simplified derivatives of the approved artwork only where tiny icon sizes require legibility. Keep accessible text labels and consistent hit areas. Theme the surrounding surface and any approved theme variants without recoloring the artwork destructively.

Asset handoff requirement: identify the final approved files in the supplied project or design assets and record their paths in the implementation summary. The descriptions above identify the intended designs; they are not a substitute for the final image bytes. If absent, finish the icon components and mappings and report the exact missing assets. Do not silently declare placeholders to be the completed artwork.

## 7. Settings and avatar menu

Add a recognizable settings gear to the existing app navigation, close to the account controls. Use the same chrome/technical aesthetic as utility controls, with tooltip, visible focus state and accessible name “Settings”. It opens the existing settings surface, or a compact settings panel if none exists.

Clicking the user picture opens the user menu. Add a compact Appearance section containing:
- Light / Dark / System.
- Current reskin selector.
- Existing background illumination/intensity control, if the app already has it.

Keep account actions clearly grouped in the same menu. Put detailed appearance options, reduced-motion controls and sound settings in the full settings surface. Both entry points must read/write the same preferences and reflect each other immediately. Remove redundant standalone quick controls after moving them; retain existing appearance options through settings.

## 8. Collection names beneath cards: multi-select picker

Clicking any collection name/badge beneath a card opens one small anchored picker for that card’s complete set of collection memberships. It does not immediately navigate away. Cards with no memberships show a compact “Add to collection” action opening the same picker.

### Picker contents

- Search field, followed by selectable available collections.
- Checkboxes/checkmarks for every current membership.
- An explicit “Open collection” action per row, visually and interactively separate from the membership toggle.
- Inline “Create collection” using the existing creation workflow.
- Empty, loading, retry and no-results states.

Support multiple simultaneous memberships. Keep the picker open while selecting. Search filters the list without changing hidden selections. Use IDs internally. Position the popover inside the viewport without shifting the card. Long lists use the themed scrollbar.

### Save behavior

The picker under a card applies each membership change immediately through the existing optimistic mutation path. Removing a checked collection removes only that relationship and offers the existing 5–8 second Undo. Roll back failed mutations and preserve other changes. Serialize changes per relationship or otherwise prevent stale responses from reversing a newer selection.

Inside the card editor, the same picker edits the local draft and commits with Save; Cancel discards its membership changes. Creating a collection is a separate operation and an already-created empty collection may remain after canceling the card edit. Make that behavior consistent with the existing app.

Selecting “Open collection” navigates using the existing route and browser history. It never toggles membership. Dismiss on outside click or Escape; restore trigger focus. Support keyboard search, arrow navigation and Space/Enter toggles with announced selected states.

Only expose collections the user is authorized to see. Enable assignment/removal according to actual permissions, enforced on the server. Do not leak private names through errors. Preserve the existing extension multi-select and many-to-many behavior.

## 9. PS2 system UI sounds

Implement a PS2 system UI sound pack for short interface feedback. Use verified PS2 system/menu audio supplied for the project. Do not substitute PS1, Xbox, Steam or generic computer sounds and label them PS2.

### Event mapping

| App event | Sound role |
| --- | --- |
| Enter a new enabled actionable UI target by pointer or keyboard | Quiet navigation/hover tick. |
| Activate a card, collection or canvas | Selection/game-entry cue. |
| Open a menu or editor | Short confirm/open cue. |
| Back, Cancel or close an overlay | Back/cancel cue. |
| Complete a save successfully | Subtle confirmation, if a suitable distinct sample exists. |

Map available authentic samples deliberately; reuse appropriate cues if the supplied pack has fewer distinct sounds. No startup sequence, looping ambience or music is requested. Do not invent extra PS2 sounds for unsupported event types.

### Playback behavior

- Provide UI sounds On/Off, a volume slider and a user-triggered Preview in Settings.
- Draft default: PS2 pack selected, UI sounds enabled at a quiet level. Persist the user’s choice.
- Initialize/unlock audio after a browser-accepted user interaction. Hover before audio is available remains silent; never block navigation on audio initialization.
- Play hover once when entering a new eligible target, with an approximately 100 ms global throttle. Do not trigger on every mousemove, text, decorative elements, nested children or disabled controls.
- Deduplicate focus/pointer/click events representing the same interaction. Selection has priority over hover and cancels a pending hover cue.
- Limit concurrent sounds and avoid long overlapping tails during rapid navigation. Stop active UI playback when muted and suppress sounds while the document is hidden.
- Match perceived loudness across files. Load audio lazily, cache decoded short samples, and keep all actions functional when audio fails or is unavailable.
- Use the project’s static asset pipeline; no runtime hotlinks to external sound websites.

Asset handoff requirement: record each included sample’s filename, source, permitted use and event mapping in a sound manifest. Exact PS2 audio files are not attached to this specification. If missing, complete the audio service, settings and event hooks with graceful silence, then report the audio assets as an outstanding integration dependency. Final audio acceptance requires actual supplied samples and a listening check.

## 10. Suggested implementation sequence

1. Inspect existing editor actions, theme tokens, card renderers, collection mutations and asset locations.
2. Add the separate note field and persistence; implement external note layout.
3. Correct theme propagation across items and overlays; theme scrollbars.
4. Rebuild the compact editor and move existing removal actions.
5. Add the shared collection picker behavior beneath cards.
6. Integrate approved icons; add settings entry and avatar appearance controls.
7. Add audio service, preferences and PS2 asset mappings.
8. Verify the acceptance scenarios below and summarize remaining asset dependencies explicitly.

## 11. Acceptance scenarios

- [ ] Add/edit/remove a screenshot note; title and image remain intact after reload and normal sync.
- [ ] Blank notes leave no empty bubble. Long notes expand without overlap, including in masonry layouts.
- [ ] Existing cards and collection memberships survive the patch unchanged.
- [ ] Both original removal actions appear in the editor toolbar with correct targets, permissions and semantics.
- [ ] Editor shell, form and background never scroll. Save/Cancel/Close remain reachable at 1366×768, 1024×600, 390×844 and desktop 200% zoom; verify a mobile keyboard-open state as well.
- [ ] Long note text remains fully editable in its bounded input; tabs/steps preserve drafts.
- [ ] Hover/focus motion is subtle and reduced-motion settings work.
- [ ] Scrollbars match each theme while wheel, trackpad, touch and keyboard behavior remain intact.
- [ ] Light mode and every existing reskin update all card types and open overlays, including newly loaded items, without altering media pixels.
- [ ] Theme changes persist after reload and respect account boundaries and System selection.
- [ ] Final chrome CD and punk album assets appear in their intended entry points, with the red eye accent reading as ink.
- [ ] Settings gear opens settings; avatar menu exposes the quick appearance controls; changes agree across both surfaces.
- [ ] Clicking a collection name opens the multi-select. Selecting a second collection preserves the first.
- [ ] Deselecting one membership preserves the card and all other memberships; Undo restores it.
- [ ] Collection navigation is separate from membership selection; failed saves and rapid toggles leave accurate state.
- [ ] Collection picker and new note operations honor existing access controls.
- [ ] PS2 cues play for the mapped actions after audio unlock. Rapid hover does not produce a sound storm.
- [ ] Mute, volume and Preview work and persist; missing audio never breaks an action.
- [ ] Verify keyboard focus, Escape, readable text/contrast and visible selected states throughout.

## 12. Delivery requirements for the implementer

Report the components and data changes made, meaningful checks performed, final icon paths and audio manifest, and any unresolved dependencies. Include before/after screenshots of the editor, an annotated screenshot card, the collection picker and both light/dark item views. An implementation with placeholder artwork or absent PS2 samples must identify those items as incomplete.

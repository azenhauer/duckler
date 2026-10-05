# Duckler — Collection Management Patch Specification

## 1. Scope

This is a **functional patch specification** for collection handling.

It is intentionally separate from the main Duckler master specification.

This patch must preserve:
- current collection page layout
- current navigation
- current card design
- current collection badges shown below cards
- current visual reskin direction
- current many-to-many collection model

A card may belong to **multiple collections simultaneously**.

---

## 2. Data Model Requirement

The collection relationship must be modeled as many-to-many.

Conceptually:

```text
cards
collections
card_collections
```

`card_collections` should contain at minimum:
- card_id
- collection_id
- created_at

Recommended:
- composite unique constraint on `(card_id, collection_id)`
- foreign keys with appropriate cascade behavior
- indexes on both `card_id` and `collection_id`

The UI must never assume one card has only one collection.

---

## 3. Collection Badges Below Cards

Keep the existing collection badge/icon shown below a card.

If a card belongs to multiple collections:
- show multiple collection badges
- keep them visually compact
- allow wrapping when needed
- do not hide the relationship behind a generic count unless space becomes a real issue

### Interaction

Clicking a collection badge must open a small contextual popover for that specific relationship.

Popover should include:
- collection name
- `Open collection`
- `Remove from collection`

Optional:
- small collection icon
- item count

Do not open a large modal.

---

## 4. Remove From Collection

Selecting `Remove from collection` should:

1. remove only that specific `card_id ↔ collection_id` relationship
2. leave the card intact
3. preserve all other collection memberships
4. update the UI immediately
5. show a temporary `Undo` action

### Undo behavior

Undo should:
- restore the exact relationship
- return the badge immediately
- not reload the whole page

Recommended undo window:
- 5–8 seconds

Avoid confirmation dialogs for this reversible action.

---

## 5. Open Collection From Badge

Selecting `Open collection` should navigate directly to that collection.

Requirements:
- use the existing collection navigation system
- preserve current app navigation
- avoid full-page reload
- maintain browser history correctly
- transition quickly

---

## 6. Extension Collection Picker

The extension's current free-text collection field must be replaced with a **real multi-select collection picker**.

Opening the field should immediately show:
- existing collections
- currently selected collections
- search/filter input
- `+ Create new collection`

The user must not need to remember collection names manually.

---

## 7. Extension Multi-Select Behavior

A captured card may be assigned to multiple collections before saving.

Picker behavior:
- click collection to select
- click again to deselect
- selected collections display as chips and/or checkmarks
- multiple selections remain visible
- picker stays open until user dismisses it or completes capture

The final card creation request must persist all selected collection relationships.

---

## 8. Search Existing Collections

The collection picker should support fast filtering.

Filtering should:
- match collection name
- be case-insensitive
- update as the user types
- prioritize exact/prefix matches

For small collection counts, the full list should appear immediately before typing.

---

## 9. Create New Collection From Extension

The extension must include:

`+ Create new collection`

This should work **inside the capture flow**.

Suggested behavior:

1. user clicks `+ Create new collection`
2. small inline input appears
3. user enters name
4. collection is created
5. new collection is automatically selected
6. picker returns to normal state
7. capture flow continues

Do not redirect the user away from the extension.

---

## 10. Duplicate Collection Names

Define behavior explicitly.

Recommended:
- allow duplicate display names only if the existing app already supports them
- internally use unique IDs
- if duplicates exist, show enough context to distinguish them

Example:

```text
Research · 12 items
Research · 4 items
```

IDs must drive selection, not names.

---

## 11. Edit Existing Card Memberships

When editing a card, use the same multi-select collection picker.

The user should be able to:
- see all current collection memberships
- add additional collections
- remove memberships
- create a new collection
- save all changes together

Do not use a separate collection-edit UI unless required later.

---

## 12. Collection Picker Loading

The extension should not wait for the user to focus the field before fetching collections if avoidable.

Recommended:
- fetch collection metadata when extension opens
- cache it for the current session
- refresh after create/delete/rename events

Collection metadata should be lightweight:
- id
- name
- optional icon
- optional item count

---

## 13. Collection Navigation Performance

Collection-to-collection navigation currently feels slow.

This patch must include a performance pass.

Target behavior:
- collection shell/title changes immediately
- cached metadata renders instantly
- content cards load without blocking navigation
- no unnecessary full-page refresh
- no redundant collection list refetch
- no duplicate API requests caused by re-renders

---

## 14. Recommended Navigation Caching

Cache:
- collection list
- collection IDs/names
- lightweight collection metadata
- recently visited collection contents where practical

Use stale-while-revalidate behavior where appropriate:

1. show cached content immediately
2. fetch fresh data in background
3. update only if changed

Do not keep stale permission-sensitive data beyond the authenticated session.

---

## 15. Prefetching

When practical, prefetch likely next collection data.

Possible triggers:
- hover/focus over a collection navigation target
- recently visited collections
- visible collection links

Keep prefetching conservative.

Do not fetch every collection's full contents at startup.

---

## 16. Avoid Full Re-Renders

Switching collections should not rebuild unrelated app UI.

Keep stable:
- bottom navigation
- search
- global shell
- persistent top navigation where applicable

Only collection-specific content should update.

---

## 17. Loading State

If collection contents are not cached:
- show the destination collection title immediately
- show a lightweight content loading state
- avoid blocking the whole screen

Preferred:
- minimal placeholders
- subtle loading indicator
- preserve layout stability

Avoid:
- full-screen spinner
- blank flash
- navigation freeze

---

## 18. API Expectations

Recommended endpoints/operations:

```text
GET    /collections
POST   /collections
GET    /collections/:id
POST   /cards/:cardId/collections/:collectionId
DELETE /cards/:cardId/collections/:collectionId
PATCH  /cards/:cardId/collections
```

Batch membership update should be supported for edit flows.

Example payload:

```json
{
  "collection_ids": [
    "collection-a",
    "collection-b",
    "collection-c"
  ]
}
```

Server must validate:
- card ownership/access
- collection ownership/access
- duplicate relationships
- invalid IDs

---

## 19. Optimistic Updates

Use optimistic UI for:
- adding card to collection
- removing card from collection
- selecting/deselecting collection in extension
- creating a collection from extension

If server request fails:
- restore previous state
- show compact error
- preserve user input

Do not leave UI and backend state inconsistent.

---

## 20. Error Handling

Collection picker should handle:
- collections failed to load
- collection creation failed
- membership update failed
- collection deleted elsewhere
- stale collection ID

Messages should be concise.

Examples:
- `Couldn’t load collections`
- `Couldn’t create collection`
- `Collection no longer exists`
- `Couldn’t update card`

Provide retry where useful.

---

## 21. Empty State

If the user has no collections:

Extension picker should show:

```text
No collections yet
+ Create new collection
```

The field must not look broken or empty.

---

## 22. Keyboard Support

Desktop/extension picker should support:
- arrow keys
- Enter to select
- Escape to close
- typing to search
- Tab navigation

Popover actions below card should also be keyboard accessible.

---

## 23. Accessibility

Requirements:
- collection badges have accessible names
- popover announces relationship context
- selected collection states use more than color alone
- focus states remain visible
- removal action is clearly labeled
- Undo is keyboard accessible

---

## 24. Visual Behavior

This patch should inherit the existing approved Duckler reskin.

Do not introduce:
- new sidebars
- new navigation systems
- large dialogs
- unrelated visual restructuring

The collection picker, popover, and Undo message should use:
- existing typography
- existing translucency
- existing technical-line aesthetic
- existing motion spec

---

## 25. Background Visual Correction

Apply the approved dark CRT-like background treatment, but make it **darker overall** than the earlier version.

Requirements:
- very dark granite-charcoal base
- subtle internal illumination only
- center may be slightly lighter, but still dark
- edges remain close to near-black charcoal
- no visible texture
- no stone/granite pattern
- no grain
- no scanlines
- no bright blue wash
- no strong vignette
- no glossy modern gradient

The intended effect is a **powered-on old cube CRT screen in a dim room**:
dark first, softly illuminated second.

Suggested direction:

```css
background:
  radial-gradient(
    ellipse at 50% 40%,
    #171b1f 0%,
    #111417 42%,
    #0c0f11 72%,
    #080a0c 100%
  );
```

Optional cool light should remain extremely faint:

```css
background:
  radial-gradient(
    ellipse at 50% 38%,
    rgba(105, 125, 138, 0.035) 0%,
    rgba(65, 78, 88, 0.012) 42%,
    transparent 70%
  ),
  #090b0d;
```

The background should never become one of the brightest elements on screen.

---


## 25A. Right-Click Quick Add Menu

Add a custom context menu that appears when the user **right-clicks on empty page space**.

The right-click menu should expose the same creation actions currently available from the app's existing `+` button.

### Functional parity

The context menu must stay synchronized with the `+` button.

If the `+` button currently allows actions such as:
- add note
- add image
- add link
- create collection
- create canvas
- upload/import content

the right-click menu should expose the same applicable actions.

Do not create a second independent action system.

Both entry points should call the same underlying commands/functions so behavior remains consistent.

### Placement

The menu should appear:
- at or near the pointer position
- fully inside the viewport
- above surrounding content
- without shifting page layout

If close to a screen edge, reposition automatically so the menu stays visible.

### Empty-space behavior

Right-clicking on neutral/empty page space should open the quick-add menu.

Do not hijack context menus where the user is interacting with:
- editable text
- text selections
- links where browser context actions are useful
- images where native image actions may be expected
- form fields
- existing contextual card controls

Only override the browser context menu where Duckler's quick-add interaction clearly applies.

### Existing object behavior

Right-clicking directly on a card or collection object may continue to use object-specific actions if such a context menu exists or is added later.

Do not show the generic `+` menu over a selected card when card-specific actions are more relevant.

### Visual treatment

Use the approved Duckler reskin:
- compact translucent panel
- very dark smoked surface
- subtle technical border
- same icon family as the `+` menu
- low-contrast separators
- existing typography
- short fade/translate animation from the motion spec

Do not add a sidebar, drawer, or large modal.

### Interaction

Support:
- mouse click
- right-click invocation
- keyboard navigation
- Escape to close
- click outside to close

Where practical, support the keyboard context-menu key / `Shift+F10`.

### Consistency requirement

The labels, icons, availability rules, permissions, and resulting actions must match the existing `+` menu.

If an action is unavailable in the `+` menu due to:
- permissions
- current page context
- user role
- unsupported content type

it must also be unavailable in the right-click menu.

### Acceptance criteria

- [ ] right-clicking empty page space opens quick-add
- [ ] menu contains the same applicable actions as the existing `+` button
- [ ] both entry points use the same underlying action handlers
- [ ] menu stays within viewport bounds
- [ ] Escape closes it
- [ ] clicking elsewhere closes it
- [ ] native browser context behavior remains available in text fields, selections, and other appropriate elements
- [ ] no new navigation structure is introduced


## 26. Security / Privacy

Collection membership operations must enforce authorization server-side.

A user must never be able to:
- add their card to another user's private collection
- remove a card from a collection they cannot manage
- enumerate private collections through the picker
- discover private collection names through API errors

The extension collection picker must return only collections the authenticated user is allowed to assign content to.

---

## 27. Acceptance Criteria

Patch is complete when:

- [ ] cards can belong to multiple collections
- [ ] all memberships are stored correctly
- [ ] multiple badges appear below cards
- [ ] clicking a badge opens a contextual popover
- [ ] popover includes Open collection
- [ ] popover includes Remove from collection
- [ ] removing one membership preserves all others
- [ ] Undo restores the removed relationship
- [ ] extension lists existing collections immediately
- [ ] extension supports multi-select
- [ ] extension can create a new collection inline
- [ ] newly created collection is automatically selected
- [ ] editing a card exposes current memberships
- [ ] existing collection navigation remains unchanged
- [ ] navigation between collections is materially faster
- [ ] switching collections does not full-page reload
- [ ] no redundant refetch/re-render loops remain
- [ ] collection operations use IDs rather than names
- [ ] unauthorized collections never appear in picker
- [ ] background is darker while retaining subtle CRT-like illumination

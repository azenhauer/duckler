# Duckler — New Features Completion Specification

## 1. Purpose

This patch closes the currently identified functional gaps before the multi-user rollout.

It is separate from the main visual-reskin specification.

Preserve:
- current navigation
- current bottom nav
- current collection top navigation
- current search placement
- current card layout
- current Duckler identity
- approved Sony / PlayStation-era reskin

No sidebars.

---

## 2. Collection Membership Model

Cards can belong to multiple collections.

Use a many-to-many relationship:

```text
cards
collections
card_collections
```

Requirements:
- unique `(card_id, collection_id)`
- indexes on both IDs
- server-side authorization
- no collection ownership assumptions based on name

---

## 3. Collection Badges Under Cards

Keep the current collection badge/icon under each card.

If a card is in multiple collections:
- show multiple badges
- keep them compact
- allow wrapping
- preserve current visual language

Clicking a badge opens a small contextual popover.

Popover:
- collection name
- Open collection
- Remove from collection

No large modal.

---

## 4. Remove From Collection

Removing a collection relationship:
- removes only that membership
- does not delete the card
- preserves other memberships
- updates UI immediately
- exposes Undo for 5–8 seconds

Undo restores the exact relationship.

---

## 5. Open Collection

From the collection badge popover:

`Open collection`

should:
- navigate using current collection routing
- avoid full-page reload
- preserve browser history
- render destination quickly

---

## 6. Extension Collection Picker

Replace the extension's disconnected collection-name text field with a real multi-select picker.

Opening it should immediately show:
- existing collections
- current selections
- search/filter
- `+ Create new collection`

Users should never need to remember collection names manually.

---

## 7. Multi-Select Collections

The extension must support assigning one capture to multiple collections.

Behavior:
- click to select
- click again to deselect
- selected entries show checkmark/chip
- picker remains usable for multiple selections
- all selected collection IDs persist when card is saved

---

## 8. Search Collections

Filter:
- case-insensitive
- live while typing
- exact/prefix matches prioritized

Before typing, show the user's collection list immediately.

---

## 9. Create Collection From Extension

Inside the picker:

`+ Create new collection`

Flow:
1. inline name field
2. create collection
3. automatically select it
4. return to picker
5. continue capture flow

Do not navigate away.

---

## 10. Edit Existing Card Memberships

Use the same collection picker for card editing.

Allow:
- viewing current memberships
- adding memberships
- removing memberships
- creating a collection
- saving changes together

---

## 11. Collection Performance

Collection switching should feel immediate.

Implement:
- lightweight collection metadata cache
- no redundant full list refetch
- no full-page reload
- stable global shell
- destination title renders immediately
- cards can load after shell
- recently visited collection data cached where safe
- stale-while-revalidate where appropriate

Do not eagerly fetch every collection's complete contents.

---

## 12. Avoid Unnecessary Re-Renders

Keep stable:
- bottom navigation
- search
- global shell
- top navigation

Only collection-specific data should rerender on collection switch.

---

## 13. Right-Click Quick Add

Right-clicking empty/neutral page space should open a custom quick-add context menu.

It must expose the same applicable actions as the existing `+` button.

Both entry points must use the same underlying commands.

Requirements:
- open at pointer position
- stay within viewport
- Escape closes
- click outside closes
- keyboard navigation
- support `Shift+F10` where practical

Do not override browser context menus for:
- text fields
- text selection
- useful links
- images where native actions matter
- forms
- object-specific menus

No sidebars or drawers.

---

## 14. Right-Click Action Parity

Whenever the `+` button changes, right-click quick-add must update automatically.

Do not maintain two separate action definitions.

Use one shared action registry/command source.

---

## 15. Background Correction

Use a darker CRT-like background.

Target:
- near-black granite-charcoal color
- smooth surface
- no visible texture
- no stone pattern
- no grain
- no scanlines
- subtle center illumination
- darker edges
- very faint cool cast
- background remains darker than cards and UI

Suggested:

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

The feeling should be a powered-on old cube CRT in a dark room.

---

## 16. Collection Operations Security

All collection operations must enforce authorization server-side.

Users must not be able to:
- add content to another user's private collection
- remove membership from resources they do not control
- enumerate another user's private collections
- discover private collection names via API errors

The extension picker lists only assignable collections for the authenticated user.

---

## 17. Optimistic UI

Use optimistic updates for:
- add membership
- remove membership
- Undo
- extension selection
- new collection creation

On failure:
- restore prior UI state
- show compact error
- preserve user input

---

## 18. Error States

Handle:
- failed collection load
- failed collection creation
- failed membership update
- deleted/stale collection
- stale card
- network failure

Example messages:
- `Couldn't load collections`
- `Couldn't create collection`
- `Couldn't update card`
- `Collection no longer exists`

---

## 19. Empty State

If user has no collections:

```text
No collections yet
+ Create new collection
```

The picker should never appear broken or blank.

---

## 20. Accessibility

Collection picker:
- keyboard navigable
- accessible selected state
- visible focus state

Badge popover:
- accessible collection name
- keyboard-accessible actions

Right-click menu:
- keyboard navigation
- Escape closes
- correct menu semantics

---

## 21. Completion Checklist

- [ ] cards support multiple collections
- [ ] multiple collection badges render correctly
- [ ] badge click opens popover
- [ ] Open collection works
- [ ] Remove from collection works
- [ ] Undo works
- [ ] extension lists current collections
- [ ] extension supports multiple collections
- [ ] extension can create collection inline
- [ ] created collection auto-selects
- [ ] card editing exposes memberships
- [ ] collection switching is materially faster
- [ ] no full-page reload between collections
- [ ] no redundant collection refetch loop
- [ ] right-click quick-add works
- [ ] quick-add matches `+` menu
- [ ] native context menus remain available where appropriate
- [ ] background uses darker CRT treatment
- [ ] all collection operations are authorization-protected
- [ ] no sidebars introduced

# Local Canvas tools

Each collection opens its own Canvas. Existing saved card positions and viewports migrate when the board first opens. New collection members receive an initial placement when the board opens again; removing a placement does not delete the library card or its collection memberships.

## Controls

- **Select** moves objects and exposes resize handles. Hold Shift, Control or Command for multiple selection. Select all and Clear selection support group editing. Image proportions are locked by default and can be unlocked.
- **Hand** pans; the zoom controls and **Fit board** help navigate. The viewport saves independently of object edits.
- **Add cards from library** supports search, click-to-add and drag-in at the current zoom. A card can appear more than once with independent placement geometry. Editing its content updates every reference.
- **Pen, Highlighter, Rectangle, Ellipse and Text** create annotations. Color, stroke size and opacity apply to new marks. Double-click text to edit it. Escape cancels a drawing gesture.
- **Draw on selected card** attaches annotations to that placement. They follow its position, size and rotation. A card edit displays a review notice; select an annotation to mark it reviewed or detach it. Review detection uses the card's update timestamp, so title-only edits also trigger it.
- **Rotate +15°** and **Reset rotation** apply to selected objects. **Connector** joins the visible handles of two objects; select its line to edit the label.
- **Eraser** removes annotations or connectors. Removing a card placement retains its attached annotations and connectors in **Hidden objects**, where restoring the placement restores them together. Trashed or missing source cards display placeholders.
- **Undo/Redo** keeps the last 50 edits in the current board session. Control/Command-Z, Shift-Z and Y are supported. Delete/Backspace removes selected objects. Reloading clears history while preserving saved content.

## Persistence and safeguards

IndexedDB version 5 stores documents, placements, elements and connectors separately. Placements contain card IDs, not copies of card content. Each completed gesture is one atomic transaction. A revision check rejects edits and Undo based on stale state from another tab; **Reload canvas** loads the latest board. Failed writes preserve committed data and show an error.

Per-board limits are 200 placements (including hidden placements), 500 annotations and 200 connectors. A stroke has at most 5,000 samples; text at most 20,000 characters. Geometry and references are validated before writes. Text renders as inert React text. Offscreen nodes are culled, and node measurements are batched to avoid repeated full-board redraws.

This implementation is local to the current browser. Canvas Drive synchronization, Canvas export/import, shared editing and server-side Canvas ownership endpoints remain pending. Real phone/stylus acceptance remains separate from desktop Chromium checks at mobile viewport sizes. The new generated Home logos still require accessible asset files.

## Verification

Run the app with `npm run dev`, then set `DUCKLER_PREVIEW_URL` to its local address before running:

- `npm run test:canvas:ui`: gallery layout, board isolation, positions, viewport and reload.
- `npm run test:canvas:tools`: drawing, text, attached marks, rotation, aspect-preserving resize, connectors, repeated references, group movement, zoomed library drop, recovery, Undo/Redo, two-tab stale Undo and mobile layout.
- `npm run test:canvas:capacity`: 200 placements, 500 mixed annotations and 200 connectors; overflow rejection, viewport culling, pan and fit. The October 4 local headless Chromium run opened the board in about 1.4 seconds; this is a fixture measurement, not a device performance guarantee.

Shared-domain and storage regression tests cover coordinate transforms, invalid geometry/references, lazy migration, repeated references, recovery, atomic rollback, revision conflicts and board cleanup.

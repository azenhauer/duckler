# Duckler — Micro-Animation Specification

## 1. Scope

This document defines **small interface animations only** for the Duckler Sony / PlayStation-era reskin.

The animation pass must preserve:
- all existing navigation structures
- all existing navigation placements
- current page layouts
- current card positions
- current collection tabs
- current bottom navigation
- current settings navigation
- existing interaction flow

### Hard restriction: no sidebars

**Do not add sidebars anywhere.**

Do not create:
- left navigation rails
- right utility rails
- collapsible drawers
- persistent side menus
- replacement navigation panels
- console-style side navigation
- hidden hamburger drawers that replace current navigation

Duckler should continue using its existing navigation patterns, especially:
- the current floating bottom navigation
- the current collection top navigation
- the current search placement
- the current settings structure

Any sidebar that appeared in earlier concept art was visual exploration only and must not be implemented.

---

## 2. Motion Direction

The motion language should feel like:
- early-2000s Sony / PlayStation system UI
- precise
- restrained
- slightly mechanical
- smooth without feeling soft
- responsive
- quiet
- technical

Avoid:
- spring physics
- elastic bounce
- large zooms
- exaggerated blur
- card popping
- mobile-app-style overshoot
- constant ambient motion
- decorative loops that compete with content

---

## 3. Timing System

Recommended durations:

- Instant feedback: `80–120ms`
- Hover transitions: `120–160ms`
- Small menus / toolbars: `140–180ms`
- Selection changes: `160–220ms`
- Page-level transitions: `180–260ms`
- Modal / settings transitions: `200–280ms`

Recommended easing:

```css
--ease-fast: cubic-bezier(0.2, 0.7, 0.2, 1);
--ease-standard: cubic-bezier(0.22, 0.61, 0.36, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

Motion should finish quickly enough that the app always feels immediate.

---

## 4. Bottom Navigation

Keep the current bottom navigation exactly where it is.

### Hover
On hover:
- icon brightness increases slightly
- label opacity increases
- panel beneath the hovered item gains a tiny translucent lift
- optional 1–2px upward translation

Duration: `120–150ms`

### Active item
When changing active section:
- active indicator fades/slides to the new item
- icon gains a subtle icy rim light
- label brightens
- no bounce
- no scaling above `1.02`

Duration: `160–200ms`

### Duckler icon
The Duckler logo can gain:
- a very subtle edge glow
- slight luminosity increase
- no pulsing loop

---

## 5. Top Navigation / Collection Tabs

Preserve:
- All items
- Images
- Links
- Notes

### Tab hover
- text brightens
- underline or technical indicator fades in
- optional 1px horizontal extension

### Tab selection
- active underline slides or redraws
- old tab fades to muted state
- new tab brightens

Duration: `140–180ms`

The animation should resemble a console menu selector moving cleanly between options.

---

## 6. Card Hover

Cards should remain visually stable.

On hover:
- border becomes slightly brighter
- surface translucency increases very slightly
- image may gain `1–2%` brightness
- card can translate upward by `1–2px`
- no large scale-up

Duration: `130–160ms`

---

## 7. Card Selection

Selected cards use the angled technical selection frame defined in the reskin spec.

### Selection animation
When selected:
1. frame fades in
2. corner marks appear with a short line-draw effect
3. selection glow settles quickly

Duration: `160–220ms`

Recommended implementation:
- opacity
- `clip-path`
- pseudo-elements
- short SVG stroke animation if already using SVG

Avoid tracing the entire frame slowly.

---

## 8. Floating Card Actions

Edit / Move / Delete controls appear **above the selected card**.

### Appearance
Toolbar should:
- fade in
- translate upward from `4–6px` below final position
- optionally reveal its border from left to right

Duration: `140–180ms`

### Disappearance
- opacity fades first
- translate down `2–4px`

Duration: `100–140ms`

The toolbar should feel attached to the card without covering its content.

---

## 9. Edit Action

When Edit is chosen:
- editing fields fade in
- static labels fade to editable versions
- selected field gains a slight line glow

Duration: `140–180ms`

Do not animate the whole card into a different size unless required by current layout.

---

## 10. Move Action

For moving cards:
- selected card becomes slightly translucent
- selection frame stays visible
- target area gets a faint schematic outline
- card follows pointer directly

On drop:
- position settles in `100–160ms`
- neighboring cards shift smoothly

No spring-back animation.

---

## 11. Delete Action

On delete:
- card fades to `0`
- brightness drops slightly
- height/space collapses immediately after the fade
- surrounding cards reposition smoothly

Duration: `160–220ms`

Optional:
- tiny red PlayStation-color status mark can flash once before removal

Do not use shaking or dramatic warning animations.

---

## 12. Search

### Focus
When search receives focus:
- border brightens
- a low-opacity edge glow appears
- placeholder shifts to normal focused state
- search icon gains slightly more contrast

Duration: `120–160ms`

### Results
If live results update:
- use a short crossfade
- avoid moving the page unnecessarily

---

## 13. Inputs

For text inputs, tags, and settings controls:

### Focus
- border opacity rises
- subtle internal highlight appears

### Validation
Success:
- small green/cyan state mark fades in

Error:
- small red state mark appears
- no shake animation

Duration: `120–180ms`

---

## 14. Tags

Adding a tag:
- chip fades in
- translates `3–4px`
- no bounce

Removing:
- opacity fades
- width collapses after fade

Duration: `120–160ms`

---

## 15. Capture Extension

Keep the current extension structure.

### Link / Highlight / Note switching
- active indicator slides between modes
- content crossfades
- no full-panel movement

Duration: `140–180ms`

### Save
On save:
1. button brightness increases briefly
2. label can change to `Saved`
3. small success indicator appears
4. returns to normal resting state

Total: `300–500ms`

Avoid a large celebratory animation.

---

## 16. Settings

Keep the current settings navigation and structure.

### Section changes
Use:
- content crossfade
- optional `4–8px` horizontal shift
- same panel position

Duration: `180–220ms`

### Appearance controls
Color changes should update the live preview continuously.

When choosing a preset:
- theme variables interpolate over `180–260ms`
- avoid flashing from one palette to another

---

## 17. Appearance Theme Transition

When a user changes theme colors:
- background
- surface
- border
- text
- accents
- selection color

should transition smoothly.

Recommended:

```css
transition:
  background-color 220ms var(--ease-standard),
  border-color 180ms var(--ease-standard),
  color 160ms var(--ease-standard),
  box-shadow 180ms var(--ease-standard);
```

Do not animate heavy blur or large backdrop-filter changes.

---

## 18. Canvas

Keep the existing canvas navigation and interaction model.

### Node selection
- angled frame fades in
- connector endpoints brighten slightly

### Connector creation
- line follows pointer directly
- on connection, line opacity settles smoothly

### Object move
- direct tracking while dragging
- tiny settle on drop

No elastic connectors.

---

## 19. Modals / Dialogs

If current app behavior uses dialogs:

Opening:
- opacity `0 → 1`
- translate `6–10px → 0`

Closing:
- opacity `1 → 0`
- translate `0 → 4px`

Duration: `180–220ms`

Do not scale the modal dramatically.

---

## 20. Loading States

Prefer understated loading feedback:
- tiny rotating or scanning indicator
- thin progress line
- three-dot technical status
- small luminosity sweep

Avoid:
- skeleton shimmer across the entire interface
- large spinners
- heavy glowing animation

---

## 21. Status Animation

For statuses such as:
- Saved
- Synced
- Pending
- Error

Use:
- tiny dot
- small icon
- short opacity transition

For pending:
- slow two-state luminosity change is acceptable

Keep loops subtle and sparse.

---

## 22. Background Motion

Default: **static**.

Optional:
- almost imperceptible grain drift
- subtle scanline movement
- very slow background noise variation

If used:
- opacity under `3%`
- duration above `8s`
- no obvious looping pattern

The UI must still look intentional in a screenshot.

---

## 23. Reduced Motion

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

When enabled:
- remove translations
- remove line-draw effects
- remove ambient animation
- use short opacity fades only
- keep interaction feedback clear

---

## 24. Performance

Prefer:
- `opacity`
- `transform`
- lightweight SVG strokes
- CSS variables

Avoid frequently animating:
- `filter: blur()`
- large `box-shadow`
- `backdrop-filter`
- layout-heavy properties

The app should remain smooth on weak hardware.

---

## 25. Implementation Rule

Every animation must answer one of these purposes:
- show selection
- reveal an action
- communicate state
- explain movement
- soften a page transition

If it serves none of these purposes, remove it.

The target is **Sony/PlayStation-era precision in motion**, with the existing Duckler interface kept intact.

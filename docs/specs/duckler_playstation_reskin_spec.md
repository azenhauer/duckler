# Duckler — Sony / PlayStation-Era Reskin Specification

## 1. Scope

This redesign is a **visual reskin and typography update** of the existing Duckler app.

### Preserve
- Existing information architecture
- Existing navigation structure
- Existing page hierarchy
- Existing element placement
- Existing route behavior
- Existing bottom navigation
- Existing collection navigation
- Existing search placement
- Existing collection tabs: **All items / Images / Links / Notes**
- Existing app logo silhouette and identity

The redesign must **not introduce new sidebars, alternative navigation systems, or major layout restructuring**.

---

## 2. Visual Direction

Reference period: **late-1990s to early-2000s Sony / PlayStation / PS2 industrial and interface design**.

The target should feel like:
- a Sony device interface from around 1999–2004
- technical documentation translated into a usable digital product
- PS2 hardware diagrams and system menus
- restrained Y2K futurism
- light industrial grunge
- translucent plastic and smoked acrylic
- precise, technical, slightly alien

Avoid:
- modern SaaS styling
- Apple / Aqua visual language
- excessive rounded glass cards
- neon cyberpunk
- heavy blue saturation everywhere
- large decorative gradients
- rainbow corner accents
- crowded HUD borders

---

## 3. Core Palette

Use an almost-black / graphite base.

Suggested base tones:
- Background: `#0B0D0F`
- Raised surface: `#14181C`
- Secondary surface: `#1A1F24`
- Fine border / technical line: `rgba(155, 190, 210, 0.18)`
- Stronger active line: `rgba(170, 210, 230, 0.42)`
- Primary text: `#E8EBED`
- Secondary text: `#A8B0B7`
- Muted text: `#69727A`

### Accent Colors

Use the original PlayStation-logo family sparingly:
- Red
- Yellow
- Green / cyan
- Blue

Accent colors should appear mainly in:
- tiny state markers
- selection details
- status dots
- small metadata cues
- rare active-line fragments

Do not use full rainbow borders.

---

## 4. Transparency

All major surfaces should be **slightly translucent**.

Target:
- Main panels: ~92–96% opacity
- Floating controls: ~88–94%
- Hover toolbars: ~88–92%
- Chips / pills: ~85–92%

Use subtle backdrop blur only where supported.

The interface should remain dark and legible.

---

## 5. Technical Line Language

Borrow from PS2 hardware manuals and controller diagrams.

Use:
- thin schematic lines
- small corner ticks
- crosshair-style points
- compact angle marks
- sparse grid fragments
- occasional route/connector lines
- tiny technical labels

### Contrast rule

Technical lines should sit **behind the content**.

Preferred opacity:
- ambient grid: 4–8%
- diagram lines: 10–18%
- structural frames: 16–24%
- active selection: 35–55%

They should never compete with thumbnails, text, or navigation.

---

## 6. Grunge / Material Treatment

Use restrained texture:
- faint CRT grain
- subtle scanline noise
- very light paper/scanner abrasion
- minute dust / film grain
- slight analog imperfection

Recommended opacity: **2–6%**.

Grunge should make the interface feel physical and era-specific while preserving clarity.

---

## 7. Typography

Typography should shift toward early PlayStation / Sony technical design.

### Display / headings
Use a compact techno-geometric sans with squared forms where practical.

Characteristics:
- medium weight
- slightly condensed
- controlled tracking
- strong vertical rhythm

### Interface text
Use a clean, readable grotesk or technical sans.

### Micro labels
- uppercase
- 10–12px
- generous tracking
- compact wording

Examples:
`ALL ITEMS`
`IMAGES`
`LINKS`
`NOTES`
`CAPTURE`
`SYSTEM`
`LIBRARY`

Avoid oversized modern hero typography inside functional screens.

---

## 8. Duckler Logo

Preserve the current Duckler silhouette.

The logo treatment should match the main **Collections** and **Canvas** icon family:
- translucent frosted material
- pale icy blue / silver
- subtle internal depth
- soft luminous edge
- minimal glow
- clean silhouette
- no construction lines
- no grid inside the logo
- no background cube
- no surrounding frame

The logo should remain recognizable at small navigation sizes.

---

## 9. Icon System

Create a unified icon family for:
- Duckler / Home
- Collections
- Canvas
- Search
- Settings
- Link
- Highlight
- Note
- Edit
- Move
- Delete
- Add
- Grid view
- List view
- Sort
- Tag
- Archive
- Profile

### Icon visual style
- frosted translucent material
- pale silver-blue body
- gentle internal gradient
- thin bright edge
- slightly dimensional, like molded translucent plastic
- minimal external glow
- no glass cube around the icon
- no decorative background plate unless the existing UI already has one
- silhouettes should remain readable at 16–32px

---

## 10. Navigation

### Bottom Navigation

**Keep the current bottom navigation exactly as structured and positioned.**

Preserve:
- Duckler / Home
- Collections
- Canvas
- Profile

Allowed changes:
- typography
- material treatment
- icon treatment
- active state
- subtle translucency
- small PlayStation-color accent details

Do not replace it with a sidebar or console-style rail.

### Collection Navigation

Preserve the existing collection-page structure:
- collection title
- item count / dropdown / overflow
- `All items`
- `Images`
- `Links`
- `Notes`

This remains a top navigation system.

Restyle it visually while preserving its hierarchy and placement.

---

## 11. Top Menus

Where the app already has top-level tools, style them like a console/device interface.

Characteristics:
- textual or icon-led
- no oversized button shells
- thin separators
- subtle active underline or indicator
- compact spacing
- Sublime-like quietness
- translucent surface where needed

The result should feel like a system menu rather than a modern dashboard toolbar.

---

## 12. Cards

Preserve existing card size and placement.

Card changes:
- slightly translucent charcoal surface
- low-contrast border
- subtle grain
- image remains the strongest visual element
- metadata stays quiet
- corner radius may become slightly firmer / less soft

Avoid heavy chrome framing.

---

## 13. Card Hover / Selection

### Hover actions

Editing controls should **float above the selected card**, not sit permanently on the card.

Include:
- Edit
- Move
- Delete

Toolbar treatment:
- compact
- translucent
- slightly angular
- thin schematic border
- icon-first
- appears on hover / selection

### Selection frame

Selected cards should use a **slightly angled / skewed outline**.

Characteristics:
- asymmetrical technical frame
- clipped or offset corners
- one or two small corner ticks
- low-to-medium glow
- occasional PlayStation-color detail
- same visual language as the technical schematic system

The frame should feel engineered, not ornamental.

---

## 14. Search

Keep the current search field placement.

Reskin:
- darker smoked-translucent body
- thin cool-gray border
- pale silver/blue search icon
- low-intensity focus glow
- slightly technical typography

Avoid glossy modern pill styling.

---

## 15. Inputs and Controls

Inputs should feel like recessed device controls.

Use:
- dark semi-transparent body
- thin technical border
- minimal bevel
- tiny active highlight
- compact labels

Buttons should avoid modern large rounded CTA styling.

Primary actions can use:
- subtle silver-blue fill
- thin bright rim
- tiny PlayStation-color accent
- short labels

---

## 16. Capture Extension

Keep the current structure:
- logo / settings
- Capture / Pending
- Link / Highlight / Note
- note input
- tags
- save action
- status

Reskin it using:
- same typography
- same translucent material
- same technical lines
- same icon family
- same quiet PlayStation-color accents

It should feel like a miniature detachable part of the desktop app.

---

## 17. Settings

Keep the existing settings structure and content placement.

Visual changes:
- reduce rounded modern-card feeling
- use smoked translucent surfaces
- firmer corner geometry
- technical micro-labels
- thin diagram-style divisions
- subtle grain
- same icon system

---


## 17A. Website Appearance Settings

Add a dedicated **Appearance** area inside Settings so each user can personalize the visual theme without changing the app structure.

### Placement
Keep the existing Settings navigation and add or use an **Appearance** section within it.

### User-editable appearance controls
Allow users to modify:

- Background color
- Surface / panel color
- Primary text color
- Secondary text color
- Border / technical-line color
- Primary accent color
- Secondary accent color
- Selection / focus color
- Optional glow color

### Presets
Include a small preset selector above the custom controls.

Suggested presets:
- **Duckler / PlayStation** — default Sony-inspired reskin
- **Graphite**
- **PS Blue**
- **Warm CRT**
- **Custom**

Presets should update the controls below while remaining editable afterward.

### Color controls
Use compact color swatches plus hex input fields.

Each row should contain:
- color name
- current swatch
- editable hex value
- reset-to-default action

Avoid oversized native color-picker UI. Clicking a swatch may open the browser color picker or a compact custom picker.

### Live preview
Changes should preview immediately across the website.

Include a small preview area showing:
- background
- card
- text
- active navigation state
- selected card outline
- one accent marker

### Reset behavior
Provide:
- **Reset current color**
- **Reset appearance to preset**
- **Restore Duckler defaults**

Reset actions should require confirmation only when they affect the entire appearance configuration.

### Persistence
Appearance settings should be stored per user and synchronized with that user's account where account synchronization is available.

Do not affect another user's theme.

### Theme token model
Implement appearance customization using CSS variables / design tokens rather than component-specific hardcoded colors.

Recommended variables:

```css
--ui-bg
--ui-surface
--ui-surface-alt
--ui-text
--ui-text-muted
--ui-line
--ui-accent-primary
--ui-accent-secondary
--ui-selection
--ui-glow
```

All reskinned components should consume these tokens.

### Guardrails
- Preserve readable text contrast.
- Warn or gently correct values that make critical UI unreadable.
- Keep grunge, translucency, and typography independent from user color customization.
- Navigation placement, card layout, icon placement, and interaction patterns remain unchanged.
- The default theme remains the Sony / PlayStation-era Duckler appearance defined in this specification.


## 18. Canvas

Keep the existing canvas interaction model and placement.

Visual treatment:
- very dark work surface
- faint low-opacity technical grid
- connectors styled like schematic wiring
- selected objects use the angled frame system
- floating controls use the same hover-toolbar language
- PlayStation colors may distinguish connector/state types

---

## 19. Motion

Motion should feel deliberate and console-like.

Use:
- 140–220ms fades
- slight sliding transitions
- opacity + small translation
- restrained glow ramp
- hover controls appearing cleanly above cards

Avoid:
- springy motion
- elastic bouncing
- exaggerated scaling

---

## 20. Implementation Guardrails

1. Reskin first; restructure only when explicitly requested.
2. Preserve all current navigation.
3. Preserve spacing relationships unless a visual bug requires correction.
4. Keep content more prominent than decorative styling.
5. Technical lines are background texture, not containers for everything.
6. Use PlayStation-logo colors as accents rather than the base theme.
7. Keep the Duckler logo unchanged in silhouette.
8. Apply translucency consistently.
9. Keep grunge subtle.
10. Every new visual treatment must remain readable at small sizes.

---

## 21. Target Feeling

**“A personal visual knowledge tool designed by Sony’s early-2000s interface and industrial-design teams.”**

Dark, precise, slightly translucent, mildly worn, technical, restrained, tactile, and futuristic in the specific way the year 2000 imagined the future.

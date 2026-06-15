# PropsKit reference

PropsKit is the V1 GenTools control system. Every tool's UI uses PropsKit-styled controls that feel native to Figma's right properties panel.

**In this workspace, PropsKit is implemented with [FigUI3](https://rog.ie/figui3) web components** (`@rogieking/figui3`), not hand-rolled HTML classes. Read **`docs/08-figui3-ui.md`** for bundling, init, panel layout, and **`docs/08-figui3-ui.md > Bundled component catalog`** for every tag shipped in `src/vendor/fig.js`. The canonical live control reference is the **[FigUI3 Playground](https://rog.ie/figui3)**. Agents: **`.cursor/skills/figui3-catalog/SKILL.md`** for control selection.

The working UI shell is `scaffold/src/ui.template.html`. Generated runs edit `template/src/ui.template.html`, run `npm run bundle-ui`, and never hand-edit `ui.html`.

## Visual language

PropsKit controls are:

- **Stacked vertically** with **fixed left-aligned labels** (~⅓ label, ~⅔ control via `fig-field columns="thirds"`)
- **Compact.** Each row is **32px** tall (`py-4`, `px-16`)
- **Sectioned.** Sentence-case titles in `<fig-header borderless>`, separated by inset dividers between `<fig-group>` blocks
- **Quiet by default.** Borders appear on hover and focus — handled by FigUI3
- **240px panel width** in `figma.showUI`

Do not introduce shadcn, MUI, Tailwind, or any other component library.

## Allowed control types (V1)

Use FigUI3 web components. Examples below. For full attributes and events, see [rog.ie/figui3](https://rog.ie/figui3).

### Number input

For unbounded or precise numeric values. Examples: card count, padding, item count.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="count">Count</label>
  <fig-input-number id="count" value="6" min="1" max="100" steppers="true"></fig-input-number>
</fig-field>
```

### Slider

For bounded continuous or stepped values. Examples: density, blur, opacity. Commits on `change` (release), not during drag.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="density">Density</label>
  <fig-slider id="density" variant="neue" value="50" min="0" max="100" text="true" units="%" full></fig-slider>
</fig-field>
```

**Always set `variant="neue"`** — it's the PropsKit / GenTool slider style (matches the slider used inside Figma's native color picker). Without it you get the looser FigUI3 default that doesn't match the rest of the panel.

Optional units: `units="px"`.

### Switch (toggle)

Boolean. Examples: show today line, lock points.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="showToday">Show today</label>
  <fig-switch id="showToday" checked></fig-switch>
</fig-field>
```

### Dropdown

Pick one from a finite enumerated set. Examples: layout mode, theme, content mode.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="layout">Layout</label>
  <fig-dropdown id="layout" value="grid">
    <option value="grid">Grid</option>
    <option value="scroll">Horizontal scroll</option>
    <option value="list">Vertical list</option>
  </fig-dropdown>
</fig-field>
```

Segmented controls are **cut from V1**. Always use dropdown for enumerated values.

### Color picker

Single color. **Always** set `text="true"`, `alpha="true"`, and `picker="figma"` — FigUI3 defaults (`text="false"`, `alpha="false"`, `picker="native"`) produce a minimal swatch with a stripped-down popover (missing hex row, opacity slider, and picker footer labels).

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="accent">Accent</label>
  <fig-input-color id="accent" value="#0D99FF" text="true" alpha="true" picker="figma"></fig-input-color>
</fig-field>
```

**CSS + JS:** The reset scaffold (`scaffold/src/ui.template.html`) ships the required `dialog.fig-fill-picker-dialog` overrides and popover resize wiring. **Preserve that block** when you overwrite `ui.template.html` — do not drop it or replace it with one-off fixes. Full rationale and checklist: **`docs/08-figui3-ui.md > Color picker`**.

**Do not:** add `min-width` on `.fig-fill-picker-input-mode`, set `width: 100%` on the mode dropdown, or omit the dialog width override.

### Gradient picker

Multi-stop gradient. If full gradient UI is too much, fall back to two `<fig-input-color>` fields labeled "From" and "To" plus a direction dropdown.

### Palette picker

Set of colors. Examples: custom theme palettes.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="palette">Palette</label>
  <fig-input-palette
    id="palette"
    value='["#FFFFFF","#0D99FF","#E8F4FD","#1E1E1E"]'
    min="4"
    max="4"
    fixed="true"
  ></fig-input-palette>
</fig-field>
```

### Text input

Single-line string. Examples: name, label.

```html
<fig-field direction="horizontal" columns="thirds">
  <label for="name">Name</label>
  <fig-input-text id="name" value="Q1 Roadmap"></fig-input-text>
</fig-field>
```

Multiline (CSV, long paste):

```html
<fig-input-text id="csvData" multiline="true" placeholder="artist,stage,time"></fig-input-text>
```

Commit on `change` (blur), same as single-line.

### Tabs (input mode switch)

Use **`fig-tabs`** + **`fig-tab`** when one section needs two input surfaces (e.g. paste vs upload). This is **not** a multi-step wizard — stay on one screen with one footer.

```html
<fig-tabs id="dataTabs" value="paste">
  <fig-tab value="paste" content="#panelPaste" selected>Paste</fig-tab>
  <fig-tab value="upload" content="#panelUpload">Upload</fig-tab>
</fig-tabs>
```

Each `fig-tab` uses `content="#elementId"` to show/hide its panel. Persist `fig-tabs` `value` in tool state.

### File upload

Use **`fig-input-file`** — not a hidden `<input type="file">` plus `fig-button`.

```html
<fig-input-file id="csvFile" accepts=".csv,text/csv,text/plain" label="Choose CSV file"></fig-input-file>
```

On `change`, read `element.files[0]` and load into the same state field as pasted text. Restore display name with `filename="…"` when rehydrating.

### Image chooser (thumbnail grid)

```html
<fig-chooser id="imageChooser" choice-element="fig-choice"></fig-chooser>
```

Populate with `<fig-choice value="id">` children (often `<img>` inside). See `plugins/artist-lineup-cards`.

### XYZ / Vector2 positional

Side-by-side number inputs in one field row:

```html
<fig-field direction="horizontal" columns="thirds">
  <label>Position</label>
  <div style="display:flex;gap:var(--spacer-2);flex:1">
    <fig-input-number value="0" placeholder="X" steppers="true"></fig-input-number>
    <fig-input-number value="0" placeholder="Y" steppers="true"></fig-input-number>
  </div>
</fig-field>
```

### On-canvas handles

Use only when the tool genuinely benefits from spatial editing. Out of scope for most tools — skip unless the prompt specifically asks for spatial interaction.

## Layout patterns

### Section groups (default for 4+ controls)

Use `<fig-group>` with `<fig-header borderless><h3>Section</h3></fig-header>`. Copy the spacing override CSS from `docs/08-figui3-ui.md`.

```html
<fig-group>
  <fig-header borderless><h3>Layout</h3></fig-header>
  <fig-field direction="horizontal" columns="thirds">
    <label for="density">Density</label>
    <fig-slider id="density" value="50" min="0" max="100" text="true" units="%" full></fig-slider>
  </fig-field>
</fig-group>

<fig-group>
  <fig-header borderless><h3>Theme</h3></fig-header>
  <!-- more fields -->
</fig-group>

<fig-footer borderless>
  <div class="footer-actions">
    <fig-button id="run" variant="primary">Generate</fig-button>
  </div>
</fig-footer>
```

### Single group (small tools, ≤3 controls)

One `<fig-group>` with no section header is fine for very simple tools.

### Horizontal group

Use when two or more controls form a single semantic unit (min/max, x/y). Wrap controls in a flex container inside `<fig-field>`.

## Commit behavior (set-then-regen)

Bind **`change`** on FigUI3 components:

- **Slider (`fig-slider`):** release, not drag
- **Number (`fig-input-number`):** blur or Enter
- **Text (`fig-input-text`):** blur
- **Dropdown (`fig-dropdown`):** selection change
- **Switch (`fig-switch`):** toggle
- **Color / palette:** picker close

This is non-negotiable. V1 GenTools does not live-update during interaction.

**Generators:** bind `change` → `fireRegenerate()`, which posts `regenerate` only when `outputSelected` is true. Footer **Generate** always posts `{ type: 'generate' }`. See `docs/07-plugin-practices.md > Output targeting`.

## Avoid in V1 (GenTool comparison defaults)

- **Segmented controls** — default to `fig-dropdown` for enums (`fig-segmented-control` is bundled; use only when the prompt asks)
- **Multi-step wizards** — one screen, one footer
- **Settings panels with many tabs** — at most one `fig-tabs` row **inside a section** for input mode (paste/upload), not navigation across the whole tool
- **Modals** — use `figma.notify`; do not add `fig-dialog` flows to GenTool panels
- **Conditional visibility** — prefer flattening; `.collapsible` is OK for one dependent row
- **Hidden labels** — every `fig-field` row has a left-aligned label
- **DIY controls** — no styled `fig-button` pairs for tabs, no raw file inputs when `fig-input-file` fits
- **Raw HTML `.propskit-*` classes** in new tools (legacy reference examples only)

## Quick reference: which control for which job

| Need | FigUI3 component |
|---|---|
| Pick a count | `fig-input-number` |
| Pick from a continuous range | `fig-slider` (in `fig-field`, `variant="neue"`) |
| Yes/no | `fig-switch` |
| Pick one of a few options | `fig-dropdown` (default) or `fig-segmented-control` if prompted |
| Pick a single color | `fig-input-color` |
| Pick a multi-color blend | `fig-input-gradient` or fallback colors |
| Pick a color set | `fig-input-palette` |
| Free-form text | `fig-input-text` |
| Long paste / CSV | `fig-input-text` with `multiline="true"` |
| Paste vs upload in one section | `fig-tabs` + `fig-tab` |
| Upload a file | `fig-input-file` |
| Pick from image thumbnails | `fig-chooser` + `fig-choice` |
| 2D/3D position | paired `fig-input-number` or `fig-joystick` |
| Primary / secondary action | `fig-button` in `fig-footer` |
| Full tag list | `docs/08-figui3-ui.md > Bundled component catalog` |
| Drag something on canvas | on-canvas handle (rare) |

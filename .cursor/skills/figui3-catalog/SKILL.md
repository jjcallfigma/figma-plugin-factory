---
name: figui3-catalog
description: Pick the right FigUI3 web component when building or reviewing GenTool-style plugin UI (template/ or plugins/<slug>/). Use when choosing controls, adding tabs/file upload/choosers, verifying a tag exists in the bundle, or avoiding hand-rolled HTML that duplicates FigUI3.
---

# FigUI3 component catalog (this workspace)

## When to load

- Building or editing `{pluginRoot}/src/ui.template.html`
- Unsure which FigUI3 tag to use (tabs, upload, multiline text, image grid, etc.)
- Need to verify a component is registered in the **bundled** `fig.js` (not just listed on rog.ie)
- Reviewing UI that uses raw `<button>` / custom tab CSS instead of FigUI3

## Source of truth (in order)

1. **`docs/08-figui3-ui.md > Bundled component catalog`** — full inventory for `@rogieking/figui3` copied into `{pluginRoot}/src/vendor/`
2. **`docs/02-propskit-reference.md`** — GenTool defaults, commit-fire, recipes
3. **[FigUI3 Playground](https://rog.ie/figui3)** — live attrs/events for edge cases
4. **`color-picker-ui` skill** — when the tool uses `<fig-input-color>`

## List what is actually bundled

From `{pluginRoot}` after `npm install`:

```bash
node -e "const j=require('fs').readFileSync('src/vendor/fig.js','utf8');const r=/customElements\\.define\\(['\\\"](fig-[^'\\\"]+)['\\\"]/g;const s=new Set();let m;while((m=r.exec(j)))s.add(m[1]);console.log([...s].sort().join('\\n'))"
```

**Do not** wait on tags that fail this check (e.g. `fig-field-slider` is not registered — use `fig-field` + `fig-slider`).

## Default GenTool controls (Tier A)

| Need | Component |
|---|---|
| Section shell | `fig-group`, `fig-header`, `fig-footer`, `fig-field` |
| Number | `fig-input-number` |
| Slider | `fig-slider` (`variant="neue"`) |
| Boolean | `fig-switch` |
| Enum | `fig-dropdown` + `<option>` |
| Text | `fig-input-text` |
| Color | `fig-input-color` (`text alpha picker="figma"`) — see **color-picker-ui** skill |
| Palette | `fig-input-palette` |
| Primary/secondary action | `fig-button` in `footer-actions` |

## Common extensions (Tier B — use native FigUI3, not DIY)

| Need | Component | Notes |
|---|---|---|
| Paste vs upload (same section) | `fig-tabs` + `fig-tab` | `content="#panelId"` on each tab; set `fig-tabs` `value` for restore |
| CSV / file pick | `fig-input-file` | `accepts`, `label`; read `element.files[0]` on `change` |
| Multiline text | `fig-input-text` | `multiline="true"` |
| Image thumbnail grid | `fig-chooser` + `fig-choice` | See `plugins/artist-lineup-cards` |

### Tabs recipe

```html
<fig-tabs id="modeTabs" value="paste">
  <fig-tab value="paste" content="#panelPaste" selected>Paste</fig-tab>
  <fig-tab value="upload" content="#panelUpload">Upload</fig-tab>
</fig-tabs>
<div id="panelPaste">…</div>
<div id="panelUpload">…</div>
```

Init: `customElements.whenDefined('fig-tabs')`, `whenDefined('fig-tab')`. Tab switch alone does not commit-fire regenerate.

### File upload recipe

```html
<fig-input-file id="csvFile" accepts=".csv,text/csv,text/plain" label="Choose CSV file"></fig-input-file>
```

```js
document.getElementById('csvFile').addEventListener('change', function () {
  var file = document.getElementById('csvFile').files[0];
  // FileReader → shared state → fireRegenerate() if outputSelected
});
```

Restore filename without a live `File`: `filename="lineup.csv"` attribute.

## GenTool comparison defaults vs FigUI3 surface

| Pattern | GenTool comparison default | FigUI3 alternative |
|---|---|---|
| Pick one of a few options | `fig-dropdown` | `fig-segmented-control` + `fig-segment` (bundled; use only when prompt asks) |
| Multi-step setup | Single screen | No wizard — at most **one** `fig-tabs` row inside a section for input mode |
| Modals | `figma.notify` | `dialog[is=fig-dialog]` exists in CSS/JS but avoid in V1 panels |

## What NOT to do

- Do not build tab bars from paired `fig-button` + custom CSS when `fig-tabs` / `fig-tab` fit
- Do not use hidden `<input type="file">` + secondary button when `fig-input-file` fits
- Do not use raw HTML `.propskit-*`, Tailwind, or MUI
- Do not hand-edit `ui.html` — edit `ui.template.html`, then **`npm run build`**

## After UI edits

Always run **`npm run build`** in `{pluginRoot}` as the last step. Tell the user to re-run the tool in Figma.

# Cursor briefing

You are inside a workspace built to fairly compare **Cursor + Claude building a Figma plugin** vs **Figma's Assistant building a GenTool**. Same prompt intent, two environments, side by side.

## Trigger phrase

When the user message **starts with** `Create a custom tool` (any casing), you are in **tool-generation mode**. Build a real Figma plugin in the **active plugin folder** that mimics the shape and feel of a GenTool. Follow everything below — do not ask clarifying questions unless the prompt contradicts itself.

This mirrors how the user starts prompts in the Figma Assistant environment. The opener is part of the test; the rest of the prompt describes the tool.

## Active plugin target

Resolve where to write **before** editing source files:

| `plugins/.active` | Write to | Figma manifest |
|---|---|---|
| Missing (comparison mode) | `template/src/` | `template/manifest.json` |
| `<slug>` (factory mode) | `plugins/<slug>/src/` | `plugins/<slug>/manifest.json` |

Check `plugins/.active` at generation time. Factory workflow: **`docs/11-plugin-factory.md`**. Human creates plugins with `npm run new-plugin -- <slug>` at repo root.

Throughout this file, **`{pluginRoot}`** means the resolved folder (`template/` or `plugins/<slug>/`). Only overwrite `{pluginRoot}/src/code.ts` and `{pluginRoot}/src/ui.template.html`. After generation, run **`npm run build`** once inside `{pluginRoot}` (agents do this; humans can use **`npm run dev`** during iterative work instead).

## Hot path before writing code

Read only the context needed to generate the tool:

1. **Resolve `{pluginRoot}`** — read `plugins/.active`; see **Active plugin target** above
2. **`.cursor/rules/00-philosophy.mdc`** — always-on contract
3. **`docs/09-plugin-structure-and-reset.md`** — files you may edit and reset flow
4. **Matching reference `code.ts`**:
   - `reference/01-generator-color-swatch/code.ts` for Generators
   - `reference/02-action-layer-renamer/code.ts` for Actions
5. **`scaffold/src/ui.template.html`** — UI shell, spacing CSS, auto-resize, color-picker wiring
6. **`docs/02-propskit-reference.md`** — default FigUI3 controls; **`docs/08-figui3-ui.md > Bundled component catalog`** for the full `fig.js` inventory (tabs, file upload, chooser, etc.)
7. **`docs/07-plugin-practices.md > Output targeting`** for Generators

Conditional reads only:

- **`docs/08-figui3-ui.md`** if FigUI3 rendering, panel spacing, auto-resize, or color picker behavior is unclear. For color controls, read **`> Color picker`**. For tabs, file upload, multiline, or choosers, read **`> Bundled component catalog`** or **`.cursor/skills/figui3-catalog/SKILL.md`**.
- **`docs/10-network-open-apis.md`** only when the prompt needs live public HTTP data.
- **`docs/03-figma-plugin-basics.md`**, **`docs/04-glossary.md`**, and **`docs/06-test-protocol.md`** are references, not required hot-path context.

The reference examples are the most important source for **sandbox logic** (`code.ts`). The scaffold is the most important source for **UI shell** (`ui.template.html`).

## Generation test workflow (human)

Before each fair comparison run:

```bash
cd template && npm run reset
```

Then open a **fresh chat** and paste the prompt. See **`docs/09-plugin-structure-and-reset.md`**. Do **not** delete `template/` or `node_modules/`.

## Plugin folder structure

Each plugin folder (`template/` or `plugins/<slug>/`) shares the same shape:

```
{pluginRoot}/
├── manifest.json           ← DO NOT TOUCH during generation (set at create / comparison import)
├── package.json            ← DO NOT TOUCH (FigUI3 + build/reset scripts)
├── tsconfig.json           ← DO NOT TOUCH
├── scripts/
│   ├── bundle-ui.mjs       ← DO NOT TOUCH
│   └── reset-template.mjs  ← DO NOT TOUCH
└── src/
    ├── code.ts             ← OVERWRITE each run
    ├── ui.template.html    ← OVERWRITE each run (UI source)
    ├── ui.html             ← GENERATED — do not edit by hand
    └── vendor/             ← FigUI3 copies (from npm install)

plugins/<slug>/             ← factory: one folder per real plugin (unique manifest)
template/                   ← comparison harness (single stable manifest)

scaffold/src/               ← committed empty starting point; copied by npm run reset
    ├── code.ts
    └── ui.template.html
```

`code.ts` ships near-empty except `figma.showUI` and an empty message handler. `ui.template.html` ships with FigUI3 placeholders and the canonical panel spacing CSS. You write the tool UI and logic from there.

## What you DO

1. **Identify the archetype** from the prompt:
   - Generator: produces output, has persistent controls, regenerates on every control change
   - Action: operates on selection, one-shot, no persistent state
2. **Read the matching reference `code.ts`** end to end. Note every practice.
3. **Read `scaffold/src/ui.template.html`** for UI shell patterns. Use `docs/08-figui3-ui.md` only when the scaffold or control behavior needs deeper explanation.
4. **Overwrite `{pluginRoot}/src/code.ts`** following the same pattern. Include every applicable practice from `docs/07-plugin-practices.md` (especially **Output targeting** — read `reference/01-generator-color-swatch/code.ts`):
   - For Generators: state types, `regenerate(state, 'create' | 'update')`, output targeting (`getSelectedToolFrame`, `outputSelected`, **create must not remove other outputs**), setPluginData, page + node `setRelaunchData`, selectionchange, figma.command handling, try/catch — see `docs/07-plugin-practices.md > Output targeting` and `reference/01-generator-color-swatch/code.ts`
   - If `toolState` stores node ids: `await figma.getNodeByIdAsync` only (`getNodeById` throws with template `documentAccess: "dynamic-page"`)
   - For Actions: selection handling, figma.notify, page-level `setRelaunchData` (discovery), optional node relaunch on affected layers, no persistent state
   - If the prompt needs live public data: `fetch` in `code.ts` per `docs/10-network-open-apis.md` (no API keys; do not edit manifest)
5. **Overwrite `{pluginRoot}/src/ui.template.html`** from the scaffold pattern — preserve the FigUI3 placeholders (`<!-- FIGUI3_CSS -->`, `<!-- FIGUI3_JS -->`), panel spacing CSS, color-picker CSS block, and **`measurePanelHeight` / `watchColorPickerDialog`**. Use **only** FigUI3 web components from `docs/02-propskit-reference.md`. If the tool uses `<fig-input-color>`, read **`docs/08-figui3-ui.md > Color picker`** and use `text="true" alpha="true" picker="figma"`.
6. **Run `npm run build`** inside `{pluginRoot}` to regenerate `ui.html` and `code.js` — **always as the last step** before you tell the user you're done (even after small UI or sandbox edits).
7. **Tell the user** to re-run the plugin in Figma (import `{pluginRoot}/manifest.json` once per plugin if factory mode). Figma does not hot-reload `ui.html`; a rebuild alone is not enough until they re-run the tool.

## What you DO NOT

- Do **not** touch `manifest.json`, `package.json`, `tsconfig.json`, or `scripts/bundle-ui.mjs`.
- Do **not** hand-edit `ui.html` — it is build output.
- Do **not** link external FigUI3 CSS/JS files — they must be inlined (the bundle step does this).
- Do **not** use ES module `import` for FigUI3 — use inlined `<script>` + `customElements.whenDefined`.
- Do **not** copy reference `ui.html` files wholesale — they use legacy PropsKit classes.
- Do **not** import from `reference/` at runtime. Reference files are studied, not linked.
- Do **not** introduce React, Tailwind, shadcn, or any UI library beyond FigUI3.
- Do **not** use forbidden words in any user-facing UI string (see `docs/04-glossary.md`).
- Do **not** ask the user to clarify the prompt unless it's internally contradictory. Make the call, note your assumption at the top of `code.ts` in a comment.

## The bar

- Plugin opens to controls only; **Generate** creates first output (Generators). Output within 2 seconds of that click.
- All controls are FigUI3 / PropsKit web components with correct panel spacing (240px, tight section headers).
- **Panel hugs content.** Auto-resize wired in both directions: `resize` message handled in `code.ts`, ResizeObserver + `scrollHeight` measurement in UI. No fixed heights. See `docs/08-figui3-ui.md > Auto-resize`.
- FigUI3 controls actually render (inlined bundle + `customElements.whenDefined` init).
- Commit-fire only. No live-drag updates. Control changes update the **selected tool output** only — do not stack new frames on every change.
- **Generate** adds a new output when no tool frame is selected; **never deletes** previous tool outputs on create. Update selected frame in place when one is selected.
- Default Generator footer: **Generate only**. No secondary footer buttons unless the prompt explicitly requests one and names its behavior.
- State persists on the output node via `setPluginData` (Generators).
- Stored node ids resolved with `getNodeByIdAsync`, not `getNodeById` (template uses `dynamic-page` access).
- Public open APIs allowed via pre-wired `networkAccess: ["*"]`; no API keys in UI (`docs/10-network-open-apis.md`).
- Page-level relaunch on `figma.currentPage` at startup; node-level relaunch on outputs / affected layers when applicable (both archetypes).
- `figma.command` handled at startup (both archetypes).
- Output looks intentional, not wireframe grey placeholder.
- No forbidden words anywhere a user can see.
- If the tool uses `<fig-input-color>`: `text="true" alpha="true" picker="figma"`, color-picker CSS block preserved, popover resize JS preserved (see `docs/08-figui3-ui.md > Color picker`).

## Figma MCP

If the user has Figma's MCP connected in Cursor, you can call it for reference designs or design system tokens. Use sparingly. The GenTool panel layout reference is [Generative tools effects](https://staging.figma.com/design/ChG6473qlBtfrv8VYx1jaR/Generative-tools-effects?node-id=17850-75051).

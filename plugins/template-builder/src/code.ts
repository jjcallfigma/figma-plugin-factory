/**
 * Tool: Template Lab
 * Does: Author reusable templates by clicking layers on a root design and binding
 *       them to friendly controls, then let teammates generate safe variations.
 * Archetype: Hybrid — Creation Mode maps controls onto a root, Use Mode renders a
 *       dynamic form and generates copies. Output is a real auto-layout container.
 *
 * Assumptions:
 *  - Templates are stored in figma.clientStorage (prompt requests local, fast,
 *    cross-session persistence). This is the template registry, not per-output state.
 *  - Robustness comes from relative child-index paths from the root to each mapped
 *    layer, so renaming / cloning never breaks a mapping.
 *  - Generation clones the original root (preserving instances — never detach) and
 *    walks the same index path on each clone to apply values.
 *  - "Variant" mapping expands to one dropdown per variant property on that instance.
 *  - Sample content is fabricated for text/long text/color/show-hide/variant only;
 *    image fields are left untouched (cannot synthesize image bytes).
 */

const TOOL_ID = 'template-lab';
const STORAGE_KEY = 'templateLab.templates.v1';

const VALID_ROOT_TYPES: ReadonlyArray<string> = [
  'FRAME',
  'GROUP',
  'COMPONENT',
  'INSTANCE',
  'SECTION',
];

type ControlType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'color'
  | 'image'
  | 'visible'
  | 'variant';

type Mapping = {
  id: string;
  path: number[];
  layerName: string;
  control: ControlType;
  /** Control types valid for this layer — drives the per-row type dropdown. */
  availableControls?: ControlType[];
  variantProperty?: string;
  variantOptions?: string[];
};

type Template = {
  id: string;
  name: string;
  rootId: string;
  rootName: string;
  mappings: Mapping[];
  createdAt: number;
};

type Draft = {
  /** Set when editing an existing template; absent for a brand-new draft. */
  id?: string;
  /** Saved template name (edit mode); new drafts default the name to rootName. */
  name?: string;
  rootId: string;
  rootName: string;
  mappings: Mapping[];
};

/** Context about the layer currently selected while in Creation Mode. */
type SelectionContext =
  | { insideRoot: false }
  | {
      insideRoot: true;
      path: number[];
      layerName: string;
      controls: ControlType[];
      suggestedControl: ControlType;
      variantProperties: { name: string; options: string[] }[];
    };

type RootInfo = { valid: boolean; name?: string; type?: string };

type ImagePayload = { mappingId: string; bytes: number[] } | null;

type FormValue =
  | { control: 'text' | 'longtext' | 'number' | 'variant'; value: string }
  | { control: 'color'; value: string }
  | { control: 'visible'; value: boolean }
  | { control: 'image'; bytes: number[] | null };

type UiToCodeMessage =
  | { type: 'resize'; height: number }
  | { type: 'ready' }
  | { type: 'startCreate' }
  | { type: 'addMapping' }
  | { type: 'removeMapping'; mappingId: string }
  | { type: 'updateMappingName'; mappingId: string; name: string }
  | { type: 'changeMappingControl'; mappingId: string; control: ControlType }
  | { type: 'focusMapping'; mappingId: string }
  | { type: 'saveTemplate'; name: string }
  | { type: 'cancelCreate' }
  | { type: 'openTemplate'; templateId: string }
  | { type: 'editTemplate'; templateId: string }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'backToList' }
  | {
      type: 'generate';
      templateId: string;
      values: Record<string, FormValue>;
      count: number;
      layout: 'row' | 'grid';
    };

type View = 'list' | 'create' | 'use';

let templates: Template[] = [];
let view: View = 'list';
let draft: Draft | null = null;
let isWorking = false;

function setPageRelaunchForDiscovery(): void {
  figma.currentPage.setRelaunchData({ edit: 'Open this tool' });
}

const PANEL_WIDTH = 280;

figma.showUI(__html__, { width: PANEL_WIDTH, height: 360, themeColors: true });
setPageRelaunchForDiscovery();

/* ---------- storage ---------- */

async function loadTemplates(): Promise<void> {
  try {
    const raw = (await figma.clientStorage.getAsync(STORAGE_KEY)) as
      | Template[]
      | undefined;
    templates = Array.isArray(raw) ? raw : [];
  } catch {
    templates = [];
  }
}

async function saveTemplates(): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEY, templates);
}

/* ---------- helpers ---------- */

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const hexToRgb = (hex: string): RGB => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
};

function isValidRoot(node: BaseNode | null | undefined): node is SceneNode {
  return !!node && VALID_ROOT_TYPES.indexOf(node.type) !== -1;
}

function nodeHasChildren(node: BaseNode): node is BaseNode & ChildrenMixin {
  return 'children' in node;
}

function nodeHasFills(node: BaseNode): node is BaseNode & GeometryMixin {
  return 'fills' in node;
}

/** Relative child-index path from root down to target. Immune to renames / ids. */
function computePath(root: BaseNode, target: BaseNode): number[] | null {
  const path: number[] = [];
  let node: BaseNode | null = target;
  while (node && node.id !== root.id) {
    const parent: BaseNode | null = node.parent;
    if (!parent || !nodeHasChildren(parent)) return null;
    const idx = (parent.children as ReadonlyArray<SceneNode>).indexOf(
      node as SceneNode,
    );
    if (idx < 0) return null;
    path.unshift(idx);
    node = parent;
  }
  return node && node.id === root.id ? path : null;
}

/** Walk the same index path on a (cloned) root. */
function resolveByPath(root: SceneNode, path: number[]): SceneNode | null {
  let node: SceneNode = root;
  for (let i = 0; i < path.length; i++) {
    if (!nodeHasChildren(node)) return null;
    const kids = node.children as ReadonlyArray<SceneNode>;
    const idx = path[i];
    if (idx < 0 || idx >= kids.length) return null;
    node = kids[idx];
  }
  return node;
}

async function getVariantProperties(
  node: SceneNode,
): Promise<{ name: string; options: string[] }[]> {
  if (node.type !== 'INSTANCE') return [];
  try {
    const main = await node.getMainComponentAsync();
    const set = main && main.parent;
    if (!set || set.type !== 'COMPONENT_SET') return [];
    const defs = set.componentPropertyDefinitions;
    const out: { name: string; options: string[] }[] = [];
    for (const key in defs) {
      const def = defs[key];
      if (def.type === 'VARIANT' && def.variantOptions) {
        out.push({ name: key, options: def.variantOptions.slice() });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function supportedControls(node: SceneNode): Promise<ControlType[]> {
  const controls: ControlType[] = [];
  // Text layers can bind to a single-line ("short") or text-area ("long") input,
  // or a numeric input that writes the number back as the layer's characters.
  if (node.type === 'TEXT') controls.push('text', 'longtext', 'number');
  if (nodeHasFills(node) && node.fills !== figma.mixed) {
    controls.push('color', 'image');
  }
  const variants = await getVariantProperties(node);
  if (variants.length > 0) controls.push('variant');
  controls.push('visible');
  return controls;
}

/** Best-guess control for a freshly added layer; the user can change it later. */
function inferControl(node: SceneNode, controls: ControlType[]): ControlType {
  if (node.type === 'TEXT') return 'text';
  if (nodeHasFills(node) && node.fills !== figma.mixed) {
    const fills = node.fills as ReadonlyArray<Paint>;
    if (fills.length > 0 && fills[0].type === 'IMAGE') return 'image';
  }
  if (controls.indexOf('variant') !== -1) return 'variant';
  if (controls.indexOf('color') !== -1) return 'color';
  return 'visible';
}

/* ---------- selection-aware state push ---------- */

function getRootInfo(): RootInfo {
  const sel = figma.currentPage.selection[0];
  if (isValidRoot(sel)) return { valid: true, name: sel.name, type: sel.type };
  return { valid: false };
}

async function getSelectionContext(): Promise<SelectionContext> {
  if (!draft) return { insideRoot: false };
  const sel = figma.currentPage.selection[0];
  if (!sel) return { insideRoot: false };
  const root = await figma.getNodeByIdAsync(draft.rootId);
  if (!root) return { insideRoot: false };
  if (sel.id === root.id) {
    // The root itself can be mapped (e.g. variant swap, show/hide, fill).
  }
  const path = computePath(root, sel);
  if (!path) return { insideRoot: false };
  const variantProperties = await getVariantProperties(sel);
  const controls = await supportedControls(sel);
  return {
    insideRoot: true,
    path,
    layerName: sel.name,
    controls,
    suggestedControl: inferControl(sel, controls),
    variantProperties,
  };
}

function pushList(): void {
  view = 'list';
  figma.ui.postMessage({
    type: 'showList',
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      rootName: t.rootName,
      count: t.mappings.length,
    })),
    root: getRootInfo(),
  });
}

async function pushCreate(fresh: boolean): Promise<void> {
  view = 'create';
  if (!draft) return;
  const context = await getSelectionContext();
  figma.ui.postMessage({
    type: 'showCreate',
    rootName: draft.rootName,
    nameValue: draft.name != null ? draft.name : draft.rootName,
    editing: !!draft.id,
    mappings: draft.mappings,
    context,
    fresh,
  });
}

function controlLabel(control: ControlType): string {
  switch (control) {
    case 'text':
      return 'Text short';
    case 'longtext':
      return 'Text long';
    case 'number':
      return 'Number';
    case 'color':
      return 'Color';
    case 'image':
      return 'Upload image';
    case 'visible':
      return 'Hide/Show';
    case 'variant':
      return 'Variant';
  }
}

/* ---------- creation actions ---------- */

async function addMapping(): Promise<void> {
  if (!draft) return;
  const context = await getSelectionContext();
  if (!context.insideRoot) {
    figma.notify('Select a layer inside the template first.');
    return;
  }
  const control = context.suggestedControl;
  const mapping: Mapping = {
    id: uid(),
    path: context.path,
    layerName: context.layerName,
    control,
    availableControls: context.controls,
  };
  if (control === 'variant' && context.variantProperties.length > 0) {
    mapping.variantProperty = context.variantProperties[0].name;
    mapping.variantOptions = context.variantProperties[0].options;
  }
  draft.mappings.push(mapping);
  figma.notify('Added ' + context.layerName + ' → ' + controlLabel(control));
  // Deselect so the user intentionally picks the next layer to add.
  figma.currentPage.selection = [];
  await pushCreate(false);
}

/** Change a mapping's control type from its row dropdown. */
async function changeMappingControl(
  mappingId: string,
  control: ControlType,
): Promise<void> {
  if (!draft) return;
  const mapping = draft.mappings.filter((m) => m.id === mappingId)[0];
  if (!mapping) return;
  mapping.control = control;
  delete mapping.variantProperty;
  delete mapping.variantOptions;
  if (control === 'variant') {
    const root = await figma.getNodeByIdAsync(draft.rootId);
    if (root && isValidRoot(root)) {
      const node = resolveByPath(root, mapping.path);
      if (node) {
        const vps = await getVariantProperties(node);
        if (vps.length > 0) {
          mapping.variantProperty = vps[0].name;
          mapping.variantOptions = vps[0].options;
        }
      }
    }
  }
  await pushCreate(false);
}

/** Rename the friendly label for a mapping (the row's text input). */
function updateMappingName(mappingId: string, name: string): void {
  if (!draft) return;
  const mapping = draft.mappings.filter((m) => m.id === mappingId)[0];
  if (!mapping) return;
  mapping.layerName = name.trim() || mapping.layerName;
}

/** Focus button: select the mapped layer on canvas and zoom to it. */
async function focusMapping(mappingId: string): Promise<void> {
  if (!draft) return;
  const mapping = draft.mappings.filter((m) => m.id === mappingId)[0];
  if (!mapping) return;
  const root = await figma.getNodeByIdAsync(draft.rootId);
  if (!root || !isValidRoot(root)) {
    figma.notify('The template root is missing.');
    return;
  }
  const node = resolveByPath(root, mapping.path);
  if (!node) {
    figma.notify('Could not find that layer.');
    return;
  }
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

/** Recompute each mapping's valid control list from its live node (edit mode). */
async function enrichMappings(rootId: string, mappings: Mapping[]): Promise<void> {
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || !isValidRoot(root)) return;
  for (const m of mappings) {
    const node = resolveByPath(root, m.path);
    if (node) m.availableControls = await supportedControls(node);
  }
}

/** Open the editor for an existing template (rename, remap, remove layers). */
async function editTemplate(templateId: string): Promise<void> {
  const template = getTemplate(templateId);
  if (!template) return;
  const mappings = template.mappings.map((m) => ({
    ...m,
    variantOptions: m.variantOptions ? m.variantOptions.slice() : undefined,
  }));
  await enrichMappings(template.rootId, mappings);
  draft = {
    id: template.id,
    name: template.name,
    rootId: template.rootId,
    rootName: template.rootName,
    mappings,
  };
  await pushCreate(true);
  figma.notify('Editing “' + template.name + '”.');
}

async function saveTemplate(name: string): Promise<void> {
  if (!draft) return;
  if (draft.mappings.length === 0) {
    figma.notify('Map at least one layer before saving.');
    return;
  }
  const clean = name.trim() || draft.rootName || 'Untitled template';
  if (draft.id) {
    // Update the existing template in place, preserving id / created time.
    const existing = getTemplate(draft.id);
    if (existing) {
      existing.name = clean;
      existing.rootName = draft.rootName;
      existing.mappings = draft.mappings.slice();
    }
  } else {
    const template: Template = {
      id: uid(),
      name: clean,
      rootId: draft.rootId,
      rootName: draft.rootName,
      mappings: draft.mappings.slice(),
      createdAt: Date.now(),
    };
    templates.unshift(template);
  }
  await saveTemplates();
  draft = null;
  figma.notify('Saved template “' + clean + '”.');
  pushList();
}

/* ---------- use mode / generation ---------- */

function getTemplate(id: string): Template | undefined {
  for (let i = 0; i < templates.length; i++) {
    if (templates[i].id === id) return templates[i];
  }
  return undefined;
}

async function applyValue(
  target: SceneNode,
  mapping: Mapping,
  value: FormValue | undefined,
): Promise<void> {
  if (!value) return;

  if (mapping.control === 'visible' && value.control === 'visible') {
    target.visible = value.value;
    return;
  }

  if (
    (mapping.control === 'text' ||
      mapping.control === 'longtext' ||
      mapping.control === 'number') &&
    value.control !== 'image' &&
    value.control !== 'visible' &&
    target.type === 'TEXT'
  ) {
    const text = target as TextNode;
    if (text.characters.length > 0) {
      const fonts = text.getRangeAllFontNames(0, text.characters.length);
      for (const f of fonts) await figma.loadFontAsync(f);
    } else if (text.fontName !== figma.mixed) {
      await figma.loadFontAsync(text.fontName);
    }
    text.characters = value.value;
    return;
  }

  if (mapping.control === 'color' && value.control === 'color') {
    if (nodeHasFills(target) && target.fills !== figma.mixed) {
      const existing = target.fills as ReadonlyArray<Paint>;
      const opacity =
        existing[0] && existing[0].type === 'SOLID' ? existing[0].opacity : 1;
      const paint: SolidPaint = {
        type: 'SOLID',
        color: hexToRgb(value.value),
        opacity: opacity === undefined ? 1 : opacity,
      };
      target.fills = [paint];
    }
    return;
  }

  if (mapping.control === 'image' && value.control === 'image' && value.bytes) {
    if (nodeHasFills(target) && target.fills !== figma.mixed) {
      const image = figma.createImage(new Uint8Array(value.bytes));
      const paint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FILL',
        imageHash: image.hash,
      };
      target.fills = [paint];
    }
    return;
  }

  if (
    mapping.control === 'variant' &&
    value.control === 'variant' &&
    mapping.variantProperty &&
    target.type === 'INSTANCE'
  ) {
    try {
      const props: { [k: string]: string } = {};
      props[mapping.variantProperty] = value.value;
      (target as InstanceNode).setProperties(props);
    } catch (err) {
      figma.notify('Could not set variant: ' + (err as Error).message);
    }
    return;
  }
}

async function generate(
  templateId: string,
  values: Record<string, FormValue>,
  count: number,
  layout: 'row' | 'grid',
): Promise<void> {
  if (isWorking) return;
  isWorking = true;
  try {
    const template = getTemplate(templateId);
    if (!template) {
      figma.notify('Template not found.');
      return;
    }
    const root = await figma.getNodeByIdAsync(template.rootId);
    if (!root || root.removed || !isValidRoot(root)) {
      figma.notify('The source design for this template is missing.');
      return;
    }

    const gap = 32;
    const container = figma.createFrame();
    container.name = 'Generated / ' + template.name;
    container.layoutMode = 'HORIZONTAL';
    container.layoutWrap = layout === 'grid' ? 'WRAP' : 'NO_WRAP';
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.itemSpacing = gap;
    container.counterAxisSpacing = gap;
    container.clipsContent = false;
    container.fills = [];

    const clones: SceneNode[] = [];
    for (let i = 0; i < count; i++) {
      const clone = (root as SceneNode).clone();
      for (let m = 0; m < template.mappings.length; m++) {
        const mapping = template.mappings[m];
        const target = resolveByPath(clone, mapping.path);
        if (target) {
          await applyValue(target, mapping, values[mapping.id]);
        }
      }
      container.appendChild(clone);
      clones.push(clone);
    }

    // Grid wrapping: pin the primary axis width so rows wrap into columns.
    // An AUTO primary axis hugs content and would ignore the resize, so switch
    // to FIXED first, then size to the desired column count.
    if (layout === 'grid' && clones.length > 0) {
      const cellW = clones[0].width;
      const cols = Math.min(3, count);
      const targetW = cols * cellW + (cols - 1) * gap;
      container.primaryAxisSizingMode = 'FIXED';
      container.resize(Math.max(cellW, targetW), container.height);
    }

    // Position to the right of the source design (or viewport center if unknown).
    const bounds = (root as SceneNode).absoluteBoundingBox;
    if (bounds) {
      container.x = bounds.x + bounds.width + 100;
      container.y = bounds.y;
    } else {
      container.x = figma.viewport.center.x - container.width / 2;
      container.y = figma.viewport.center.y - container.height / 2;
    }

    container.setPluginData('toolId', TOOL_ID);
    container.setRelaunchData({ edit: 'Open this tool' });

    figma.currentPage.selection = [container];
    figma.viewport.scrollAndZoomIntoView([container]);
    figma.notify(
      'Generated ' + count + ' copy' + (count === 1 ? '' : 'ies') + '.',
    );
  } catch (err) {
    figma.notify('Could not generate: ' + (err as Error).message);
  } finally {
    isWorking = false;
  }
}

/* ---------- messages ---------- */

figma.ui.onmessage = async (msg: UiToCodeMessage) => {
  if (msg.type === 'resize') {
    const h = Math.max(120, Math.min(900, Math.round(msg.height)));
    figma.ui.resize(PANEL_WIDTH, h);
    return;
  }

  if (msg.type === 'ready') {
    await loadTemplates();
    pushList();
    return;
  }

  if (msg.type === 'startCreate') {
    const sel = figma.currentPage.selection[0];
    if (!isValidRoot(sel)) {
      figma.notify('Select a frame, group, component, or section first.');
      return;
    }
    draft = { rootId: sel.id, rootName: sel.name, mappings: [] };
    // Deselect the root so the user must intentionally pick a child layer to
    // map — the editor opens to "Select a layer", not the frame itself.
    figma.currentPage.selection = [];
    await pushCreate(true);
    figma.notify('Click a layer inside “' + sel.name + '” to map it.');
    return;
  }

  if (msg.type === 'addMapping') {
    await addMapping();
    return;
  }

  if (msg.type === 'removeMapping') {
    if (draft) {
      draft.mappings = draft.mappings.filter((m) => m.id !== msg.mappingId);
      await pushCreate(false);
    }
    return;
  }

  if (msg.type === 'updateMappingName') {
    updateMappingName(msg.mappingId, msg.name);
    return;
  }

  if (msg.type === 'changeMappingControl') {
    await changeMappingControl(msg.mappingId, msg.control);
    return;
  }

  if (msg.type === 'focusMapping') {
    await focusMapping(msg.mappingId);
    return;
  }

  if (msg.type === 'saveTemplate') {
    await saveTemplate(msg.name);
    return;
  }

  if (msg.type === 'cancelCreate') {
    draft = null;
    pushList();
    return;
  }

  if (msg.type === 'openTemplate') {
    const template = getTemplate(msg.templateId);
    if (!template) return;
    view = 'use';
    const root = await figma.getNodeByIdAsync(template.rootId);
    figma.ui.postMessage({
      type: 'showUse',
      template: {
        id: template.id,
        name: template.name,
        rootName: template.rootName,
        mappings: template.mappings,
      },
      sourceMissing: !root || root.removed,
    });
    return;
  }

  if (msg.type === 'editTemplate') {
    await editTemplate(msg.templateId);
    return;
  }

  if (msg.type === 'deleteTemplate') {
    templates = templates.filter((t) => t.id !== msg.templateId);
    await saveTemplates();
    pushList();
    return;
  }

  if (msg.type === 'backToList') {
    draft = null;
    pushList();
    return;
  }

  if (msg.type === 'generate') {
    await generate(msg.templateId, msg.values, msg.count, msg.layout);
    return;
  }
};

figma.on('selectionchange', () => {
  if (view === 'list') {
    figma.ui.postMessage({ type: 'rootInfo', root: getRootInfo() });
  } else if (view === 'create') {
    void getSelectionContext().then((context) => {
      figma.ui.postMessage({ type: 'selectionContext', context });
    });
  }
});

void (async () => {
  await loadTemplates();
  pushList();
})();

void ((): ImagePayload => null);

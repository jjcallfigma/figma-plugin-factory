/**
 * Tool: CSV to Lineup Grid
 * Does: Parses pasted lineup CSV and generates a grid of artist-card frames.
 * Output strategy: parent auto-layout frame `lineup-card-grid` with child `artist-card` frames.
 * Regenerate behavior: Generate adds when none selected; control changes update selected grid only.
 * Assumptions: Card size presets scale typography; group order follows first CSV appearance.
 *
 * API (no keys):
 * - Wikimedia Commons: https://commons.wikimedia.org/w/api.php (image search)
 */

figma.showUI(__html__, { width: 240, height: 320, themeColors: true });

function setPageRelaunchForDiscovery(): void {
  figma.currentPage.setRelaunchData({
    edit: 'Open this tool',
  });
}
setPageRelaunchForDiscovery();

const TOOL_ID = 'csv-to-lineup';
const OVERLAY_OPACITY = 0.57;
const MAX_AUTO_IMAGE_LOOKUPS = 12;

type ImageTreatment = 'noir' | 'fog' | 'high-contrast' | 'soft-grain';
type CropBias = 'center' | 'top' | 'bottom';
type CardSizeKey = 'headliner' | 'standard' | 'compact';
type GroupBy = 'none' | 'section' | 'day' | 'stage';

type ArtistRow = {
  artist: string;
  stage: string;
  time: string;
  day: string;
  section: string;
  imageUrl: string;
};

type CardPreset = {
  size: number;
  padding: number;
  nameSize: number;
  perfSize: number;
  initialsSize: number;
};

type CsvInputMode = 'paste' | 'upload';

type State = {
  csvData: string;
  csvInputMode: CsvInputMode;
  uploadedFileName: string | null;
  columns: number;
  gap: number;
  cardSize: CardSizeKey;
  groupBy: GroupBy;
  autoFindImages: boolean;
  imageTreatment: ImageTreatment;
  cropBias: CropBias;
  grain: number;
  contrast: number;
  showSectionLabels: boolean;
};

type UiToCodeMessage =
  | { type: 'generate'; state: State }
  | { type: 'regenerate'; state: State }
  | { type: 'resize'; height: number };

type CodeToUiMessage =
  | { type: 'loadState'; state: State }
  | { type: 'outputSelected'; selected: boolean };

const SAMPLE_CSV = `artist,stage,time,day,section,image_url
Tame Impala,Main Stage,10:00 PM,Friday,Headliners,
Kaytranada,Redwood Stage,9:00 PM,Friday,Headliners,
Bonobo,Creek Stage,11:00 PM,Friday,Headliners,
Moodymann,The Grove,4:00 PM,Saturday,Redwood Stage,`;

const defaultState: State = {
  csvData: SAMPLE_CSV,
  csvInputMode: 'paste',
  uploadedFileName: null,
  columns: 3,
  gap: 16,
  cardSize: 'headliner',
  groupBy: 'section',
  autoFindImages: false,
  imageTreatment: 'noir',
  cropBias: 'center',
  grain: 35,
  contrast: 80,
  showSectionLabels: true,
};

const CARD_PRESETS: Record<CardSizeKey, CardPreset> = {
  headliner: { size: 416, padding: 20, nameSize: 48, perfSize: 12, initialsSize: 120 },
  standard: { size: 312, padding: 16, nameSize: 36, perfSize: 10, initialsSize: 90 },
  compact: { size: 208, padding: 12, nameSize: 24, perfSize: 8, initialsSize: 60 },
};

const TREATMENT_PARAMS: Record<
  ImageTreatment,
  { darken: number; lighten: number; contrastMul: number; grayOpacity: number }
> = {
  noir: { darken: 0.42, lighten: 0, contrastMul: 1.15, grayOpacity: 1 },
  fog: { darken: 0.18, lighten: 0.22, contrastMul: 0.65, grayOpacity: 0.75 },
  'high-contrast': { darken: 0.5, lighten: 0.04, contrastMul: 1.35, grayOpacity: 1 },
  'soft-grain': { darken: 0.28, lighten: 0.08, contrastMul: 0.85, grayOpacity: 0.88 },
};

let currentOutput: FrameNode | null = null;
let isRegenerating = false;

const solidFill = (hex: string, opacity = 1): SolidPaint => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { type: 'SOLID', color: { r, g, b }, opacity };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

function getSelectedToolFrame(): FrameNode | null {
  const sel = figma.currentPage.selection[0];
  if (sel?.type === 'FRAME' && sel.getPluginData('toolId') === TOOL_ID) {
    return sel;
  }
  return null;
}

function postOutputSelected(selected: boolean): void {
  figma.ui.postMessage({ type: 'outputSelected', selected } satisfies CodeToUiMessage);
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value.trim());
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  fields.push(current);
  return fields;
}

function parseCsv(text: string): ArtistRow[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const index = (name: string): number => headers.indexOf(name);

  const artistIdx = index('artist');
  const stageIdx = index('stage');
  const timeIdx = index('time');
  const dayIdx = index('day');
  const sectionIdx = index('section');
  const imageIdx = index('image_url');

  if (artistIdx < 0) return [];

  const rows: ArtistRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const artist = (cols[artistIdx] ?? '').trim();
    if (!artist) continue;

    rows.push({
      artist,
      stage: stageIdx >= 0 ? (cols[stageIdx] ?? '').trim() : '',
      time: timeIdx >= 0 ? (cols[timeIdx] ?? '').trim() : '',
      day: dayIdx >= 0 ? (cols[dayIdx] ?? '').trim() : '',
      section: sectionIdx >= 0 ? (cols[sectionIdx] ?? '').trim() : '',
      imageUrl: imageIdx >= 0 ? (cols[imageIdx] ?? '').trim() : '',
    });
  }

  return rows;
}

async function searchWikimediaImages(artistName: string): Promise<string | null> {
  const search = encodeQuery(`${artistName} musician`);
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${search}&gsrnamespace=6&gsrlimit=3&prop=imageinfo` +
    `&iiprop=url|thumburl|extmetadata&iiurlwidth=300&format=json&origin=*`;

  const data = await fetchJson<{
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: Array<{ url?: string }>;
        }
      >;
    };
  }>(url);

  for (const page of Object.values(data.query?.pages ?? {})) {
    const imageUrl = page.imageinfo?.[0]?.url;
    if (imageUrl) return imageUrl;
  }

  return null;
}

function getImageTransform(bias: CropBias): Transform {
  const ty = bias === 'top' ? 0.12 : bias === 'bottom' ? -0.12 : 0;
  return [
    [1, 0, 0],
    [0, 1, ty],
  ];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

async function loadCardFonts(): Promise<{ family: string; style: string }> {
  const candidates: Array<[string, string]> = [
    ['Arimo', 'Bold'],
    ['Inter', 'Bold'],
  ];

  for (const [family, style] of candidates) {
    try {
      await figma.loadFontAsync({ family, style });
      return { family, style };
    } catch {
      // try next
    }
  }

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  return { family: 'Inter', style: 'Regular' };
}

function addFullRect(
  parent: FrameNode,
  name: string,
  size: number,
  fill: Paint | Paint[],
  opacity = 1,
  blendMode: BlendMode = 'NORMAL',
): RectangleNode {
  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(size, size);
  rect.x = 0;
  rect.y = 0;
  rect.fills = Array.isArray(fill) ? fill : [fill];
  rect.opacity = opacity;
  rect.blendMode = blendMode;
  parent.appendChild(rect);
  return rect;
}

async function addImageLayer(
  parent: FrameNode,
  imageUrl: string,
  state: State,
  preset: CardPreset,
): Promise<boolean> {
  try {
    const image = await figma.createImageAsync(imageUrl);
    const rect = figma.createRectangle();
    rect.name = 'image';
    rect.resize(preset.size, preset.size);
    rect.fills = [
      {
        type: 'IMAGE',
        scaleMode: 'FILL',
        imageHash: image.hash,
        imageTransform: getImageTransform(state.cropBias),
      },
    ];
    parent.appendChild(rect);
    return true;
  } catch {
    return false;
  }
}

async function addPlaceholderLayers(
  parent: FrameNode,
  artistName: string,
  preset: CardPreset,
): Promise<void> {
  const size = preset.size;
  addFullRect(parent, 'image', size, solidFill('#141414'));

  const initials = getInitials(artistName);
  const font = await loadCardFonts();
  const scale = size / 416;

  const shadowSpecs = [
    { x: 32 * scale, y: 48 * scale, w: 120 * scale, h: 180 * scale, opacity: 0.18 },
    { x: 220 * scale, y: 72 * scale, w: 96 * scale, h: 140 * scale, opacity: 0.12 },
    { x: 140 * scale, y: 260 * scale, w: 200 * scale, h: 64 * scale, opacity: 0.16 },
  ];

  for (const spec of shadowSpecs) {
    const block = figma.createRectangle();
    block.name = 'shadow';
    block.resize(spec.w, spec.h);
    block.x = spec.x;
    block.y = spec.y;
    block.fills = [solidFill('#000000', spec.opacity)];
    parent.appendChild(block);
  }

  const initialsText = figma.createText();
  initialsText.name = 'initials';
  initialsText.fontName = font;
  initialsText.characters = initials;
  initialsText.fontSize = preset.initialsSize;
  initialsText.fills = [solidFill('#FFFFFF', 0.08)];
  initialsText.textAlignHorizontal = 'CENTER';
  initialsText.textAlignVertical = 'CENTER';
  initialsText.resize(size, size);
  initialsText.x = 0;
  initialsText.y = 0;
  parent.appendChild(initialsText);
}

function addTreatmentLayers(parent: FrameNode, state: State, preset: CardPreset): void {
  const presetParams = TREATMENT_PARAMS[state.imageTreatment];
  const contrastFactor = (state.contrast / 100) * presetParams.contrastMul;
  const size = preset.size;

  if (presetParams.grayOpacity > 0) {
    addFullRect(parent, 'grayscale', size, solidFill('#808080'), presetParams.grayOpacity, 'COLOR');
  }

  if (presetParams.darken > 0) {
    const darkenOpacity = Math.min(0.65, presetParams.darken * (0.55 + contrastFactor * 0.35));
    addFullRect(parent, 'exposure-dark', size, solidFill('#000000'), darkenOpacity, 'MULTIPLY');
  }

  if (presetParams.lighten > 0) {
    addFullRect(parent, 'exposure-light', size, solidFill('#FFFFFF'), presetParams.lighten, 'SCREEN');
  }

  if (contrastFactor > 0.7) {
    addFullRect(
      parent,
      'contrast',
      size,
      solidFill('#000000'),
      Math.min(0.35, (contrastFactor - 0.7) * 0.45),
      'OVERLAY',
    );
  }
}

function addGrainLayer(parent: FrameNode, state: State, preset: CardPreset): void {
  const size = preset.size;
  const grainOpacity = Math.min(0.55, (state.grain / 100) * 0.5);
  if (grainOpacity <= 0.02) return;

  const grainGroup = figma.createFrame();
  grainGroup.name = 'grain';
  grainGroup.resize(size, size);
  grainGroup.x = 0;
  grainGroup.y = 0;
  grainGroup.fills = [];
  grainGroup.clipsContent = true;

  const grainBase = figma.createRectangle();
  grainBase.resize(size, size);
  grainBase.fills = [solidFill('#B0B0B0')];
  grainBase.opacity = grainOpacity;
  grainBase.blendMode = 'OVERLAY';
  grainGroup.appendChild(grainBase);

  const speckCount = state.imageTreatment === 'soft-grain' ? 48 : 32;
  for (let i = 0; i < speckCount; i++) {
    const speck = figma.createRectangle();
    speck.name = 'grain-speck';
    const speckSize = 1 + (i % 3);
    speck.resize(speckSize, speckSize);
    speck.x = ((i * 97) % size) + (i % 5);
    speck.y = ((i * 53) % size) + (i % 7);
    speck.fills = [solidFill(i % 2 === 0 ? '#FFFFFF' : '#000000', 0.08 + (i % 4) * 0.03)];
    speck.blendMode = 'OVERLAY';
    grainGroup.appendChild(speck);
  }

  parent.appendChild(grainGroup);
}

function formatPerformanceLine(row: ArtistRow): string {
  const stageLabel = row.stage ? row.stage.toUpperCase() : 'TBA';
  const timeLabel = row.time || 'TBA';
  return `${stageLabel} · ${timeLabel}`;
}

async function buildArtistCard(
  row: ArtistRow,
  state: State,
  preset: CardPreset,
  resolvedImageUrl: string | null,
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = 'artist-card';
  frame.resize(preset.size, preset.size);
  frame.clipsContent = true;
  frame.fills = [solidFill('#000000')];
  frame.cornerRadius = 0;

  const imageUrl = row.imageUrl || resolvedImageUrl;
  let hasImage = false;

  if (imageUrl) {
    hasImage = await addImageLayer(frame, imageUrl, state, preset);
  }

  if (!hasImage) {
    await addPlaceholderLayers(frame, row.artist, preset);
  }

  addTreatmentLayers(frame, state, preset);
  addFullRect(frame, 'overlay', preset.size, solidFill('#000000'), OVERLAY_OPACITY);
  addGrainLayer(frame, state, preset);

  const font = await loadCardFonts();

  const textWrap = figma.createFrame();
  textWrap.name = 'text';
  textWrap.layoutMode = 'VERTICAL';
  textWrap.primaryAxisSizingMode = 'AUTO';
  textWrap.counterAxisSizingMode = 'AUTO';
  textWrap.itemSpacing = 4;
  textWrap.fills = [];
  textWrap.x = preset.padding;
  textWrap.y = preset.size - preset.padding;
  textWrap.counterAxisAlignItems = 'MIN';

  const artistText = figma.createText();
  artistText.name = 'Artist Name';
  artistText.fontName = font;
  artistText.characters = row.artist.toUpperCase();
  artistText.fontSize = preset.nameSize;
  artistText.lineHeight = { unit: 'PERCENT', value: 100 };
  artistText.fills = [solidFill('#FFFFFF')];
  artistText.textCase = 'UPPER';
  textWrap.appendChild(artistText);

  const perfText = figma.createText();
  perfText.name = 'Performance Details';
  perfText.fontName = font;
  perfText.characters = formatPerformanceLine(row);
  perfText.fontSize = preset.perfSize;
  perfText.lineHeight = { unit: 'PERCENT', value: 100 };
  perfText.fills = [solidFill('#FFFFFF')];
  perfText.opacity = 0.75;
  perfText.textCase = 'UPPER';
  textWrap.appendChild(perfText);

  frame.appendChild(textWrap);
  textWrap.y = preset.size - preset.padding - textWrap.height;

  return frame;
}

function createCardWrapFrame(state: State, preset: CardPreset): FrameNode {
  const wrap = figma.createFrame();
  wrap.name = 'cards-row';
  wrap.layoutMode = 'HORIZONTAL';
  wrap.layoutWrap = 'WRAP';
  wrap.primaryAxisSizingMode = 'AUTO';
  wrap.counterAxisSizingMode = 'AUTO';
  wrap.itemSpacing = state.gap;
  wrap.counterAxisSpacing = state.gap;
  wrap.fills = [];
  wrap.clipsContent = false;

  const cardWidth = preset.size;
  const maxRowWidth = state.columns * cardWidth + (state.columns - 1) * state.gap;
  wrap.resizeWithoutConstraints(maxRowWidth, preset.size);

  return wrap;
}

async function createSectionLabel(text: string): Promise<TextNode> {
  const font = await loadCardFonts();
  const label = figma.createText();
  label.name = 'section-label';
  label.fontName = font;
  label.characters = text.toUpperCase();
  label.fontSize = 20;
  label.lineHeight = { unit: 'PERCENT', value: 110 };
  label.fills = [solidFill('#1E1E1E')];
  label.textCase = 'UPPER';
  return label;
}

function getGroupKey(row: ArtistRow, groupBy: GroupBy): string {
  if (groupBy === 'section') return row.section || 'Other';
  if (groupBy === 'day') return row.day || 'Other';
  if (groupBy === 'stage') return row.stage || 'Other';
  return '';
}

function groupRows(rows: ArtistRow[], groupBy: GroupBy): Array<{ key: string; rows: ArtistRow[] }> {
  if (groupBy === 'none') {
    return [{ key: '', rows }];
  }

  const order: string[] = [];
  const map = new Map<string, ArtistRow[]>();

  for (const row of rows) {
    const key = getGroupKey(row, groupBy);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }

  return order.map((key) => ({ key, rows: map.get(key)! }));
}

async function resolveImages(
  rows: ArtistRow[],
  state: State,
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  let lookupsUsed = 0;

  for (const row of rows) {
    if (row.imageUrl) {
      resolved.set(row.artist, row.imageUrl);
    }
  }

  for (const row of rows) {
    const cacheKey = row.artist;
    if (resolved.has(cacheKey)) continue;

    if (!state.autoFindImages || lookupsUsed >= MAX_AUTO_IMAGE_LOOKUPS) {
      resolved.set(cacheKey, null);
      continue;
    }

    try {
      const url = await searchWikimediaImages(row.artist);
      resolved.set(cacheKey, url);
    } catch {
      resolved.set(cacheKey, null);
    }

    lookupsUsed++;
  }

  return resolved;
}

async function buildGridContents(parent: FrameNode, state: State): Promise<void> {
  const rows = parseCsv(state.csvData);
  if (rows.length === 0) {
    throw new Error('No artist rows found. Check your CSV header and data.');
  }

  const preset = CARD_PRESETS[state.cardSize];
  const imageMap = await resolveImages(rows, state);
  const groups = groupRows(rows, state.groupBy);

  parent.layoutMode = 'VERTICAL';
  parent.primaryAxisSizingMode = 'AUTO';
  parent.counterAxisSizingMode = 'AUTO';
  parent.itemSpacing = state.gap * 1.5;
  parent.fills = [];
  parent.clipsContent = false;
  parent.paddingTop = 0;
  parent.paddingBottom = 0;
  parent.paddingLeft = 0;
  parent.paddingRight = 0;

  for (const group of groups) {
    let targetWrap: FrameNode;

    if (state.groupBy === 'none') {
      targetWrap = createCardWrapFrame(state, preset);
      parent.appendChild(targetWrap);
    } else {
      const groupFrame = figma.createFrame();
      groupFrame.name = `group-${group.key}`;
      groupFrame.layoutMode = 'VERTICAL';
      groupFrame.primaryAxisSizingMode = 'AUTO';
      groupFrame.counterAxisSizingMode = 'AUTO';
      groupFrame.itemSpacing = state.gap * 0.75;
      groupFrame.fills = [];
      groupFrame.clipsContent = false;
      parent.appendChild(groupFrame);

      if (state.showSectionLabels) {
        const label = await createSectionLabel(group.key);
        groupFrame.appendChild(label);
      }

      targetWrap = createCardWrapFrame(state, preset);
      groupFrame.appendChild(targetWrap);
    }

    for (const row of group.rows) {
      try {
        const resolvedUrl = imageMap.get(row.artist) ?? null;
        const card = await buildArtistCard(row, state, preset, resolvedUrl);
        targetWrap.appendChild(card);
      } catch {
        try {
          const card = await buildArtistCard(row, state, preset, null);
          targetWrap.appendChild(card);
        } catch {
          figma.notify(`Skipped card for ${row.artist}`);
        }
      }
    }
  }
}

async function regenerate(state: State, mode: 'create' | 'update'): Promise<void> {
  if (isRegenerating) return;
  isRegenerating = true;

  try {
    let posX = 0;
    let posY = 0;

    if (mode === 'update') {
      const existing = getSelectedToolFrame();
      if (!existing) return;
      posX = existing.x;
      posY = existing.y;
      existing.remove();
    }

    const frame = figma.createFrame();
    frame.name = 'lineup-card-grid';

    await buildGridContents(frame, state);

    frame.setPluginData('toolState', JSON.stringify(state));
    frame.setPluginData('toolId', TOOL_ID);
    frame.setRelaunchData({
      regenerate: 'Regenerate with current values',
      edit: 'Open this tool to edit',
    });

    if (mode === 'update') {
      frame.x = posX;
      frame.y = posY;
    } else {
      frame.x = figma.viewport.center.x - frame.width / 2;
      frame.y = figma.viewport.center.y - frame.height / 2;
      figma.viewport.scrollAndZoomIntoView([frame]);
    }

    currentOutput = frame;
    figma.currentPage.selection = [frame];
    postOutputSelected(true);
  } catch (err) {
    figma.notify(`Could not regenerate: ${(err as Error).message}`);
  } finally {
    isRegenerating = false;
  }
}

figma.ui.onmessage = async (msg: UiToCodeMessage) => {
  if (msg.type === 'resize') {
    const h = Math.max(120, Math.min(900, Math.round(msg.height)));
    figma.ui.resize(240, h);
    return;
  }

  if (msg.type === 'generate') {
    const selected = getSelectedToolFrame();
    await regenerate(msg.state, selected ? 'update' : 'create');
  } else if (msg.type === 'regenerate') {
    await regenerate(msg.state, 'update');
  }
};

figma.on('selectionchange', () => {
  const toolFrame = getSelectedToolFrame();
  postOutputSelected(!!toolFrame);

  if (!toolFrame) return;

  const raw = toolFrame.getPluginData('toolState');
  if (!raw) return;

  figma.ui.postMessage({ type: 'loadState', state: JSON.parse(raw) as State });
  currentOutput = toolFrame;
});

if (figma.command === 'regenerate') {
  const sel = getSelectedToolFrame();
  if (sel) {
    const raw = sel.getPluginData('toolState');
    if (raw) {
      void regenerate(JSON.parse(raw) as State, 'update');
    }
  }
}

void defaultState;

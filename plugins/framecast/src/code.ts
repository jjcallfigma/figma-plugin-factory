/**
 * Tool: Framecast
 * Does: Cockpit for the local Framecast recorder — selection cues, replay, cue board.
 * Behavior: selection-sync utility; generated-node output only for the cue board.
 * Assumption: Companion app at http://localhost:49888; host provides FigUI3 via propsKit.
 */

const BOARD_TOOL_ID = 'framecast-cue-board';

const CUE_TARGET_TYPES: SceneNode['type'][] = ['FRAME', 'SECTION', 'COMPONENT'];

type CueRecord = {
  id: string;
  time: number;
  nodeId: string;
  nodeName: string;
  pageName: string;
  title: string;
  note: string;
  eventSource: 'selectionchange' | 'manual';
  stale?: boolean;
};

type CueTarget = {
  nodeId: string;
  nodeName: string;
  pageName: string;
  title: string;
};

type StoredPrefs = {
  cameraId?: string;
  micId?: string;
  autoStamp: boolean;
  sessionTitle?: string;
};

type StoredSession = {
  sessionId: string;
  localPlaybackUrl: string;
  sessionTitle: string;
  cues: CueRecord[];
};

type UiToCodeMessage =
  | { type: 'resize'; height: number }
  | { type: 'getInit' }
  | { type: 'savePrefs'; prefs: StoredPrefs }
  | { type: 'saveSession'; session: StoredSession }
  | { type: 'getCueTarget' }
  | { type: 'replayCue'; nodeId: string; cueId: string }
  | { type: 'relinkCue'; cueId: string }
  | { type: 'generateCueBoard'; session: StoredSession }
  | { type: 'openExternal'; url: string };

type CodeToUiMessage =
  | { type: 'init'; prefs: StoredPrefs; pageName: string; session: StoredSession | null }
  | { type: 'cueTarget'; target: CueTarget | null }
  | { type: 'replayResult'; cueId: string; ok: boolean; stale: boolean }
  | { type: 'relinkResult'; cueId: string; target: CueTarget | null }
  | { type: 'cueBoardCreated'; frameId: string }
  | { type: 'companionHealth'; ok: boolean };

function setPageRelaunchForDiscovery(): void {
  figma.currentPage.setRelaunchData({
    open: 'Open Framecast',
  });
}

function storageKey(suffix: string): string {
  return `framecast.${suffix}`;
}

async function loadPrefs(): Promise<StoredPrefs> {
  const autoStamp = await figma.clientStorage.getAsync(storageKey('autoStamp'));
  const cameraId = await figma.clientStorage.getAsync(storageKey('cameraId'));
  const micId = await figma.clientStorage.getAsync(storageKey('micId'));
  const sessionTitle = await figma.clientStorage.getAsync(storageKey('sessionTitle'));
  return {
    autoStamp: autoStamp !== false,
    cameraId: typeof cameraId === 'string' ? cameraId : undefined,
    micId: typeof micId === 'string' ? micId : undefined,
    sessionTitle: typeof sessionTitle === 'string' ? sessionTitle : undefined,
  };
}

async function savePrefs(prefs: StoredPrefs): Promise<void> {
  await figma.clientStorage.setAsync(storageKey('autoStamp'), prefs.autoStamp);
  if (prefs.cameraId) {
    await figma.clientStorage.setAsync(storageKey('cameraId'), prefs.cameraId);
  }
  if (prefs.micId) {
    await figma.clientStorage.setAsync(storageKey('micId'), prefs.micId);
  }
  if (prefs.sessionTitle) {
    await figma.clientStorage.setAsync(storageKey('sessionTitle'), prefs.sessionTitle);
  }
}

async function loadSession(): Promise<StoredSession | null> {
  const raw = await figma.clientStorage.getAsync(storageKey('latestSession'));
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as StoredSession;
  if (!session.sessionId || !session.localPlaybackUrl) return null;
  return session;
}

async function saveSession(session: StoredSession): Promise<void> {
  await figma.clientStorage.setAsync(storageKey('latestSession'), session);
}

function defaultSessionTitle(): string {
  const pageName = figma.currentPage.name.trim();
  return pageName || 'Design walkthrough';
}

function resolveCueTargetFromNode(node: SceneNode): SceneNode | null {
  if (CUE_TARGET_TYPES.includes(node.type)) {
    return node;
  }
  let parent: BaseNode | null = node.parent;
  while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
    if (CUE_TARGET_TYPES.includes(parent.type as SceneNode['type'])) {
      return parent as SceneNode;
    }
    parent = parent.parent;
  }
  return null;
}

function pathToRoot(node: SceneNode): SceneNode[] {
  const path: SceneNode[] = [];
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    path.unshift(current as SceneNode);
    current = current.parent;
  }
  return path;
}

function resolveCueTarget(selection: readonly SceneNode[]): SceneNode | null {
  if (selection.length === 0) return null;
  if (selection.length === 1) {
    return resolveCueTargetFromNode(selection[0]);
  }

  const paths = selection.map((node) => pathToRoot(node));
  const minLen = Math.min(...paths.map((p) => p.length));
  let common: SceneNode | null = null;
  for (let i = 0; i < minLen; i += 1) {
    const id = paths[0][i].id;
    if (paths.every((p) => p[i].id === id)) {
      common = paths[0][i];
    } else {
      break;
    }
  }
  if (!common) return null;

  let node: BaseNode | null = common;
  while (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
    if (CUE_TARGET_TYPES.includes(node.type as SceneNode['type'])) {
      return node as SceneNode;
    }
    node = node.parent;
  }
  return null;
}

function cueTargetPayload(node: SceneNode): CueTarget {
  return {
    nodeId: node.id,
    nodeName: node.name,
    pageName: figma.currentPage.name,
    title: node.name,
  };
}

function getCurrentCueTarget(): CueTarget | null {
  const node = resolveCueTarget(figma.currentPage.selection);
  return node ? cueTargetPayload(node) : null;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function loadFonts(): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
}

function createText(
  characters: string,
  size: number,
  style: 'Regular' | 'Medium' | 'Bold' = 'Regular',
  color: RGB = { r: 0.12, g: 0.12, b: 0.12 },
): TextNode {
  const text = figma.createText();
  text.fontName = { family: 'Inter', style };
  text.characters = characters;
  text.fontSize = size;
  text.fills = [{ type: 'SOLID', color }];
  text.textAutoResize = 'WIDTH_AND_HEIGHT';
  return text;
}

async function generateCueBoard(session: StoredSession): Promise<void> {
  try {
    await loadFonts();

    const board = figma.createFrame();
    board.name = `Framecast — ${session.sessionTitle}`;
    board.layoutMode = 'VERTICAL';
    board.primaryAxisSizingMode = 'AUTO';
    board.counterAxisSizingMode = 'AUTO';
    board.itemSpacing = 12;
    board.paddingTop = 24;
    board.paddingBottom = 24;
    board.paddingLeft = 24;
    board.paddingRight = 24;
    board.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    board.cornerRadius = 8;
    board.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
    board.strokeWeight = 1;

    const header = createText('Framecast', 20, 'Bold');
    board.appendChild(header);

    const meta = createText(
      `${session.sessionTitle}\n${session.localPlaybackUrl}\n${session.cues.length} cue${session.cues.length === 1 ? '' : 's'}`,
      12,
      'Regular',
      { r: 0.4, g: 0.4, b: 0.4 },
    );
    board.appendChild(meta);

    const timeline = figma.createFrame();
    timeline.name = 'Timeline';
    timeline.layoutMode = 'HORIZONTAL';
    timeline.primaryAxisSizingMode = 'AUTO';
    timeline.counterAxisSizingMode = 'AUTO';
    timeline.itemSpacing = 4;
    timeline.fills = [];
    timeline.paddingTop = 8;
    timeline.paddingBottom = 8;

    const sorted = [...session.cues].sort((a, b) => a.time - b.time);
    const maxTime = sorted.length > 0 ? sorted[sorted.length - 1].time : 1;
    sorted.forEach((cue) => {
      const tick = figma.createFrame();
      tick.layoutMode = 'VERTICAL';
      tick.primaryAxisSizingMode = 'FIXED';
      tick.counterAxisSizingMode = 'AUTO';
      tick.resize(Math.max(48, (cue.time / maxTime) * 200), 32);
      tick.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.94, b: 0.98 } }];
      tick.cornerRadius = 4;
      const tickLabel = createText(formatTime(cue.time), 10, 'Medium', { r: 0.25, g: 0.35, b: 0.65 });
      tick.appendChild(tickLabel);
      timeline.appendChild(tick);
    });
    board.appendChild(timeline);

    const cards = figma.createFrame();
    cards.name = 'Cues';
    cards.layoutMode = 'VERTICAL';
    cards.primaryAxisSizingMode = 'AUTO';
    cards.counterAxisSizingMode = 'AUTO';
    cards.itemSpacing = 8;
    cards.fills = [];

    for (const cue of sorted) {
      const card = figma.createFrame();
      card.name = `${formatTime(cue.time)} — ${cue.title}`;
      card.layoutMode = 'VERTICAL';
      card.primaryAxisSizingMode = 'AUTO';
      card.counterAxisSizingMode = 'AUTO';
      card.itemSpacing = 4;
      card.paddingTop = 12;
      card.paddingBottom = 12;
      card.paddingLeft = 12;
      card.paddingRight = 12;
      card.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
      card.cornerRadius = 6;
      if (cue.stale) {
        card.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.55, b: 0.2 } }];
        card.strokeWeight = 1;
      }

      card.appendChild(createText(formatTime(cue.time), 11, 'Bold'));
      card.appendChild(createText(cue.title, 14, 'Medium'));
      card.appendChild(
        createText(`${cue.pageName} · ${cue.nodeName}`, 11, 'Regular', { r: 0.45, g: 0.45, b: 0.45 }),
      );
      if (cue.note.trim()) {
        card.appendChild(createText(cue.note, 11, 'Regular', { r: 0.3, g: 0.3, b: 0.3 }));
      }
      if (cue.stale) {
        card.appendChild(createText('Node missing — relink in Framecast', 10, 'Medium', { r: 0.75, g: 0.35, b: 0.1 }));
      }
      cards.appendChild(card);
    }
    board.appendChild(cards);

    board.setPluginData('toolId', BOARD_TOOL_ID);
    board.setPluginData('framecastSession', JSON.stringify(session));
    board.setRelaunchData({
      'edit-board': 'Edit cue board',
    });

    board.x = figma.viewport.center.x - board.width / 2;
    board.y = figma.viewport.center.y - board.height / 2;
    figma.currentPage.appendChild(board);
    figma.currentPage.selection = [board];
    figma.viewport.scrollAndZoomIntoView([board]);

    figma.ui.postMessage({ type: 'cueBoardCreated', frameId: board.id } satisfies CodeToUiMessage);
    figma.notify('Cue board created.');
  } catch (err) {
    figma.notify(`Could not create cue board: ${(err as Error).message}`);
  }
}

async function replayCue(nodeId: string, cueId: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.removed || !('visible' in node)) {
      figma.ui.postMessage({
        type: 'replayResult',
        cueId,
        ok: false,
        stale: true,
      } satisfies CodeToUiMessage);
      figma.notify('Cue target is missing.');
      return;
    }
    const sceneNode = node as SceneNode;
    figma.currentPage.selection = [sceneNode];
    figma.viewport.scrollAndZoomIntoView([sceneNode]);
    figma.ui.postMessage({
      type: 'replayResult',
      cueId,
      ok: true,
      stale: false,
    } satisfies CodeToUiMessage);
  } catch {
    figma.ui.postMessage({
      type: 'replayResult',
      cueId,
      ok: false,
      stale: true,
    } satisfies CodeToUiMessage);
    figma.notify('Could not navigate to cue target.');
  }
}

function relinkCue(cueId: string): void {
  const target = getCurrentCueTarget();
  figma.ui.postMessage({
    type: 'relinkResult',
    cueId,
    target,
  } satisfies CodeToUiMessage);
  if (!target) {
    figma.notify('Select a frame, section, or component to relink.');
  }
}

let selectionDebounce: number | undefined;

function postCueTarget(): void {
  figma.ui.postMessage({
    type: 'cueTarget',
    target: getCurrentCueTarget(),
  } satisfies CodeToUiMessage);
}

const COMPANION_BASE = 'http://localhost:49888';

async function pingCompanion(): Promise<boolean> {
  try {
    const res = await fetch(`${COMPANION_BASE}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

figma.showUI(__html__, {
  width: 240,
  height: 480,
  themeColors: true,
  propsKit: true,
} as ShowUIOptions & { propsKit?: boolean });
setPageRelaunchForDiscovery();

void pingCompanion().then((ok) => {
  figma.ui.postMessage({ type: 'companionHealth', ok } satisfies CodeToUiMessage);
});

if (figma.command === 'edit-board') {
  const sel = figma.currentPage.selection[0];
  if (sel?.type === 'FRAME' && sel.getPluginData('toolId') === BOARD_TOOL_ID) {
    figma.notify('Cue board selected — adjust cues in Framecast, then regenerate if needed.');
  }
}

figma.ui.onmessage = async (msg: UiToCodeMessage) => {
  if (msg.type === 'resize' && typeof msg.height === 'number') {
    const h = Math.max(160, Math.min(900, Math.round(msg.height)));
    figma.ui.resize(240, h);
    return;
  }
  if (msg.type === 'getInit') {
    const prefs = await loadPrefs();
    if (!prefs.sessionTitle) {
      prefs.sessionTitle = defaultSessionTitle();
    }
    const session = await loadSession();
    figma.ui.postMessage({
      type: 'init',
      prefs,
      pageName: figma.currentPage.name,
      session,
    } satisfies CodeToUiMessage);
    postCueTarget();
    return;
  }
  if (msg.type === 'savePrefs') {
    await savePrefs(msg.prefs);
    return;
  }
  if (msg.type === 'saveSession') {
    await saveSession(msg.session);
    return;
  }
  if (msg.type === 'getCueTarget') {
    postCueTarget();
    return;
  }
  if (msg.type === 'replayCue') {
    await replayCue(msg.nodeId, msg.cueId);
    return;
  }
  if (msg.type === 'relinkCue') {
    relinkCue(msg.cueId);
    return;
  }
  if (msg.type === 'generateCueBoard') {
    await generateCueBoard(msg.session);
    return;
  }
  if (msg.type === 'openExternal' && msg.url) {
    figma.openExternal(msg.url);
  }
};

figma.on('selectionchange', () => {
  if (selectionDebounce !== undefined) {
    clearTimeout(selectionDebounce);
  }
  selectionDebounce = setTimeout(() => {
    postCueTarget();
  }, 150) as unknown as number;
});

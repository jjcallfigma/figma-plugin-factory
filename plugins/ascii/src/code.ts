/**
 * Tool: ASCII Character Finder
 * Does: Search ASCII and common symbol characters, then paste the selection as a text layer.
 * Assumption: "ASCII" includes printable ASCII (32–126) plus frequently used Unicode symbols
 *   designers search for (arrows, bullets, math, currency, shapes).
 */

figma.showUI(__html__, { width: 240, height: 360, themeColors: true });

type Category =
  | 'basic'
  | 'arrows'
  | 'math'
  | 'currency'
  | 'punctuation'
  | 'symbols'
  | 'shapes'
  | 'greek';

type CharEntry = {
  char: string;
  name: string;
  code: number;
  category: Category;
};

type UiToCodeMessage =
  | { type: 'paste'; character: string; fontSize: number }
  | { type: 'resize'; height: number }
  | { type: 'notify'; message: string };

type CodeToUiMessage = { type: 'init'; characters: CharEntry[] };

function setPageRelaunchForDiscovery(): void {
  figma.currentPage.setRelaunchData({
    edit: 'Open this tool',
  });
}
setPageRelaunchForDiscovery();

const CHARACTERS: CharEntry[] = buildCharacterCatalog();

function buildCharacterCatalog(): CharEntry[] {
  const entries: CharEntry[] = [];

  const basicNames: Record<number, string> = {
    32: 'Space',
    33: 'Exclamation mark',
    34: 'Quotation mark',
    35: 'Number sign',
    36: 'Dollar sign',
    37: 'Percent sign',
    38: 'Ampersand',
    39: 'Apostrophe',
    40: 'Left parenthesis',
    41: 'Right parenthesis',
    42: 'Asterisk',
    43: 'Plus sign',
    44: 'Comma',
    45: 'Hyphen-minus',
    46: 'Full stop',
    47: 'Solidus',
    48: 'Digit zero',
    49: 'Digit one',
    50: 'Digit two',
    51: 'Digit three',
    52: 'Digit four',
    53: 'Digit five',
    54: 'Digit six',
    55: 'Digit seven',
    56: 'Digit eight',
    57: 'Digit nine',
    58: 'Colon',
    59: 'Semicolon',
    60: 'Less-than sign',
    61: 'Equals sign',
    62: 'Greater-than sign',
    63: 'Question mark',
    64: 'Commercial at',
    65: 'Latin capital letter A',
    66: 'Latin capital letter B',
    67: 'Latin capital letter C',
    68: 'Latin capital letter D',
    69: 'Latin capital letter E',
    70: 'Latin capital letter F',
    71: 'Latin capital letter G',
    72: 'Latin capital letter H',
    73: 'Latin capital letter I',
    74: 'Latin capital letter J',
    75: 'Latin capital letter K',
    76: 'Latin capital letter L',
    77: 'Latin capital letter M',
    78: 'Latin capital letter N',
    79: 'Latin capital letter O',
    80: 'Latin capital letter P',
    81: 'Latin capital letter Q',
    82: 'Latin capital letter R',
    83: 'Latin capital letter S',
    84: 'Latin capital letter T',
    85: 'Latin capital letter U',
    86: 'Latin capital letter V',
    87: 'Latin capital letter W',
    88: 'Latin capital letter X',
    89: 'Latin capital letter Y',
    90: 'Latin capital letter Z',
    91: 'Left square bracket',
    92: 'Reverse solidus',
    93: 'Right square bracket',
    94: 'Circumflex accent',
    95: 'Low line',
    96: 'Grave accent',
    97: 'Latin small letter a',
    98: 'Latin small letter b',
    99: 'Latin small letter c',
    100: 'Latin small letter d',
    101: 'Latin small letter e',
    102: 'Latin small letter f',
    103: 'Latin small letter g',
    104: 'Latin small letter h',
    105: 'Latin small letter i',
    106: 'Latin small letter j',
    107: 'Latin small letter k',
    108: 'Latin small letter l',
    109: 'Latin small letter m',
    110: 'Latin small letter n',
    111: 'Latin small letter o',
    112: 'Latin small letter p',
    113: 'Latin small letter q',
    114: 'Latin small letter r',
    115: 'Latin small letter s',
    116: 'Latin small letter t',
    117: 'Latin small letter u',
    118: 'Latin small letter v',
    119: 'Latin small letter w',
    120: 'Latin small letter x',
    121: 'Latin small letter y',
    122: 'Latin small letter z',
    123: 'Left curly bracket',
    124: 'Vertical line',
    125: 'Right curly bracket',
    126: 'Tilde',
  };

  for (let code = 32; code <= 126; code += 1) {
    entries.push({
      char: String.fromCharCode(code),
      name: basicNames[code] ?? `Code ${code}`,
      code,
      category: 'basic',
    });
  }

  const extras: Array<[string, string, number, Category]> = [
    ['\u00A0', 'No-break space', 0x00a0, 'symbols'],
    ['\u00A9', 'Copyright sign', 0x00a9, 'symbols'],
    ['\u00AE', 'Registered sign', 0x00ae, 'symbols'],
    ['\u2122', 'Trade mark sign', 0x2122, 'symbols'],
    ['\u00B0', 'Degree sign', 0x00b0, 'symbols'],
    ['\u00B5', 'Micro sign', 0x00b5, 'symbols'],
    ['\u00A7', 'Section sign', 0x00a7, 'symbols'],
    ['\u00B6', 'Pilcrow sign', 0x00b6, 'symbols'],
    ['\u2022', 'Bullet', 0x2022, 'symbols'],
    ['\u25E6', 'White bullet', 0x25e6, 'symbols'],
    ['\u25AA', 'Black small square', 0x25aa, 'shapes'],
    ['\u25AB', 'White small square', 0x25ab, 'shapes'],
    ['\u25CF', 'Black circle', 0x25cf, 'shapes'],
    ['\u25CB', 'White circle', 0x25cb, 'shapes'],
    ['\u25A0', 'Black square', 0x25a0, 'shapes'],
    ['\u25A1', 'White square', 0x25a1, 'shapes'],
    ['\u25B2', 'Black up-pointing triangle', 0x25b2, 'shapes'],
    ['\u25B3', 'White up-pointing triangle', 0x25b3, 'shapes'],
    ['\u25BC', 'Black down-pointing triangle', 0x25bc, 'shapes'],
    ['\u25C6', 'Black diamond', 0x25c6, 'shapes'],
    ['\u25C7', 'White diamond', 0x25c7, 'shapes'],
    ['\u2605', 'Black star', 0x2605, 'symbols'],
    ['\u2606', 'White star', 0x2606, 'symbols'],
    ['\u2713', 'Check mark', 0x2713, 'symbols'],
    ['\u2714', 'Heavy check mark', 0x2714, 'symbols'],
    ['\u2717', 'Ballot X', 0x2717, 'symbols'],
    ['\u2718', 'Heavy ballot X', 0x2718, 'symbols'],
    ['\u2190', 'Leftwards arrow', 0x2190, 'arrows'],
    ['\u2191', 'Upwards arrow', 0x2191, 'arrows'],
    ['\u2192', 'Rightwards arrow', 0x2192, 'arrows'],
    ['\u2193', 'Downwards arrow', 0x2193, 'arrows'],
    ['\u2194', 'Left right arrow', 0x2194, 'arrows'],
    ['\u2195', 'Up down arrow', 0x2195, 'arrows'],
    ['\u21D0', 'Leftwards double arrow', 0x21d0, 'arrows'],
    ['\u21D1', 'Upwards double arrow', 0x21d1, 'arrows'],
    ['\u21D2', 'Rightwards double arrow', 0x21d2, 'arrows'],
    ['\u21D3', 'Downwards double arrow', 0x21d3, 'arrows'],
    ['\u21D4', 'Left right double arrow', 0x21d4, 'arrows'],
    ['\u21E4', 'Leftwards arrow to bar', 0x21e4, 'arrows'],
    ['\u21E5', 'Rightwards arrow to bar', 0x21e5, 'arrows'],
    ['\u21A9', 'Leftwards arrow with hook', 0x21a9, 'arrows'],
    ['\u21AA', 'Rightwards arrow with hook', 0x21aa, 'arrows'],
    ['\u27F5', 'Long leftwards arrow', 0x27f5, 'arrows'],
    ['\u27F6', 'Long rightwards arrow', 0x27f6, 'arrows'],
    ['\u00B1', 'Plus-minus sign', 0x00b1, 'math'],
    ['\u00D7', 'Multiplication sign', 0x00d7, 'math'],
    ['\u00F7', 'Division sign', 0x00f7, 'math'],
    ['\u2260', 'Not equal to', 0x2260, 'math'],
    ['\u2264', 'Less-than or equal to', 0x2264, 'math'],
    ['\u2265', 'Greater-than or equal to', 0x2265, 'math'],
    ['\u2248', 'Almost equal to', 0x2248, 'math'],
    ['\u221E', 'Infinity', 0x221e, 'math'],
    ['\u2211', 'N-ary summation', 0x2211, 'math'],
    ['\u221A', 'Square root', 0x221a, 'math'],
    ['\u03C0', 'Greek small letter pi', 0x03c0, 'greek'],
    ['\u0394', 'Greek capital letter delta', 0x0394, 'greek'],
    ['\u03A9', 'Greek capital letter omega', 0x03a9, 'greek'],
    ['\u03B1', 'Greek small letter alpha', 0x03b1, 'greek'],
    ['\u03B2', 'Greek small letter beta', 0x03b2, 'greek'],
    ['\u03B3', 'Greek small letter gamma', 0x03b3, 'greek'],
    ['\u20AC', 'Euro sign', 0x20ac, 'currency'],
    ['\u00A3', 'Pound sign', 0x00a3, 'currency'],
    ['\u00A5', 'Yen sign', 0x00a5, 'currency'],
    ['\u20B9', 'Indian rupee sign', 0x20b9, 'currency'],
    ['\u00A2', 'Cent sign', 0x00a2, 'currency'],
    ['\u2018', 'Left single quotation mark', 0x2018, 'punctuation'],
    ['\u2019', 'Right single quotation mark', 0x2019, 'punctuation'],
    ['\u201C', 'Left double quotation mark', 0x201c, 'punctuation'],
    ['\u201D', 'Right double quotation mark', 0x201d, 'punctuation'],
    ['\u2013', 'En dash', 0x2013, 'punctuation'],
    ['\u2014', 'Em dash', 0x2014, 'punctuation'],
    ['\u2026', 'Horizontal ellipsis', 0x2026, 'punctuation'],
    ['\u00AB', 'Left-pointing double angle quotation mark', 0x00ab, 'punctuation'],
    ['\u00BB', 'Right-pointing double angle quotation mark', 0x00bb, 'punctuation'],
    ['\u2039', 'Single left-pointing angle quotation mark', 0x2039, 'punctuation'],
    ['\u203A', 'Single right-pointing angle quotation mark', 0x203a, 'punctuation'],
    ['\u00BD', 'Vulgar fraction one half', 0x00bd, 'symbols'],
    ['\u00BC', 'Vulgar fraction one quarter', 0x00bc, 'symbols'],
    ['\u00BE', 'Vulgar fraction three quarters', 0x00be, 'symbols'],
    ['\u2660', 'Black spade suit', 0x2660, 'symbols'],
    ['\u2665', 'Black heart suit', 0x2665, 'symbols'],
    ['\u2666', 'Black diamond suit', 0x2666, 'symbols'],
    ['\u2663', 'Black club suit', 0x2663, 'symbols'],
    ['\u2640', 'Female sign', 0x2640, 'symbols'],
    ['\u2642', 'Male sign', 0x2642, 'symbols'],
    ['\u26A0', 'Warning sign', 0x26a0, 'symbols'],
    ['\u2139', 'Information source', 0x2139, 'symbols'],
    ['\u231A', 'Watch', 0x231a, 'symbols'],
    ['\u231B', 'Hourglass', 0x231b, 'symbols'],
    ['\u2709', 'Envelope', 0x2709, 'symbols'],
    ['\u270F', 'Pencil', 0x270f, 'symbols'],
    ['\u2710', 'Upper blade', 0x2710, 'symbols'],
    ['\u274C', 'Cross mark', 0x274c, 'symbols'],
    ['\u274E', 'Negative squared cross mark', 0x274e, 'symbols'],
    ['\u2753', 'Black question mark ornament', 0x2753, 'symbols'],
    ['\u2757', 'Heavy exclamation mark symbol', 0x2757, 'symbols'],
    ['\u2795', 'Heavy plus sign', 0x2795, 'symbols'],
    ['\u2796', 'Heavy minus sign', 0x2796, 'symbols'],
    ['\u2797', 'Heavy division sign', 0x2797, 'symbols'],
    ['\u27A1', 'Black rightwards arrow', 0x27a1, 'arrows'],
    ['\u2B05', 'Leftwards black arrow', 0x2b05, 'arrows'],
    ['\u2B06', 'Upwards black arrow', 0x2b06, 'arrows'],
    ['\u2B07', 'Downwards black arrow', 0x2b07, 'arrows'],
    ['\u2934', 'Arrow pointing rightwards then curving upwards', 0x2934, 'arrows'],
    ['\u2935', 'Arrow pointing rightwards then curving downwards', 0x2935, 'arrows'],
    ['\u21B5', 'Downwards arrow with corner leftwards', 0x21b5, 'arrows'],
    ['\u21E7', 'Upwards white arrow', 0x21e7, 'arrows'],
    ['\u21E9', 'Downwards white arrow', 0x21e9, 'arrows'],
    ['\u21E8', 'Rightwards white arrow', 0x21e8, 'arrows'],
    ['\u21E6', 'Leftwards white arrow', 0x21e6, 'arrows'],
    ['\uFEFF', 'Zero width no-break space', 0xfeff, 'symbols'],
    ['\u200B', 'Zero width space', 0x200b, 'symbols'],
    ['\u200C', 'Zero width non-joiner', 0x200c, 'symbols'],
    ['\u200D', 'Zero width joiner', 0x200d, 'symbols'],
  ];

  for (const [char, name, code, category] of extras) {
    entries.push({ char, name, code, category });
  }

  return entries;
}

const FONT_CANDIDATES: FontName[] = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Roboto', style: 'Regular' },
];

async function loadFirstAvailableFont(): Promise<FontName> {
  for (const font of FONT_CANDIDATES) {
    try {
      await figma.loadFontAsync(font);
      return font;
    } catch {
      // try next
    }
  }
  throw new Error('Could not load a font for this character.');
}

async function pasteCharacter(character: string, fontSize: number): Promise<void> {
  try {
    if (!character) {
      figma.notify('Pick a character first.');
      return;
    }

    const font = await loadFirstAvailableFont();
    const text = figma.createText();
    text.fontName = font;
    text.fontSize = Math.max(8, Math.min(400, fontSize));
    text.characters = character;

    const center = figma.viewport.center;
    text.x = center.x - text.width / 2;
    text.y = center.y - text.height / 2;

    figma.currentPage.appendChild(text);
    figma.currentPage.selection = [text];
    text.setRelaunchData({ regenerate: 'Paste another character' });
    figma.viewport.scrollAndZoomIntoView([text]);

    const label = character === ' ' ? 'Space' : character;
    figma.notify(`Pasted "${label}" to the canvas.`);
  } catch (err) {
    figma.notify(`Paste failed: ${(err as Error).message}`);
  }
}

figma.ui.onmessage = async (msg: UiToCodeMessage) => {
  if (msg.type === 'paste') {
    await pasteCharacter(msg.character, msg.fontSize);
  } else if (msg.type === 'resize') {
    const h = Math.max(120, Math.min(900, Math.round(msg.height)));
    figma.ui.resize(240, h);
  } else if (msg.type === 'notify') {
    figma.notify(msg.message);
  }
};

const initMessage: CodeToUiMessage = { type: 'init', characters: CHARACTERS };
figma.ui.postMessage(initMessage);

if (figma.command === 'regenerate') {
  figma.notify('Search for a character and hit Paste.');
}

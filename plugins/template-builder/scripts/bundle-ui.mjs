import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'src/ui.template.html');
const outPath = path.join(root, 'src/ui.html');
const cssPath = path.join(root, 'src/vendor/fig.css');
const jsPath = path.join(root, 'src/vendor/fig.js');
// fig-editor registers <fig-fill-picker> (the Figma-style color popover used by
// fig-input-color picker="figma"). It lives in a separate bundle from fig.js;
// inline it after the core so the picker works. Optional for backward compat.
const editorCssPath = path.join(root, 'src/vendor/fig-editor.css');
const editorJsPath = path.join(root, 'src/vendor/fig-editor.js');

for (const file of [templatePath, cssPath, jsPath]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    console.error('Run: npm install');
    process.exit(1);
  }
}

const template = fs.readFileSync(templatePath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');
let js = fs.readFileSync(jsPath, 'utf8');

if (fs.existsSync(editorCssPath)) {
  css += '\n' + fs.readFileSync(editorCssPath, 'utf8');
}
if (fs.existsSync(editorJsPath)) {
  // fig.js and fig-editor.js are independent esbuild bundles; concatenating them
  // into one script scope collides their top-level identifiers. Wrap the editor
  // in its own IIFE — it interoperates via the global customElements registry.
  js += '\n;(function(){\n' + fs.readFileSync(editorJsPath, 'utf8') + '\n})();';
}

const html = template
  .replace('<!-- FIGUI3_CSS -->', () => css)
  .replace('<!-- FIGUI3_JS -->', () => js);

if (fs.existsSync(outPath) && fs.readFileSync(outPath, 'utf8') === html) {
  process.exit(0);
}

fs.writeFileSync(outPath, html);
console.log(`Bundled FigUI3 into ${outPath} (${Math.round(html.length / 1024)} KB)`);

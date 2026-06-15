import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'src/ui.template.html');
const outPath = path.join(root, 'src/ui.html');
const cssPath = path.join(root, 'src/vendor/fig.css');
const jsPath = path.join(root, 'src/vendor/fig.js');

for (const file of [templatePath, cssPath, jsPath]) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    console.error('Run: npm install');
    process.exit(1);
  }
}

const template = fs.readFileSync(templatePath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const html = template
  .replace('<!-- FIGUI3_CSS -->', () => css)
  .replace('<!-- FIGUI3_JS -->', () => js);

if (fs.existsSync(outPath) && fs.readFileSync(outPath, 'utf8') === html) {
  process.exit(0);
}

fs.writeFileSync(outPath, html);
console.log(`Bundled FigUI3 into ${outPath} (${Math.round(html.length / 1024)} KB)`);

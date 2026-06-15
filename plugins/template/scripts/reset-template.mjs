import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.join(templateRoot, '..');
const scaffoldRoot = path.join(repoRoot, 'scaffold', 'src');

const copies = [
  ['code.ts', 'code.ts'],
  ['ui.template.html', 'ui.template.html'],
];

for (const [from, to] of copies) {
  const src = path.join(scaffoldRoot, from);
  const dest = path.join(templateRoot, 'src', to);
  if (!fs.existsSync(src)) {
    console.error(`Missing scaffold file: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`Reset ${to} ← scaffold/src/${from}`);
}

execSync('npm run build', { cwd: templateRoot, stdio: 'inherit' });
console.log('Template reset complete. Re-run Plugins → Development → GenTool Comparison in Figma.');

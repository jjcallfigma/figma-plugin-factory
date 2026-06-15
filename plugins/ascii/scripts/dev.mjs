#!/usr/bin/env node
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'src/ui.template.html');

console.log('Running initial build…');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

console.log('\nWatching src/code.ts (tsc) and src/ui.template.html (bundle-ui).');
console.log('Re-run the tool in Figma after output files change.\n');

const tsc = spawn('npx', ['tsc', '--watch', '--preserveWatchOutput'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

let lastTemplateMtime = fs.statSync(templatePath).mtimeMs;

let bundleTimer;
function scheduleBundleUi() {
  clearTimeout(bundleTimer);
  bundleTimer = setTimeout(() => {
    try {
      const mtime = fs.statSync(templatePath).mtimeMs;
      // macOS fs.watch on a file also fires when siblings in src/ change (e.g. ui.html).
      if (mtime === lastTemplateMtime) return;
      lastTemplateMtime = mtime;
      execSync('npm run bundle-ui', { cwd: root, stdio: 'inherit' });
    } catch {
      // bundle-ui prints its own errors
    }
  }, 150);
}

if (!fs.existsSync(templatePath)) {
  console.error(`Missing ${templatePath}. Run npm install first.`);
  process.exit(1);
}

fs.watch(templatePath, scheduleBundleUi);

function shutdown() {
  tsc.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

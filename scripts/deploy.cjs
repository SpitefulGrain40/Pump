#!/usr/bin/env node
/**
 * Deploy script: copies dist/ to docs/, stamping sw.js with the current build date
 * so the service worker cache busts on every deploy.
 *
 * Usage: node scripts/deploy.cjs
 */

const fs = require('fs');
const path = require('path');

// Date + time so multiple deploys on the same day each get a unique service
// worker cache name (a date-only stamp collided and skipped SW re-activation).
const now = new Date();
const buildDate = now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + now.toISOString().slice(11, 19).replace(/:/g, '');
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const docsDir = path.join(root, 'docs');

// Prune stale hashed asset bundles before copying. Vite emits a new content
// hash per build, so without this docs/assets/ accumulates every old bundle
// from every past deploy. We only remove docs/assets/ (rebuilt from dist below)
// — sibling dirs like docs/test/ and docs/superpowers/ are left untouched.
const docsAssets = path.join(docsDir, 'assets');
if (fs.existsSync(docsAssets)) {
  fs.rmSync(docsAssets, { recursive: true, force: true });
  console.log('✓ pruned stale docs/assets/');
}

// Copy dist to docs
fs.cpSync(distDir, docsDir, { recursive: true });

// Stamp the service worker with today's date
const swPath = path.join(docsDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace('__BUILD_DATE__', buildDate);
  fs.writeFileSync(swPath, sw);
  console.log(`✓ sw.js stamped with pump-${buildDate}`);
}

// Also fix index.html name
const srcHtml = path.join(docsDir, 'index.src.html');
const indexHtml = path.join(docsDir, 'index.html');
if (fs.existsSync(srcHtml)) {
  fs.copyFileSync(srcHtml, indexHtml);
  console.log('✓ index.src.html → index.html');
}

// Ensure .nojekyll so GitHub Pages serves docs/ as static files. Without it,
// Pages runs Jekyll, whose Liquid parser chokes on `{{`/`{%` sequences that
// minified JS bundles routinely contain — the build then fails ("Page build
// failed") and the site silently keeps serving the previous deploy.
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');
console.log('✓ ensured docs/.nojekyll');

console.log(`✓ Deployed to docs/ (build ${buildDate})`);

#!/usr/bin/env node
/**
 * Deploy script: copies dist/ to docs/, stamping sw.js with the current build date
 * so the service worker cache busts on every deploy.
 *
 * Usage: node scripts/deploy.cjs
 */

const fs = require('fs');
const path = require('path');

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const docsDir = path.join(root, 'docs');

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

console.log(`✓ Deployed to docs/ (build ${buildDate})`);

#!/usr/bin/env node
/**
 * Test/sandbox deploy: builds dist/, copies into the gh-pages-test branch
 * under a /test subdirectory, and pushes. Live at:
 *   https://spitefulgrain40.github.io/Pump/test/
 *
 * Uses git worktree so we don't have to switch branches in the main checkout.
 *
 * Usage: node scripts/deploy-test.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const worktreeDir = path.join(root, '.gh-pages-test-worktree');
const targetSubdir = path.join(worktreeDir, 'test');

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const buildTime = new Date().toISOString();

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

// 1. Sanity: dist/ must exist
if (!fs.existsSync(distDir)) {
  console.error('✗ dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

// 2. Ensure index.html exists (Vite outputs index.src.html)
const srcHtml = path.join(distDir, 'index.src.html');
const indexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(srcHtml)) {
  fs.copyFileSync(srcHtml, indexHtml);
  console.log('✓ index.src.html → index.html');
}

// 3. Stamp sw.js with build date so service worker cache busts
const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace('__BUILD_DATE__', `${buildDate}-test`);
  fs.writeFileSync(swPath, sw);
  console.log(`✓ sw.js stamped with pump-${buildDate}-test`);
}

// 4. Set up git worktree on gh-pages-test
//    Remove stale worktree if it exists (e.g. from a previous failed run)
if (fs.existsSync(worktreeDir)) {
  try { run(`git worktree remove --force "${worktreeDir}"`); } catch {}
  if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
}

run('git fetch origin gh-pages-test');
run(`git worktree add "${worktreeDir}" gh-pages-test`);

// 5. Wipe existing test/ subdirectory (keep everything else in the branch intact)
if (fs.existsSync(targetSubdir)) {
  fs.rmSync(targetSubdir, { recursive: true, force: true });
}
fs.mkdirSync(targetSubdir, { recursive: true });

// 6. Copy dist/ → /test/
fs.cpSync(distDir, targetSubdir, { recursive: true });
console.log(`✓ dist → ${path.relative(root, targetSubdir)}`);

// 7. Commit + push
try {
  run('git add test', { cwd: worktreeDir });
  // --allow-empty: if dist hasn't changed, still create a marker commit
  run(`git -c user.email=deploy@pump.local -c user.name="Pump Deploy" commit -m "Test deploy ${buildTime}" --allow-empty`, { cwd: worktreeDir });
  run('git push origin gh-pages-test', { cwd: worktreeDir });
} finally {
  // 8. Clean up worktree
  try { run(`git worktree remove --force "${worktreeDir}"`); } catch {}
}

console.log('');
console.log('✓ Test deploy complete.');
console.log('  https://spitefulgrain40.github.io/Pump/test/');
console.log('  (GitHub Pages may take 30-60 seconds to refresh)');

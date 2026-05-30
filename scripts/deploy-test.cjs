#!/usr/bin/env node
/**
 * Test/sandbox deploy: builds dist/, copies into master:docs/test/, and
 * pushes master. Live at:
 *   https://spitefulgrain40.github.io/Pump/test/
 *
 * IMPORTANT — why this writes to master:
 *   GitHub Pages is configured to serve from `master:/docs/`. Both production
 *   (`/Pump/`) and the test sandbox (`/Pump/test/`) live under that same Pages
 *   source. To make the test URL update, the build artefacts MUST land in
 *   `master:docs/test/`. The orphan `gh-pages-test` branch is legacy and is
 *   no longer served by Pages.
 *
 *   This means deploying to test commits to master — but ONLY under
 *   `docs/test/`. `docs/index.html` (the production entrypoint) is never
 *   touched here, so `/Pump/` continues to serve whatever production was
 *   already serving. This matches the prior history of the repo
 *   (e.g. `f0ad636 "Add debug logging for SET_SCHEDULE parsing"`).
 *
 * Uses a git worktree so we don't have to switch the main checkout off the
 * feature branch.
 *
 * Usage: node scripts/deploy-test.cjs   (or `npm run deploy:test`)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const worktreeDir = path.join(root, '.deploy-master-worktree');
const targetSubdir = path.join(worktreeDir, 'docs', 'test');

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

// 3. Stamp sw.js with build date so the service worker cache busts
const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace('__BUILD_DATE__', `${buildDate}-test`);
  fs.writeFileSync(swPath, sw);
  console.log(`✓ sw.js stamped with pump-${buildDate}-test`);
}

// 4. Set up git worktree on master
//    Remove stale worktree if it exists (e.g. from a previous failed run)
if (fs.existsSync(worktreeDir)) {
  try { run(`git worktree remove --force "${worktreeDir}"`); } catch {}
  if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
}

run('git fetch origin master');
run(`git worktree add "${worktreeDir}" origin/master`);

// 4a. Move HEAD off detached state onto a local branch we can push from
run('git switch -C deploy-test-staging', { cwd: worktreeDir });

// 5. Wipe existing docs/test/ subdirectory (keep docs/ root intact — that's prod)
if (fs.existsSync(targetSubdir)) {
  fs.rmSync(targetSubdir, { recursive: true, force: true });
}
fs.mkdirSync(targetSubdir, { recursive: true });

// 6. Copy dist/ → docs/test/
fs.cpSync(distDir, targetSubdir, { recursive: true });
console.log(`✓ dist → ${path.relative(root, targetSubdir)}`);

// 7. Commit + push to master
try {
  run('git add docs/test', { cwd: worktreeDir });
  // Skip the commit entirely if nothing changed (no point spamming master)
  let hasChanges = true;
  try {
    execSync('git diff --cached --quiet', { cwd: worktreeDir });
    hasChanges = false;
  } catch { /* non-zero exit means there are staged changes */ }

  if (!hasChanges) {
    console.log('✓ No changes to deploy — test is already up to date.');
  } else {
    run(`git -c user.email=deploy@pump.local -c user.name="Pump Deploy" commit -m "Deploy to /test ${buildTime}"`, { cwd: worktreeDir });
    // Push the deploy-test-staging branch back to master
    run('git push origin HEAD:master', { cwd: worktreeDir });
  }
} finally {
  // 8. Clean up worktree
  try { run(`git worktree remove --force "${worktreeDir}"`); } catch {}
}

console.log('');
console.log('✓ Test deploy complete.');
console.log('  https://spitefulgrain40.github.io/Pump/test/');
console.log('  (GitHub Pages may take 30-60 seconds to refresh)');
console.log('  Hard-refresh / clear Pump cache on your phone if you still see old content');
console.log('  (Settings → Apps → Pump → Clear cache, or in Chrome: site settings → clear data)');

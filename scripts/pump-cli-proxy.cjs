#!/usr/bin/env node
/**
 * Local dev proxy — routes Pump Coach requests through the Claude CLI.
 * Uses your existing `claude` CLI session (no API key consumption).
 *
 * Usage: node scripts/pump-cli-proxy.js
 * Then set provider to "CLI (local)" in Pump Settings.
 */

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const PORT = 3141;

// Resolve the claude binary cross-platform. On Windows the npm-global wrapper is
// a .cmd (not spawnable with shell:false), so we target the real claude.exe
// inside the package; on unix the ~/.local/bin/claude launcher works directly.
// CLAUDE_PATH overrides everything.
function resolveClaudePath() {
  if (process.env.CLAUDE_PATH) return process.env.CLAUDE_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
        path.join(home, '.local/bin/claude.exe'),
      ]
    : [
        path.join(home, '.local/bin/claude'),
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
      ];
  return candidates.find(c => c && fs.existsSync(c)) || candidates[0];
}

const CLAUDE_PATH = resolveClaudePath();
// Isolate claude.exe from any CLAUDE.md or .claude/ in the proxy's cwd so it
// doesn't auto-discover and inject Pump's own dev-time instructions into
// Coach responses. We can't use --bare (which would prevent CLAUDE.md
// discovery) because --bare also disables OAuth/keychain auth — and the
// whole point of CLI provider is to use the user's OAuth subscription
// instead of an API key.
const SAFE_CWD = os.tmpdir();

const server = http.createServer((req, res) => {
  // CORS headers so the browser app can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/chat') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { messages = [], systemPrompt = '', model = 'claude-sonnet-4-6' } = payload;

    // Build conversation turns only (system prompt passed via --system flag)
    const parts = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'Assistant' : 'Human';
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      parts.push(`${role}: ${text}`);
    }
    parts.push('Assistant:');
    const prompt = parts.join('\n\n');

    // Guard against writing the response twice: a spawn failure fires BOTH the
    // 'error' and 'close' handlers, and the second writeHead used to crash the
    // whole proxy with ERR_HTTP_HEADERS_SENT.
    let responded = false;
    const sendError = (code, msg) => {
      if (responded || res.headersSent) return;
      responded = true;
      res.writeHead(code);
      res.end(JSON.stringify({ error: msg }));
    };

    const child = spawn(CLAUDE_PATH, [
      '--print',
      '--no-session-persistence',
      '--tools', '',
      '--model', model,
      '--output-format', 'text',
      '--system-prompt', systemPrompt || 'You are a helpful assistant.',
    ], {
      cwd: SAFE_CWD,           // prevents CLAUDE.md auto-discovery + .claude/settings.json hook loading
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let output = '';
    let errOutput = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { errOutput += chunk.toString(); });

    child.on('close', code => {
      if (responded || res.headersSent) return;
      if (code !== 0) {
        console.error(`[proxy] claude exited ${code}: ${errOutput}`);
        sendError(500, errOutput || `Claude exited with code ${code}`);
        return;
      }
      responded = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: output.trim() }));
    });

    child.on('error', err => {
      console.error('[proxy] spawn error:', err.message);
      sendError(500, err.message);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pump CLI proxy listening on http://localhost:${PORT}`);
  console.log(`Using claude at: ${CLAUDE_PATH}`);
  console.log('Set provider to "CLI (local)" in Pump Settings to use this.');
});

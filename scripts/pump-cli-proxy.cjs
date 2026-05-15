#!/usr/bin/env node
/**
 * Local dev proxy — routes Pump Coach requests through the Claude CLI.
 * Uses your existing `claude` CLI session (no API key consumption).
 *
 * Usage: node scripts/pump-cli-proxy.js
 * Then set provider to "CLI (local)" in Pump Settings.
 */

const http = require('http');
const { spawn } = require('child_process');
const PORT = 3141;

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

    const claudePath = process.env.CLAUDE_PATH ||
      `${process.env.USERPROFILE || process.env.HOME}/.local/bin/claude`;

    const child = spawn(claudePath, [
      '--print',
      '--bare',
      '--no-session-persistence',
      '--tools', '',
      '--model', model,
      '--output-format', 'text',
      '--system-prompt', systemPrompt || 'You are a helpful assistant.',
    ], {
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
      if (code !== 0) {
        console.error(`[proxy] claude exited ${code}: ${errOutput}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: errOutput || `Claude exited with code ${code}` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: output.trim() }));
    });

    child.on('error', err => {
      console.error('[proxy] spawn error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pump CLI proxy listening on http://localhost:${PORT}`);
  console.log(`Using claude at: ${process.env.CLAUDE_PATH || '~/.local/bin/claude'}`);
  console.log('Set provider to "CLI (local)" in Pump Settings to use this.');
});

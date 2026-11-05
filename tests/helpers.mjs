// Shared test helpers: start the mock Anthropic API, the PHP API and a static
// file server for the site, each on its own port, with a throwaway data dir.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

export const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
export const API_DIR = process.env.CLAN_API_DIR || path.join(ROOT, 'hostinger/clan-api');
export const ADMIN = 'Admin-Test-1';
export const CLAN = 'Test-Clan-Pw';

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(url); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('Server did not start: ' + url);
}

export async function startStack({ apiPort = 8787, mockPort = 8790, sitePort = 0, env = {} } = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'clan-api-data-'));
  const procs = [];
  const mock = spawn(process.execPath, [path.join(ROOT, 'tests/mock-anthropic.mjs')], {
    env: { ...process.env, MOCK_PORT: String(mockPort) }, stdio: 'ignore',
  });
  procs.push(mock);
  const php = spawn('php', ['-S', `127.0.0.1:${apiPort}`], {
    cwd: API_DIR,
    env: {
      ...process.env,
      CLAN_API_SECRETS: path.join(ROOT, 'tests/fixtures/secrets.test.php'),
      CLAN_API_DATA: dataDir,
      MOCK_ANTHROPIC: `http://127.0.0.1:${mockPort}`,
      ...env,
    },
    stdio: 'ignore',
  });
  procs.push(php);
  let site = null;
  if (sitePort) site = await serveStatic(ROOT, sitePort);
  await waitFor(`http://127.0.0.1:${mockPort}/__mock/requests`);
  await waitFor(`http://127.0.0.1:${apiPort}/status.php`);
  const api = `http://127.0.0.1:${apiPort}`;
  const mockUrl = `http://127.0.0.1:${mockPort}`;
  return {
    api, mockUrl, dataDir,
    siteUrl: site ? `http://127.0.0.1:${sitePort}` : null,
    async stop() {
      procs.forEach(p => p.kill());
      if (site) await new Promise(r => site.close(r));
      rmSync(dataDir, { recursive: true, force: true });
      cleanUploads();
    },
  };
}

/** Remove files the tests uploaded into hostinger/clan-api/files/. */
export function cleanUploads() {
  for (const folder of ['loadouts', 'callouts', 'members']) {
    const dir = path.join(API_DIR, 'files', folder);
    for (const name of readdirSync(dir)) {
      if (name === '.gitkeep') continue;
      rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
function serveStatic(root, port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

export async function call(api, file, { method = 'GET', body, admin, clan, form, origin } = {}) {
  const headers = {};
  if (admin) headers['X-Admin-Key'] = admin;
  if (clan) headers['X-Clan-Key'] = clan;
  if (origin) headers['Origin'] = origin;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`${api}/${file}`, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, data, headers: res.headers };
}

export function imageForm(fields, bytes, type = 'image/png', name = 'shot.png') {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('image', new Blob([bytes], { type }), name);
  return fd;
}

// A real 4×4 PNG (finfo + getimagesize accept it).
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAFElEQVQImWMMCDjDAANMDEgANwcAR6ABdAqC3SQAAAAASUVORK5CYII=',
  'base64',
);

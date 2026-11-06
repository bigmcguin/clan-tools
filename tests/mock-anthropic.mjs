// Minimal stand-in for the Anthropic Messages API, for local tests only.
// Answers POST /v1/messages with canned structured output per screenshot kind.
//   POST /__mock/next      {status, body}   → next /v1/messages call returns this instead (one-shot)
//   POST /__mock/fixture   {kind, data}     → replace the canned answer for a kind
//   GET  /__mock/requests                   → requests received so far (image data trimmed)
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.MOCK_PORT || 8790);
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/claude-answers.json', import.meta.url), 'utf8'));
const queue = [];
const seen = [];
const served = {};

function kindOf(body) {
  const props = body?.output_config?.format?.schema?.properties || {};
  if (props.events) return 'clan';
  if (props.uid) return 'profile';
  if (props.attachments) return 'loadout';
  return 'unknown';
}

function readBody(req) {
  return new Promise(resolve => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => resolve(s)); });
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(obj));
  };
  const raw = await readBody(req);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__mock/next' && req.method === 'POST') { queue.push(JSON.parse(raw)); return send(200, { ok: true }); }
  if (url.pathname === '/__mock/fixture' && req.method === 'POST') { const { kind, data } = JSON.parse(raw); fixtures[kind] = data; return send(200, { ok: true }); }
  if (url.pathname === '/__mock/requests') return send(200, seen);
  if (url.pathname === '/__mock/reset') { seen.length = 0; queue.length = 0; for (const k in served) delete served[k]; return send(200, { ok: true }); }
  if (url.pathname !== '/v1/messages' || req.method !== 'POST') return send(404, { type: 'error', error: { type: 'not_found_error', message: 'nope' } });

  let body;
  try { body = JSON.parse(raw); } catch { return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad json' } }); }
  const kind = kindOf(body);
  const trimmed = JSON.parse(JSON.stringify(body));
  for (const m of trimmed.messages || []) for (const c of m.content || []) if (c.source?.data) c.source.data = `<${c.source.data.length} b64 chars>`;
  seen.push({ headers: { auth: req.headers['authorization'] ? 'bearer' : (req.headers['x-api-key'] ? 'x-api-key' : 'none'), 'anthropic-version': req.headers['anthropic-version'], 'anthropic-beta': req.headers['anthropic-beta'] }, query: url.search, kind, body: trimmed });

  const key = req.headers['x-api-key'] || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (key !== 'sk-ant-test-key') {
    return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  }
  const next = queue.shift();
  if (next) return send(next.status, next.body, next.headers || {});
  const pool = fixtures[kind];
  const counter = (served[kind] = (served[kind] || 0) + 1);
  const data = Array.isArray(pool) ? pool[(counter - 1) % pool.length] : pool;
  if (!data) return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'unknown kind ' + kind } });
  return send(200, {
    id: 'msg_mock_' + seen.length, type: 'message', role: 'assistant', model: body.model,
    content: [{ type: 'text', text: JSON.stringify(data) }],
    stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 3210, output_tokens: 456, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock anthropic on http://127.0.0.1:${PORT}`));

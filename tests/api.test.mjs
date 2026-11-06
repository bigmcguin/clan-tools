// API tests: node --test tests/api.test.mjs
// Runs the PHP API (php -S) against a mock Anthropic server; no real Claude calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startStack, call, imageForm, TINY_PNG, ADMIN, CLAN, ROOT } from './helpers.mjs';

let stack;
const seed = JSON.parse(readFileSync(path.join(ROOT, 'data/members.json'), 'utf8'));

before(async () => { stack = await startStack({ apiPort: 8797, mockPort: 8798, env: { AI_CLAN_PER_HOUR: '3' } }); });
after(async () => { await stack?.stop(); });

test('status reports every check true', async () => {
  const { status, data } = await call(stack.api, 'status.php');
  assert.equal(status, 200);
  assert.equal(data.ok, true, JSON.stringify(data.checks));
  assert.equal(data.ai.enabled, true);
  assert.equal(data.rosterVersion, 0);
});

test('auth: wrong, right, case-insensitive clan, admin counts as clan', async () => {
  assert.equal((await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'admin' }, admin: 'nope' })).status, 401);
  assert.equal((await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'clan' }, clan: 'tEsT-cLaN-pW' })).data.role, 'clan');
  assert.equal((await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'clan' }, admin: ADMIN })).data.role, 'admin');
  assert.equal((await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'admin' }, clan: CLAN })).status, 401);
  assert.equal((await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'admin' } })).data.error, 'Admin password required');
});

test('roster: empty, publish seed, conflict, validation, history, restore', async () => {
  let r = await call(stack.api, 'roster.php');
  assert.equal(r.data.roster, null);

  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 0, members: seed.members, summary: 'Seed' }, clan: CLAN });
  assert.equal(r.status, 401, 'clan password cannot save the roster');

  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 0, members: seed.members, summary: 'Seed' }, admin: ADMIN });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.roster.version, 1);
  assert.equal(r.data.roster.members.length, seed.members.length);
  const billie = r.data.roster.members.find(m => m.uid === '7329424404814430209');
  assert.ok(billie.images.codm.startsWith('assets/members/'));

  // Stale base version → 409 with the current roster attached.
  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 0, members: seed.members }, admin: ADMIN });
  assert.equal(r.status, 409);
  assert.equal(r.data.roster.version, 1);

  // Validation: a bad UID and duplicate ids are refused with a clear message.
  const bad = structuredClone(seed.members); bad[0].uid = '12ab';
  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 1, members: bad }, admin: ADMIN });
  assert.equal(r.status, 400); assert.match(r.data.error, /UID must be digits/);
  const dup = structuredClone(seed.members); dup[1].id = dup[0].id;
  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 1, members: dup }, admin: ADMIN });
  assert.equal(r.status, 400); assert.match(r.data.error, /share the id/);
  const badDate = structuredClone(seed.members); badDate[0].joinDate = '31/02/26';
  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 1, members: badDate }, admin: ADMIN });
  assert.equal(r.status, 400); assert.match(r.data.error, /date like/);

  // A real edit → v2, then restore v1 → v3 equal to v1.
  const edited = structuredClone(seed.members); edited[0].note = 'Edited in test';
  r = await call(stack.api, 'roster.php', { method: 'POST', body: { baseVersion: 1, members: edited, summary: 'Note added' }, admin: ADMIN });
  assert.equal(r.data.roster.version, 2);
  r = await call(stack.api, 'history.php', { admin: ADMIN });
  assert.deepEqual(r.data.versions.map(v => v.version), [2, 1]);
  assert.equal(r.data.versions[0].summary, 'Note added');
  r = await call(stack.api, 'history.php', { method: 'POST', body: { restoreVersion: 1, baseVersion: 2 }, admin: ADMIN });
  assert.equal(r.data.roster.version, 3);
  assert.equal(r.data.roster.members[0].note, seed.members[0].note);
  assert.equal((await call(stack.api, 'history.php', { clan: CLAN })).status, 401);
});

test('ai: clan log read by admin returns cleaned events with valid match ids', async () => {
  const r = await call(stack.api, 'ai.php', { method: 'POST', admin: ADMIN, form: imageForm({ kind: 'clan' }, TINY_PNG) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.result.screen, 'clan_log');
  assert.equal(r.data.result.events.length, 6);
  assert.equal(r.data.usage.inputTokens, 3210);
  const brazy = r.data.result.events.find(e => e.name === 'TB | Brazy');
  assert.equal(brazy.matchId, '6788874149353160705');

  const sent = await (await fetch(`${stack.mockUrl}/__mock/requests`)).json();
  const last = sent.at(-1);
  assert.equal(last.body.model, 'claude-opus-5-5');
  assert.equal(last.body.output_config.format.type, 'json_schema');
  assert.equal(last.body.fallbacks, 'default');
  assert.equal(last.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.match(last.body.messages[0].content[1].text, /ƬƁ丨Ɓillieঐ/, 'roster is included for matching');
});

test('ai: clan reads need admin; loadout works with clan password', async () => {
  let r = await call(stack.api, 'ai.php', { method: 'POST', clan: CLAN, form: imageForm({ kind: 'clan' }, TINY_PNG) });
  assert.equal(r.status, 401);
  r = await call(stack.api, 'ai.php', { method: 'POST', clan: CLAN, form: imageForm({ kind: 'loadout' }, TINY_PNG) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.result.weapon, 'DL Q33');
  assert.equal(r.data.result.weaponClass, 'Sniper');
  assert.equal(r.data.result.stats.damage, 92);
  r = await call(stack.api, 'ai.php', { method: 'POST', clan: CLAN, form: imageForm({ kind: 'nope' }, TINY_PNG) });
  assert.equal(r.status, 400);
});

test('ai: profile with a UID already on the roster is matched by UID', async () => {
  // Third profile fixture is Kodak with his real roster UID; serve it next.
  const kodak = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/claude-answers.json'), 'utf8')).profile[2];
  await fetch(`${stack.mockUrl}/__mock/fixture`, { method: 'POST', body: JSON.stringify({ kind: 'profile', data: kodak }) });
  const r = await call(stack.api, 'ai.php', { method: 'POST', admin: ADMIN, form: imageForm({ kind: 'profile' }, TINY_PNG) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.result.uid, '7160109978278887425');
  assert.equal(r.data.result.matchId, '7160109978278887425');
  assert.equal(r.data.result.matchConfidence, 'high');
});

test('ai: Claude errors become friendly messages', async () => {
  const cases = [
    [{ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }, 503, /busy/],
    [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'image too big' } } }, 502, /rejected the request: .*image too big/],
    [{ status: 402, body: { type: 'error', error: { type: 'billing_error', message: 'no credit' } } }, 502, /out of credit/],
    [{ status: 200, body: { id: 'x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }, 422, /declined/],
  ];
  for (const [next, status, msg] of cases) {
    // 529 is retried by the SDK (2 retries), so queue enough copies.
    const copies = next.status >= 500 ? 3 : 1;
    for (let i = 0; i < copies; i++) await fetch(`${stack.mockUrl}/__mock/next`, { method: 'POST', body: JSON.stringify(next) });
    const r = await call(stack.api, 'ai.php', { method: 'POST', admin: ADMIN, form: imageForm({ kind: 'clan' }, TINY_PNG) });
    assert.equal(r.status, status, JSON.stringify(r.data));
    assert.match(r.data.error, msg);
  }
});

test('ai: per-device hourly limit for clan reads', async () => {
  // AI_CLAN_PER_HOUR=3 and one loadout read already happened above.
  let last;
  for (let i = 0; i < 3; i++) last = await call(stack.api, 'ai.php', { method: 'POST', clan: CLAN, form: imageForm({ kind: 'loadout' }, TINY_PNG) });
  assert.equal(last.status, 429);
  assert.match(last.data.error, /Too many screenshots/);
});

test('ai: non-images are refused before any Claude call', async () => {
  const r = await call(stack.api, 'ai.php', { method: 'POST', admin: ADMIN, form: imageForm({ kind: 'clan' }, Buffer.from('<?php echo 1;'), 'image/png', 'x.png') });
  assert.equal(r.status, 415);
});

test('images: member image upload needs admin, then list and delete', async () => {
  const id = seed.members[0].id;
  let r = await call(stack.api, 'upload.php', { method: 'POST', clan: CLAN, form: imageForm({ folder: 'members', member: id, slot: 'roblox' }, TINY_PNG) });
  assert.equal(r.status, 401, 'clan password cannot change member images by default');
  r = await call(stack.api, 'upload.php', { method: 'POST', admin: ADMIN, form: imageForm({ folder: 'members', member: id, slot: 'roblox' }, TINY_PNG) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.url, new RegExp(`/files/members/${id}/roblox\\.png\\?v=`));
  r = await call(stack.api, 'list.php');
  assert.ok(r.data.members[id].roblox);
  const img = await fetch(r.data.members[id].roblox);
  assert.equal(img.status, 200);
  r = await call(stack.api, 'delete.php', { method: 'POST', admin: ADMIN, body: { url: r.data.members[id].roblox } });
  assert.equal(r.data.deleted, true);

  r = await call(stack.api, 'upload.php', { method: 'POST', clan: CLAN, form: imageForm({ folder: 'loadouts' }, TINY_PNG) });
  assert.equal(r.status, 200);
  assert.match(r.data.url, /\/files\/loadouts\/\d+-[a-f0-9]+\.png$/);
  r = await call(stack.api, 'delete.php', { method: 'POST', clan: CLAN, body: { url: r.data.url } });
  assert.equal(r.data.deleted, true);
  r = await call(stack.api, 'delete.php', { method: 'POST', clan: CLAN, body: { url: 'https://evil.example/files/../config.php' } });
  assert.equal(r.status, 400);
});

test('cors: allowed origin gets headers, unknown origin cannot write', async () => {
  const pre = await fetch(`${stack.api}/roster.php`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const r = await call(stack.api, 'roster.php', { method: 'POST', origin: 'https://evil.example', admin: ADMIN, body: { baseVersion: 3, members: [] } });
  assert.equal(r.status, 403);
});

test('usage summarises reads for the admin', async () => {
  const r = await call(stack.api, 'usage.php', { admin: ADMIN });
  assert.equal(r.status, 200);
  assert.ok(r.data.usage.today.reads >= 3);
  assert.ok(r.data.usage.today.estUsd > 0);
});

test('wrong-password lockout after repeated failures', async () => {
  let r;
  for (let i = 0; i < 9; i++) r = await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'admin' }, admin: 'guess' + i });
  assert.equal(r.status, 429);
  // Even the right password is refused while locked out.
  r = await call(stack.api, 'auth.php', { method: 'POST', body: { role: 'admin' }, admin: ADMIN });
  assert.equal(r.status, 429);
});

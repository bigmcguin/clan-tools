// Browser tests: node --test tests/e2e.test.mjs
// Real pages + real PHP API + mock Claude + in-memory Firestore stand-in.
// Needs Playwright with Chromium (preinstalled in Claude Code cloud sessions).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { startStack, TINY_PNG, ROOT, API_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

let stack, browser;
before(async () => {
  stack = await startStack({ apiPort: 8817, mockPort: 8818, sitePort: 8080 });
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await stack?.stop(); });

const FIXTURE_ROSTER = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/roster-2026-09-30.json'), 'utf8'));

async function openPage(file, { apiBase, keys = {}, bundled = FIXTURE_ROSTER, seedLoadouts } = {}) {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  // The site's bundled roster: a frozen fixture unless a test supplies one.
  await context.route('**/data/members.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(bundled) }));
  // Offline-friendly: Firebase from the local stand-in, no web fonts.
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({
    contentType: 'text/javascript',
    body: readFileSync(path.join(ROOT, 'tests/stubs', route.request().url().split('/').pop())),
  }));
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  if (seedLoadouts) {
    // Pre-existing Firestore documents for the in-memory stand-in.
    await context.addInitScript(docs => {
      const ts = ms => ({ __ms: ms, toMillis: () => ms, toDate: () => new Date(ms) });
      globalThis.__fsStores = { loadouts: Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, { ...d, createdAt: ts(d.createdMs || 1) }])) };
    }, seedLoadouts);
  }
  await context.route('https://fonts.gstatic.com/**', r => r.abort());
  await context.addInitScript(({ base, keys }) => {
    localStorage.setItem('tb-api-base', base);
    for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v);
  }, { base: apiBase || stack.api, keys });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${stack.siteUrl}/${file}`);
  return { page, errors, context };
}

const shot = name => ({ name, mimeType: 'image/png', buffer: TINY_PNG });
const pill = page => page.textContent('#syncPill');
const waitPill = (page, text) => page.waitForFunction(t => document.querySelector('#syncPill').textContent.includes(t), text);

test('members: publish, clan-log screenshots, profiles, edit, history', async () => {
  const { page, errors, context } = await openPage('members.html');
  await waitPill(page, 'Not published');
  assert.equal(await page.locator('.status-tab.active .count').textContent(), '20');

  // Unlock with the admin password via the dialog (wrong one first).
  await page.click('.admin-toggle');
  await page.click('#unlockBtn');
  await page.fill('.capi-box input', 'wrong');
  await page.click('.capi-box .go');
  await page.waitForSelector('.capi-msg.err');
  await page.fill('.capi-box input', 'Admin-Test-1');
  await page.click('.capi-box .go');
  await page.waitForSelector('#adminPanel:not([hidden])');

  await page.click('#publishSeedBtn');
  await waitPill(page, 'v1');

  // Two clan-log screenshots → 12 rows, 9 ticked → apply.
  await page.setInputFiles('#clanShotsInput', [shot('log-1.png'), shot('log-2.png')]);
  await page.waitForFunction(() => document.querySelectorAll('#clanShots .shot.ok').length === 2);
  await page.waitForFunction(() => !/Still reading/.test(document.querySelector('#clanPlan .plan-summary')?.textContent || 'Still reading'));
  assert.equal(await page.locator('#clanPlan .plan-row').count(), 12);
  assert.equal(await page.locator('#clanPlan .plan-row [data-check]:checked').count(), 9);
  // Untick Kodak's departure, then apply the rest.
  await page.locator('#clanPlan .plan-row', { hasText: 'TB | Kodak' }).locator('[data-check]').uncheck();
  await page.click('#clanPlan [data-apply]');
  await waitPill(page, 'v2');
  assert.equal(await page.locator('.status-tab.active .count').textContent(), '24');

  // Profile screenshots: point DRƐW at Masonakk7, apply.
  await page.setInputFiles('#profileShotsInput', [shot('p1.png'), shot('p2.png'), shot('p3.png')]);
  await page.waitForFunction(() => document.querySelectorAll('#profileShots .shot.ok').length === 3);
  const drew = page.locator('#profilePlan .plan-row', { hasText: 'DRƐW' });
  const masonId = await drew.locator('select option', { hasText: 'Masonakk7' }).getAttribute('value');
  await drew.locator('select').selectOption(masonId);
  await page.waitForFunction(() => /Rename Masonakk7/.test(document.querySelector('#profilePlan').textContent));
  await page.click('#profilePlan [data-apply]');
  await waitPill(page, 'v3');
  await page.fill('#searchInput', 'masonakk7');
  assert.equal(await page.locator('.member-row .member-name').textContent(), 'TB | DRƐW');
  assert.match(await page.locator('.member-row').textContent(), /7000000000000000001/);

  // Edit by hand: give Zuka a slot.
  await page.fill('#searchInput', 'zuka');
  await page.click('.member-row .edit-btn');
  await page.fill('#editForm [name=slot]', '49');
  await page.click('#saveMemberBtn');
  await waitPill(page, 'v4');
  assert.equal(await page.locator('.member-row .slot-badge').textContent(), '49');

  // History: restore v1 → v5 with the original 20 active.
  await page.fill('#searchInput', '');
  await page.click('#historyTool > summary');
  await page.waitForSelector('#historyList .history-row');
  assert.equal(await page.locator('#historyList .history-row').count(), 4);
  page.once('dialog', d => d.accept());
  await page.click('#historyList [data-restore="1"]');
  await waitPill(page, 'v5');
  assert.equal(await page.locator('.status-tab.active .count').textContent(), '20');
  assert.deepEqual(errors, []);
  await context.close();
});

test('members: reference image upload as admin', async () => {
  const { page, errors, context } = await openPage('members.html', { keys: { 'tb-admin-key': 'Admin-Test-1' } });
  await waitPill(page, 'Live');
  await page.fill('#searchInput', 'billie');
  await page.click('.member-row .refs-btn');
  await page.waitForSelector('#refModal.open');
  assert.equal(await page.locator('#refGrid .ref-thumb').count(), 2, 'bundled CODM + Minecraft sheets show');
  await page.setInputFiles('#refGrid input[data-slot="roblox"]', shot('roblox.png'));
  await page.waitForFunction(() => document.querySelectorAll('#refGrid .ref-thumb').length === 3);
  const src = await page.locator('#refGrid .ref-card', { hasText: 'Roblox' }).locator('img').getAttribute('src');
  assert.match(src, /\/files\/members\/7329424404814430209\/roblox\.png\?v=/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts: screenshot → Claude fills the form → saved with date, owner and image', async () => {
  const { page, errors, context } = await openPage('loadouts.html');
  await waitPill(page, 'Live');
  await page.click('#addToggle');
  await page.setInputFiles('#fImage', { name: 'Screenshot_20261028-191502.png', mimeType: 'image/png', buffer: TINY_PNG });
  // No password needed to add a loadout: Claude reads it straight away.
  await page.waitForSelector('#aiStatus.ok');
  assert.equal(await page.locator('.capi-box').count(), 0, 'no password dialog');
  assert.equal(await page.locator('.ld-edit-btn, .ld-delete-btn').count(), 0, 'edit/delete hidden for non-admins');
  assert.equal(await page.locator('#codeTool').isHidden(), true, 'the build-code finder is admin only');
  assert.equal(await page.inputValue('#fWeapon'), 'DL Q33');
  assert.equal(await page.inputValue('#fClass'), 'Sniper');
  assert.equal(await page.inputValue('#fDamage'), '92');
  assert.equal(await page.inputValue('#fDate'), '2026-10-28', 'date comes from the screenshot file name');
  await page.fill('#fOwner', 'ƬƁ丨Ɓillieঐ');
  await page.click('#generateBtn');
  await page.waitForSelector('.loadout .ld-weapon');
  const saved = await page.evaluate(() => Object.values(globalThis.__fsStores.loadouts)[0]);
  assert.equal(saved.loadoutDate, '2026-10-28');
  assert.equal(saved.ownerId, '7329424404814430209');
  assert.equal(saved.buildName, 'Remeber me?');
  assert.match(saved.imageUrl, /\/files\/loadouts\/\d+-[a-f0-9]+\.jpg$/);
  assert.match(await page.textContent('.loadout .ld-date'), /28 Oct 2026/);
  await page.fill('#searchInput', 'billie');
  assert.equal(await page.locator('.loadout').count(), 1, 'search by plain name finds the fancy-Unicode owner');
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts: stats over 100 and the Gunsmith build code are filled in, saved and shown', async () => {
  const { page, errors, context } = await openPage('loadouts.html');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: stack.siteUrl });
  await waitPill(page, 'Live');
  const answer = {
    screen: 'gunsmith', weapon: 'Static-HV', weaponClass: 'SMG', buildCode: 'Static-HV-1M2A4E5I8C', buildName: '', blueprint: '',
    attachments: { muzzle: 'VT-7 Spiritfire Suppressor', barrel: 'Auger 840 Light Barrel', optic: '', stock: 'No Stock', laser: '', underbarrel: '', ammunition: '', rearGrip: 'Warcat 90 Grip', perk: 'Akimbo' },
    stats: { damage: 27, fireRate: 111, accuracy: 28, mobility: 101, range: 47, control: 20 },
    playerName: '', notes: 'Ammunition slot not visible.',
  };
  await fetch(`${stack.mockUrl}/__mock/next`, { method: 'POST', body: JSON.stringify({ status: 200, body: {
    id: 'msg_hv', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(answer) }],
  } }) });
  await page.click('#addToggle');
  await page.setInputFiles('#fImage', shot('gunsmith.png'));
  await page.waitForSelector('#aiStatus.ok');
  assert.equal(await page.inputValue('#fFireRate'), '111');
  assert.equal(await page.inputValue('#fMobility'), '101');
  assert.equal(await page.inputValue('#fBuildCode'), 'Static-HV-1M2A4E5I8C');
  assert.match(await page.textContent('#aiStatus .ai-note'), /Ammunition slot not visible/);
  assert.equal(await page.locator('#fOwner.needs').count(), 1, 'the missing name is highlighted');
  await page.fill('#fOwner', 'Spaceboi');
  await page.click('#generateBtn');
  await page.waitForSelector('.loadout .ld-code');
  const saved = await page.evaluate(() => Object.values(globalThis.__fsStores.loadouts).find(l => l.weapon === 'Static-HV'));
  assert.equal(saved.stats.fireRate, 111);
  assert.equal(saved.stats.mobility, 101);
  assert.equal(saved.buildCode, 'Static-HV-1M2A4E5I8C');
  // The card shows the real numbers; only the bar stops at full.
  const over = page.locator('.loadout .ld-stat.over');
  assert.equal(await over.count(), 2);
  assert.match(await over.first().textContent(), /Fire rate\s*111/);
  assert.equal(await over.first().locator('.ld-stat-fill').getAttribute('style'), 'width:100%');
  // The build code is the card's only copy button (no per-card Discord copy).
  assert.equal(await page.locator('.loadout .ld-copy-btn').count(), 0);
  // Tapping the code copies it; the code is searchable.
  await page.click('.loadout .ld-code');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Static-HV-1M2A4E5I8C');
  await page.fill('#searchInput', '1m2a4e5i8c');
  assert.equal(await page.locator('.loadout').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts: a build code saved in the build name by an older version is shown as a code', async () => {
  const { page, errors, context } = await openPage('loadouts.html', { seedLoadouts: { hemlock: {
    owner: 'Spaceboi', weapon: 'ISO Hemlock', weaponClass: 'AR', buildName: 'ISO Hemlock-1C2D4B6A8A', attachments: {}, stats: { fireRate: 60 },
    added: '06/11/26', loadoutDate: '2026-09-07', createdMs: 1793945256865,
  } } });
  await page.waitForSelector('.loadout .ld-code');
  assert.equal(await page.getAttribute('.loadout .ld-code', 'data-code'), 'ISO Hemlock-1C2D4B6A8A');
  assert.equal(await page.locator('.loadout .ld-build').count(), 0, 'not shown twice as a build name');
  assert.deepEqual(errors, []);
  await context.close();
});

test('callouts: opening the form asks the server for the clan password', async () => {
  const { page, errors, context } = await openPage('callouts.html');
  await page.waitForFunction(() => document.querySelector('#syncPill').textContent.includes('Live'));
  await page.click('#addToggle');
  await page.waitForSelector('.capi-box');
  await page.fill('.capi-box input', 'test-clan-pw');
  await page.click('.capi-box .go');
  await page.waitForSelector('#addForm.open');
  assert.ok(await page.locator('#lockPill.show').count());
  assert.deepEqual(errors, []);
  await context.close();
});

test('members: falls back to the bundled roster when the clan server is down', async () => {
  const { page, context } = await openPage('members.html', { apiBase: 'http://127.0.0.1:9' });
  await waitPill(page, 'Offline copy');
  assert.equal(await page.locator('.status-tab.active .count').textContent(), '20');
  await page.click('.admin-toggle');
  assert.match(await page.textContent('#gateNote'), /not reachable/);
  await context.close();
});

test('members: a prepared roster update loads with one tap and can be undone', async () => {
  const prepared = JSON.parse(readFileSync(path.join(ROOT, 'data/members.json'), 'utf8'));
  prepared.updatedAt = '2099-01-01T00:00:00Z'; // newer than anything on the test server
  const { page, errors, context } = await openPage('members.html', { keys: { 'tb-admin-key': 'Admin-Test-1' }, bundled: prepared });
  await waitPill(page, 'Live');
  await page.click('.admin-toggle');
  await page.waitForSelector('#bundleNotice:not([hidden])');
  assert.match(await page.textContent('#bundleNotice'), /23 active/);
  page.once('dialog', d => d.accept());
  await page.click('#loadBundleBtn');
  await page.waitForFunction(() => document.querySelector('#bundleNotice').hidden);
  assert.equal(await page.locator('.status-tab.active .count').textContent(), '23');
  await page.fill('#searchInput', 'masonakk7');
  assert.equal(await page.locator('.member-row .member-name').textContent(), 'TB | DRƐW');
  assert.match(await page.locator('.member-row').textContent(), /7677900804855889921/);
  await page.fill('#searchInput', '');
  assert.equal(await page.locator('.member-row .uid-btn.missing').count(), 0, 'every active member has a UID');
  // Reloading must not offer the same update again.
  await page.reload();
  await waitPill(page, 'Live');
  await page.click('.admin-toggle');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#bundleNotice').isHidden(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts: screenshots saved on the retired stridlabs.com host load from the clan server', async () => {
  // The file has been copied into the API's files/loadouts folder under its old name.
  const name = '1789984997950-7f9dac.jpg';
  execFileSync('php', ['-r', `imagejpeg(imagecreatetruecolor(12, 8), '${path.join(API_DIR, 'files/loadouts', name)}');`]);
  const { page, errors, context } = await openPage('loadouts.html', { seedLoadouts: { legacy1: {
    owner: 'Spaceboi', weapon: 'AK117', weaponClass: 'AR', attachments: {}, stats: {}, added: '21/09/26',
    imageUrl: `https://stridlabs.com/clan-img/files/loadouts/${name}`, createdMs: 1789984997950,
  } } });
  await page.waitForSelector('.loadout .ld-image');
  const img = page.locator('.loadout .ld-image');
  assert.equal(await img.getAttribute('src'), `${stack.api}/files/loadouts/${name}`);
  await page.waitForFunction(() => document.querySelector('.loadout .ld-image')?.naturalWidth > 0);
  assert.match(await page.textContent('.loadout .ld-date'), /21 Sept? 2026/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts still load when the browser holds an older clan-api.js (cache skew after an update)', async () => {
  const stale = readFileSync(path.join(ROOT, 'assets/clan-api.js'), 'utf8').replace('fixImageUrl(url) {', 'retiredFixImageUrl(url) {');
  const { page, errors, context } = await openPage('loadouts.html', { seedLoadouts: { old1: {
    owner: 'Spaceboi', weapon: 'AK117', weaponClass: 'AR', attachments: {}, stats: {}, added: '21/09/26',
    imageUrl: 'https://stridlabs.com/clan-img/files/loadouts/1789984997950-7f9dac.jpg', createdMs: 1789984997950,
  } } });
  await context.route('**/assets/clan-api.js*', route => route.fulfill({ contentType: 'text/javascript', body: stale }));
  await page.reload();
  await page.waitForFunction(() => /Live/.test(document.querySelector('#syncPill').textContent));
  assert.equal(await page.locator('.loadout').count(), 1);
  assert.equal(await page.evaluate(() => typeof window.ClanAPI.fixImageUrl), 'undefined', 'the stale script really is in use');
  assert.deepEqual(errors, []);
  await context.close();
});

test('loadouts: editing and deleting need the admin password (the clan password is not enough)', async () => {
  const { page, errors, context } = await openPage('loadouts.html', { seedLoadouts: { mine: {
    owner: 'TB | Zuka', weapon: 'Type 25', weaponClass: 'AR', attachments: {}, stats: {}, added: '01/11/26', createdMs: 1793500000000,
  } } });
  await page.waitForSelector('.loadout');
  assert.equal(await page.locator('.ld-delete-btn').count(), 0);
  assert.match(await page.textContent('#lockPill'), /🔒 Admin/);
  // The clan password is refused for admin.
  await page.click('#lockPill');
  await page.fill('.capi-box input', 'Test-Clan-Pw');
  await page.click('.capi-box .go');
  await page.waitForSelector('.capi-msg.err');
  await page.fill('.capi-box input', 'Admin-Test-1');
  await page.click('.capi-box .go');
  await page.waitForSelector('.ld-delete-btn');
  assert.match(await page.textContent('#lockPill'), /🔓 Admin/);
  page.once('dialog', d => d.accept());
  await page.click('.ld-delete-btn');
  await page.waitForFunction(() => document.querySelectorAll('.loadout').length === 0);
  assert.equal(await page.evaluate(() => Object.keys(globalThis.__fsStores.loadouts).length), 0);
  // Tapping the pill locks again and hides the buttons.
  await page.click('#lockPill');
  assert.match(await page.textContent('#lockPill'), /🔒 Admin/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('members: unlocking admin there also unlocks loadout editing', async () => {
  const { page, context } = await openPage('loadouts.html', { keys: { 'tb-admin-key': 'Admin-Test-1' }, seedLoadouts: { x: {
    owner: 'Spaceboi', weapon: 'AK117', weaponClass: 'AR', attachments: {}, stats: {}, added: '01/11/26', createdMs: 1793500000000,
  } } });
  await page.waitForSelector('.loadout .ld-edit-btn');
  assert.match(await page.textContent('#lockPill'), /🔓 Admin/);
  await context.close();
});

test('loadouts: admin has Claude find build codes for older loadouts, checks them, then saves', async () => {
  const name = '1789985005238-95b52f.jpg';
  const jpeg = path.join(API_DIR, 'files/loadouts', name);
  execFileSync('php', ['-r', `imagejpeg(imagecreatetruecolor(12, 8), '${jpeg}');`]);
  const { page, errors, context } = await openPage('loadouts.html', { keys: { 'tb-admin-key': 'Admin-Test-1' }, seedLoadouts: {
    sten: { owner: 'Locetti', weapon: 'Sten', weaponClass: 'SMG', attachments: {}, stats: { damage: 30, fireRate: 100, mobility: 80 },
      added: '11/05/26', imageUrl: `https://stridlabs.com/clan-img/files/loadouts/${name}`, createdMs: 1789985005238 },
    gone: { owner: 'Billie', weapon: 'LW3-Tundra', weaponClass: 'Sniper', attachments: {}, stats: {},
      added: '11/05/26', imageUrl: 'https://stridlabs.com/clan-img/files/loadouts/1789984999999-000000.jpg', createdMs: 1789984999999 },
    coded: { owner: 'Spaceboi', weapon: 'Static-HV', weaponClass: 'SMG', buildCode: 'Static-HV-1M2A4E5I8C', attachments: {}, stats: {},
      added: '06/11/26', imageUrl: `https://stridlabs.com/clan-img/files/loadouts/${name}`, createdMs: 1793944866984 },
  } });
  // On Hostinger, files/.htaccess lets the page fetch screenshots; PHP's test server ignores .htaccess.
  await context.route(`**/files/loadouts/${name}`, route => route.fulfill({
    contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' }, body: readFileSync(jpeg),
  }));
  await context.route('**/files/loadouts/1789984999999-000000.jpg', route => route.fulfill({
    status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'not found',
  }));
  const answer = {
    screen: 'gunsmith', weapon: 'Sten', weaponClass: 'SMG', buildCode: 'Sten-1B2C3A', buildName: '', blueprint: '',
    attachments: { muzzle: '', barrel: '', optic: '', stock: '', laser: '', underbarrel: '', ammunition: '', rearGrip: '', perk: '' },
    stats: { damage: 30, fireRate: 104, accuracy: 55, mobility: 80, range: 40, control: 61 }, playerName: '', notes: '',
  };
  await fetch(`${stack.mockUrl}/__mock/next`, { method: 'POST', body: JSON.stringify({ status: 200, body: {
    id: 'msg_sten', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(answer) }],
  } }) });
  await page.waitForSelector('#codeTool:not([hidden])');
  assert.match(await page.textContent('#findCodesBtn'), /\(2\)/, 'two loadouts have a screenshot but no code');
  page.once('dialog', d => d.accept());
  await page.click('#findCodesBtn');
  await page.waitForFunction(() => /Found/.test(document.querySelector('#codeToolStatus').textContent));
  const rows = page.locator('#codeResults .code-result');
  assert.equal(await rows.count(), 2);
  const sten = page.locator('#codeResults .code-result', { hasText: 'Sten' });
  assert.match(await sten.textContent(), /Sten-1B2C3A/);
  assert.match(await sten.textContent(), /Fire rate 100 → 104/, 'a stat cut to 100 is corrected');
  assert.equal(await sten.locator('input').isChecked(), true);
  assert.match(await page.locator('#codeResults .code-result', { hasText: 'LW3-Tundra' }).textContent(), /not found/);
  assert.equal(await page.locator('#saveCodesBtn').isDisabled(), false);
  await page.click('#saveCodesBtn');
  await page.waitForFunction(() => /Saved 1 loadout/.test(document.querySelector('#codeToolStatus').textContent));
  const saved = await page.evaluate(() => globalThis.__fsStores.loadouts.sten);
  assert.equal(saved.buildCode, 'Sten-1B2C3A');
  assert.deepEqual(saved.stats, { damage: 30, fireRate: 104, accuracy: 55, mobility: 80, range: 40, control: 61 });
  assert.equal(await page.locator('.loadout .ld-code[data-code="Sten-1B2C3A"]').count(), 1);
  assert.match(await page.textContent('#findCodesBtn'), /\(1\)/, 'only the one with a missing screenshot is left');
  assert.deepEqual(errors, []);
  await context.close();
});

test('members: anyone adds a member’s settings (Claude reads a screenshot), then copies codes and the TB format', async () => {
  // Settings attach to members on the clan server's roster.
  if (!(await (await fetch(`${stack.api}/roster.php`)).json()).roster) {
    await fetch(`${stack.api}/roster.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'Admin-Test-1' },
      body: JSON.stringify({ baseVersion: 0, members: FIXTURE_ROSTER.members, summary: 'Seed' }) });
  }
  const { page, errors, context } = await openPage('members.html');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: stack.siteUrl });
  await waitPill(page, 'Live');
  await page.fill('#searchInput', 'billie');
  // Tapping the member opens their popup on the Settings tab.
  await page.click('.member-row .member-name');
  await page.waitForSelector('#refModal.open');
  assert.equal(await page.locator('#panelSettings').isVisible(), true);
  assert.match(await page.textContent('#panelSettings'), /No settings saved/);
  await page.click('#setEditBtn');
  assert.equal(await page.locator('.capi-box').count(), 0, 'no password needed');
  await page.setInputFiles('#setShotInput', shot('sensitivity.png'));
  await page.waitForSelector('#setShotStatus.ok');
  assert.equal(await page.inputValue('#panelSettings input[data-k="mpSensitivity"]'), 'K7Q2M9XA4F31');
  assert.equal(await page.inputValue('#panelSettings input[data-k="fps"]'), 'Max');
  assert.equal(await page.inputValue('#panelSettings select[data-k="adsButtonRotation"]'), 'On');
  assert.equal(await page.locator('#panelSettings input.filled').count() >= 5, true, 'what Claude filled is outlined');
  await page.fill('#panelSettings input[data-k="device"]', 'iPhone 16 Pro Max');
  await page.click('#setSaveBtn');
  await page.waitForSelector('#panelSettings .code-row[data-code-copy]');

  const entry = (await (await fetch(`${stack.api}/settings.php`)).json()).settings['7329424404814430209'];
  assert.equal(entry.other.device, 'iPhone 16 Pro Max');
  assert.equal(entry.codes.mpHud, 'H5TB1ZQK7CX9');
  assert.equal(entry.by, 'public');

  await page.click('#panelSettings .code-row[data-code-copy="K7Q2M9XA4F31"]');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'K7Q2M9XA4F31');
  await page.click('#setCopyBtn');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /^\*\*.+\*\* — settings\n\nSHAREABLE\n\n\* MP Sensitivity Code: K7Q2M9XA4F31\n\* BR Sensitivity Code: —\n/);
  assert.match(text, /\n\nOTHER SETTINGS\n\n\* Device: iPhone 16 Pro Max\n\* FPS: Max\n/);
  assert.match(text, /\* View Kick Scale: —$/);

  // The Images tab still holds the reference images.
  await page.click('#tabImages');
  assert.ok(await page.locator('#refGrid .ref-thumb').count() >= 2);
  await page.click('#refModalClose');
  // The row shows settings are saved, and the filter finds them.
  assert.equal(await page.locator('.member-row .refs-btn .part.on').count(), 1);
  await page.fill('#searchInput', '');
  await page.click('.filter-chip[data-id="settings"]');
  assert.equal(await page.locator('.member-row').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

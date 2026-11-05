// Matching / planning tests: node --test tests/match.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, 'assets/clan-match.js'));
const seed = JSON.parse(readFileSync(path.join(ROOT, 'data/members.json'), 'utf8')).members;
const answers = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/claude-answers.json'), 'utf8'));
const byName = (members, name) => members.find(m => m.name === name);

test('folding strips decorations and clan tags', () => {
  assert.equal(M.fold('ƬƁ丨Ɓillieঐ'), 'tbbillie');
  assert.equal(M.fold('ƬƁ丨MĆƓɄIŇ'), 'tbmcguin');
  assert.equal(M.fold('ŧЯøƈøłïƨų'), 'trocolisu');
  assert.ok(M.variants('ƬƁ | Zuka').includes('zuka'));
  assert.ok(M.variants('TBxJ3nga2T').includes('j3nga2t'));
  assert.ok(M.variants('ꟻeShonny').includes('shonny'));
});

test('names from the clan log match the right roster members', () => {
  const expect = {
    'Krave (Krave)': 'ƬƁ丨krave',
    'AŞHi(Ashi)': 'AŞHi',
    'TB | Kodak': 'ƬƁ | Kodak',
    'TB | 007There': 'ƬƁ丨Peaṅụť',     // alias beats the near-identical active ƬƁ丨007here
    'Forbidden-Unit': 'ƬƁ | Forbidden',
    'TB | Brazy': 'ƬƁ | Ztoney',
    'TB | Locetti': 'ƬƁ | Locetti',
    'Nemzz': 'ƬƁ | Vendetta',
  };
  for (const [logName, rosterName] of Object.entries(expect)) {
    const best = M.bestMember(seed, logName);
    assert.ok(best, `no match for ${logName}`);
    assert.equal(best.member.name, rosterName, `${logName} → ${best.member.name} (${best.score.toFixed(2)})`);
  }
  for (const stranger of ['Masonakk7', 'TB | Xen¶', 'ꟻeShonny', '[gdwGr+1G6ME', 'Zuka.codm']) {
    assert.equal(M.bestMember(seed, stranger), null, `${stranger} should be new`);
  }
});

test('your two clan-log screenshots produce the expected roster changes', () => {
  const plan = M.planClanUpdates(seed, answers.clan);
  const eff = Object.fromEntries(plan.rows.map(r => [r.name, r.effect]));
  assert.match(eff['Krave (Krave)'], /Already recorded/);
  assert.match(eff['Forbidden-Unit'], /Already recorded/);
  assert.match(eff['TB | 007There'], /Already recorded/);
  assert.match(eff['TB | Kodak'], /Left 03\/10\/26 — mark former/);
  assert.match(eff['Zuka.codm'], /Add new active member, joined 22\/10\/26/);
  assert.match(eff['AŞHi(Ashi)'], /Left 24\/10\/26 — mark former/);
  assert.match(eff['Masonakk7'], /Add new active member, joined 24\/10\/26/);
  assert.match(eff['TB | Xen¶'], /joined 25\/10\/26/);
  assert.match(eff['TB | Brazy'], /Left again 27\/10\/26/);
  assert.match(eff['[gdwGr+1G6ME'], /Add as former member, left 28\/10\/26/);
  assert.match(eff['ꟻeShonny'], /joined 30\/10\/26/);
  assert.match(eff['ꟻeJ3ngaQT2T'], /joined 30\/10\/26/);

  const after = plan.members;
  assert.equal(after.filter(m => m.status === 'active').length, 23);
  assert.equal(byName(after, 'ƬƁ | Kodak').status, 'former');
  assert.deepEqual(byName(after, 'ƬƁ | Kodak').away.at(-1), { left: '03/10/26' });
  assert.deepEqual(byName(after, 'ƬƁ | Ztoney').away.map(p => p.left), ['16/09/26', '27/10/26']);
  assert.equal(byName(after, 'Zuka.codm').joinDate, '22/10/26');
  assert.equal(plan.memberCount, '25/90');

  // Re-reading the same screenshots on the updated roster changes nothing.
  const again = M.planClanUpdates(after, answers.clan);
  assert.equal(again.rows.filter(r => r.checked).length, 0, again.rows.filter(r => r.checked).map(r => r.name + ': ' + r.effect).join('\n'));
});

test('admin overrides: retarget and untick rows', () => {
  const first = M.planClanUpdates(seed, answers.clan);
  const masonRow = first.rows.find(r => r.name === 'Masonakk7');
  const kodakRow = first.rows.find(r => r.name === 'TB | Kodak');
  const plan = M.planClanUpdates(seed, answers.clan, {
    [masonRow.key]: { target: 'skip' },
    [kodakRow.key]: { checked: false },
  });
  assert.equal(byName(plan.members, 'Masonakk7'), undefined);
  assert.equal(byName(plan.members, 'ƬƁ | Kodak').status, 'active');
});

test('old screenshots cannot undo newer changes', () => {
  const roster = structuredClone(seed);
  const kodak = byName(roster, 'ƬƁ | Kodak');
  kodak.joinDate = '05/10/26'; // rejoined after the 03/10 quit
  const plan = M.planClanUpdates(roster, answers.clan);
  assert.match(plan.rows.find(r => r.name === 'TB | Kodak').effect, /Older than their latest join/);
  assert.equal(byName(plan.members, 'ƬƁ | Kodak').status, 'active');
});

test('profile screenshots: set UID, rename, keep fancy spelling, warn on clashes', () => {
  const afterLog = M.planClanUpdates(seed, answers.clan).members;
  const mason = byName(afterLog, 'Masonakk7');
  const first = M.planProfileUpdates(afterLog, answers.profile);
  const drewKey = first.rows[0].key;
  assert.equal(first.rows[0].target, 'new', 'DRƐW has no name match on his own');
  const plan = M.planProfileUpdates(afterLog, answers.profile, { [drewKey]: { target: mason.id } });
  const [drew, zuka, kodak] = plan.rows;
  assert.match(drew.effect, /Set UID 7000000000000000001 · Rename Masonakk7 → TB \| DRƐW/);
  assert.match(zuka.effect, /Set UID 7000000000000000002 · Rename Zuka\.codm → TB \| Zuka/);
  assert.equal(kodak.via, 'uid');
  assert.match(kodak.effect, /Already up to date \(tier 300\)/);
  assert.equal(kodak.name, 'ƬƁ | Kodak', 'roster spelling kept when the name only differs in styling');

  const zukaAfter = plan.members.find(m => m.uid === '7000000000000000002');
  assert.deepEqual(zukaAfter.aliases, ['Zuka.codm'], 'renames keep the old name');
  const drewAfter = plan.members.find(m => m.id === mason.id);
  assert.equal(drewAfter.name, 'TB | DRƐW');
  assert.equal(drewAfter.uid, '7000000000000000001');
  assert.deepEqual(drewAfter.aliases, ['Masonakk7']);

  // Same UID as a roster member = that member renamed (ticked by default).
  const renamed = M.planProfileUpdates(plan.members, [{ name: 'Someone', uid: '7329424404814430209', tier: null, clanTag: 'TB' }]);
  assert.equal(renamed.rows[0].memberName, 'ƬƁ丨Ɓillieঐ');
  assert.match(renamed.rows[0].effect, /Rename ƬƁ丨Ɓillieঐ → Someone/);

  // Pointing a screenshot at a different member when the UID is already taken: unticked + warning.
  const key = renamed.rows[0].key;
  const clash = M.planProfileUpdates(plan.members, [{ name: 'Someone', uid: '7329424404814430209', tier: null, clanTag: 'TB' }],
    { [key]: { target: drewAfter.id } });
  assert.equal(clash.rows[0].checked, false);
  assert.ok(clash.rows[0].warnings.some(w => w.startsWith('UID already belongs')));
  assert.ok(clash.rows[0].warnings.some(w => w.startsWith('Member already has a different UID')));
});

test('member-list screenshots: add unknowns, reactivate formers, list missing', () => {
  const read = { screen: 'member_list', memberCount: '3/90', events: [], members: [
    { name: 'TB | Kodak', position: 'MEMBER', matchId: '', matchConfidence: 'none' },
    { name: 'ƬƁ丨Ɓillieঐ', position: 'ELITE', matchId: '', matchConfidence: 'none' },
    { name: 'BrandNew', position: 'MEMBER', matchId: '', matchConfidence: 'none' },
  ] };
  const roster = structuredClone(seed);
  byName(roster, 'ƬƁ | Kodak').status = 'former';
  const plan = M.planClanUpdates(roster, [read]);
  const eff = Object.fromEntries(plan.rows.map(r => [r.name, r.effect]));
  assert.match(eff['TB | Kodak'], /mark active/);
  assert.match(eff['ƬƁ丨Ɓillieঐ'], /On the roster/);
  assert.match(eff['BrandNew'], /add as active/);
  assert.ok(plan.missing.includes('ƬƁ丨MĆƓɄIŇ'));
});

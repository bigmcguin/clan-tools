/* TB clan tools — name matching and roster-update planning.
 * Pure functions, no DOM: used by members.html and by the Node tests.
 * Dates in the roster are DD/MM/YY; CODM clan-log timestamps are
 * "YYYY-MM-DD HH:MM" (device-local time).
 * When you change this file, bump the ?v= on its <script> tags in
 * members.html, loadouts.html and callouts.html (browsers cache it for 10 min).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClanMatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Name folding ──────────────────────────────────────────────────────────
  // Decorative letters players use, lower-cased, mapped to plain ASCII.
  const CONFUSABLES = {
    'ƭ': 't', 'ɓ': 'b', 'ƀ': 'b', 'ŧ': 't', 'ť': 't', 'ţ': 't', 'ț': 't', 'я': 'r', 'ƈ': 'c', 'ł': 'l',
    'ø': 'o', 'ð': 'd', 'đ': 'd', 'ħ': 'h', 'ƨ': 's', 'ʉ': 'u', 'ɠ': 'g', 'ɛ': 'e', 'ε': 'e', 'ꟻ': 'f',
    '◯': 'o', '尺': 'r', 'ŋ': 'n', 'ƙ': 'k', 'ə': 'e', 'ɐ': 'a', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe',
    'þ': 'th', 'ı': 'i', 'ɪ': 'i', 'ʀ': 'r', 'ᴛ': 't', 'ʙ': 'b', 'ɴ': 'n', 'ᴍ': 'm', 'ᴇ': 'e', 'ᴀ': 'a',
    'ᴋ': 'k', 'ʏ': 'y', 'ᴜ': 'u', 'ᴏ': 'o', 'ᴘ': 'p', 'ꜱ': 's', 'ᴅ': 'd', 'ғ': 'f', 'ɢ': 'g', 'ʜ': 'h',
    'ᴊ': 'j', 'ʟ': 'l', 'ᴢ': 'z', 'ᴄ': 'c', 'ᴠ': 'v', 'ᴡ': 'w', 'ʋ': 'v', 'ɨ': 'i', 'ɍ': 'r', 'ɏ': 'y',
    'ƶ': 'z', 'ȥ': 'z', 'ʐ': 'z', 'ɀ': 'z', 'ƒ': 'f', 'ɱ': 'm', 'ɲ': 'n', 'ƥ': 'p', 'ʠ': 'q', 'ɗ': 'd',
    'ƴ': 'y', 'ɦ': 'h', 'ĸ': 'k', 'ŀ': 'l', 'ŉ': 'n', 'ſ': 's', 'ȿ': 's', 'ʂ': 's', 'ɕ': 'c', 'ɔ': 'o',
    'ɵ': 'o', 'ʊ': 'u', 'ʌ': 'v', 'ɯ': 'w', 'х': 'x', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
    'у': 'y', 'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h', 'і': 'i', 'ѕ': 's', 'ј': 'j',
  };

  /** Lower-case ASCII words: decorations removed, separators turned into spaces. */
  function foldWords(name) {
    let s = String(name || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
    s = Array.from(s, ch => CONFUSABLES[ch] ?? ch).join('');
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Compact folded name, e.g. "ƬƁ丨Ɓillieঐ" → "tbbillie". */
  function fold(name) { return foldWords(name).replace(/ /g, ''); }

  /**
   * Folded variants of a name with the clan tag removed, e.g.
   * "ƬƁ | Zuka" → ["tbzuka", "zuka"], "TBxJ3nga2T" → ["tbxj3nga2t", "j3nga2t"].
   */
  function variants(name) {
    const words = foldWords(name);
    const out = new Set();
    const compact = words.replace(/ /g, '');
    if (compact) out.add(compact);
    const noTag = words.replace(/^(?:tb|t b)\s+/, '').replace(/ /g, '');
    if (noTag) out.add(noTag);
    const m = compact.match(/^tbx?([a-z0-9]{3,})$/);
    if (m && /^(?:ƬƁ|TB|ŦB|ŤB)x/i.test(String(name).trim())) out.add(m[1]);
    // Drop a short decorative prefix glued to the name ("ꟻeShonny" → "shonny").
    if (/^[^\p{L}\p{N}\s]*[\u{A700}-\u{A7FF}]/u.test(String(name).trim()) && noTag.length > 4) out.add(noTag.slice(2));
    return [...out];
  }

  // ── Similarity ────────────────────────────────────────────────────────────
  function levenshtein(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function lcs(a, b) {
    let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      const cur = [0];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** 0…1 similarity of two folded strings. */
  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (s.length >= 3 && l.includes(s)) return 0.86 + 0.04 * (s.length / l.length);
    const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
    const dice = (2 * lcs(a, b)) / (a.length + b.length);
    return Math.max(lev, s.length >= 5 ? dice : 0);
  }

  /** Best similarity between two names across their variants. */
  function nameScore(a, b) {
    let best = 0;
    for (const x of variants(a)) for (const y of variants(b)) best = Math.max(best, similarity(x, y));
    return best;
  }

  const LIKELY = 0.72;
  const STRONG = 0.85;

  /**
   * Members ranked by how well `name` matches their name or aliases.
   * opts.hintId / opts.hintConfidence: Claude's suggestion (boosts that member).
   * opts.prefer(member) → small bonus for members whose status fits the event.
   */
  function rankMembers(members, name, opts = {}) {
    const ranked = [];
    for (const m of members) {
      let score = nameScore(name, m.name);
      let via = 'name';
      for (const a of m.aliases || []) {
        const s = nameScore(name, a);
        if (s > score) { score = s; via = 'alias'; }
      }
      if (opts.hintId && m.id === opts.hintId) {
        const boost = { high: 0.95, medium: 0.85, low: 0.74 }[opts.hintConfidence] || 0;
        if (boost > score) { score = boost; via = 'claude'; }
      }
      if (opts.prefer && opts.prefer(m)) score += 0.03;
      ranked.push({ member: m, score: Math.min(1, score), via });
    }
    return ranked.sort((x, y) => y.score - x.score);
  }

  function bestMember(members, name, opts = {}) {
    const top = rankMembers(members, name, opts)[0];
    return top && top.score >= LIKELY ? top : null;
  }

  // ── Dates ─────────────────────────────────────────────────────────────────
  const pad2 = n => String(n).padStart(2, '0');

  /** "2026-10-30 07:08" → { dmy: "30/10/26", ts: <ms>, label: "30 Oct 2026, 07:08" } or null. */
  function parseLogTime(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!m) return null;
    const [, y, mo, d, h = '0', mi = '0'] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    if (date.getMonth() !== Number(mo) - 1) return null;
    return { dmy: `${d}/${mo}/${y.slice(2)}`, ts: date.getTime(), time: m[4] ? `${pad2(h)}:${mi}` : '' };
  }

  function dmyToTime(dmy) {
    const m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    return m ? new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : NaN;
  }

  function todayDmy(now = new Date()) {
    return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}`;
  }

  // ── Roster helpers ────────────────────────────────────────────────────────
  function newId() {
    const bytes = new Uint8Array(5);
    (globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(bytes);
    return 'm-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  const clone = x => JSON.parse(JSON.stringify(x));

  /** Last away period with no return date, for members who are currently away. */
  function openPeriod(m) {
    const a = m.away || [];
    const last = a[a.length - 1];
    return last && !last.returned ? last : null;
  }

  /** Most recent join or return date of a member (DD/MM/YY), or ''. */
  function lastJoinDmy(m) {
    let best = m.joinDate || '';
    for (const p of m.away || []) if (p.returned && (!best || dmyToTime(p.returned) > dmyToTime(best))) best = p.returned;
    return best;
  }
  function lastJoinTime(m) { const d = lastJoinDmy(m); return d ? dmyToTime(d) : -Infinity; }

  /** Add `name` as an alias when it is a genuinely different name. */
  function addAlias(m, name) {
    if (!name) return;
    const f = fold(name);
    if (!f || fold(m.name) === f) return;
    const known = [m.name, ...(m.aliases || [])].some(x => nameScore(x, name) >= 0.86);
    if (known) return;
    m.aliases = [...(m.aliases || []), name].slice(-20);
  }

  /** After a confirmed rename, keep the old name for search and future matching. */
  function recordOldName(m, oldName) {
    if (!oldName) return;
    const same = n => fold(n) === fold(oldName);
    if (same(m.name) || (m.aliases || []).some(same)) return;
    m.aliases = [...(m.aliases || []), oldName].slice(-20);
  }

  function describeMember(m) {
    return m ? `${m.name}${m.status === 'former' ? ' (former)' : ''}` : '';
  }

  // ── Clan log / member list → planned changes ─────────────────────────────
  /**
   * reads: AI results ({ screen, events[], members[] }) in upload order.
   * choices: { [rowKey]: { target?: memberId | 'new' | 'skip', checked?: bool } }
   * Returns { rows, members } where members is the roster after applying the
   * checked rows in time order.
   */
  function planClanUpdates(baseMembers, reads, choices = {}) {
    const members = clone(baseMembers);
    const byId = () => new Map(members.map(m => [m.id, m]));
    const rows = [];
    const seen = new Set();

    reads.forEach((read, readIndex) => {
      (read.events || []).forEach((ev, i) => {
        const t = parseLogTime(ev.datetime);
        const key = `ev|${ev.datetime}|${ev.action}|${fold(ev.name)}`;
        if (seen.has(key)) return;
        seen.add(key);
        // Logs are newest-first: a lower row on the same screenshot happened earlier.
        rows.push({ key, type: 'event', ev, t, order: readIndex * 1000 - i });
      });
    });
    rows.sort((a, b) => (a.t?.ts ?? 0) - (b.t?.ts ?? 0) || a.order - b.order);

    const listRows = [];
    reads.forEach(read => (read.members || []).forEach(lm => {
      const key = `ml|${fold(lm.name)}`;
      if (seen.has(key)) return;
      seen.add(key);
      listRows.push({ key, type: 'listed', lm });
    }));

    for (const row of rows) {
      const { ev, t } = row;
      const choice = choices[row.key] || {};
      row.name = ev.name;
      row.date = t ? t.dmy : '';
      row.time = t ? t.time : '';
      if (!['join', 'quit', 'remove'].includes(ev.action) || !t || !ev.name) {
        row.kind = 'info';
        row.effect = !t ? 'Skipped: timestamp unreadable' : !ev.name ? 'Skipped: no name' : `Not tracked (${ev.logText || ev.action})`;
        row.applicable = false; row.checked = false;
        continue;
      }
      const isJoin = ev.action === 'join';
      const auto = bestMember(members, ev.name, {
        hintId: ev.matchId, hintConfidence: ev.matchConfidence,
        prefer: m => (isJoin ? m.status === 'former' : m.status === 'active'),
      });
      row.suggested = auto ? auto.member.id : 'new';
      row.score = auto ? auto.score : 0;
      const target = choice.target || row.suggested;
      row.target = target;
      const m = target === 'new' || target === 'skip' ? null : byId().get(target);
      row.memberName = describeMember(m);
      let apply = null;

      if (target === 'skip') {
        row.effect = 'Skipped';
        row.noop = true;
      } else if (isJoin) {
        if (!m) {
          row.effect = `Add new active member, joined ${t.dmy}`;
          apply = () => members.push({ id: newId(), slot: null, joinDate: t.dmy, name: ev.name, uid: '', status: 'active' });
        } else if (m.status === 'former' && openPeriod(m) && dmyToTime(openPeriod(m).left) > t.ts) {
          row.effect = `Older than when they left (${openPeriod(m).left})`;
          row.noop = true;
        } else if (m.status === 'former') {
          const open = openPeriod(m);
          row.effect = `Returned ${t.dmy} — mark active`;
          apply = () => {
            if (open && dmyToTime(open.left) <= t.ts) open.returned = t.dmy;
            m.status = 'active';
            addAlias(m, ev.name);
          };
        } else if (!m.joinDate) {
          row.effect = `Set join date ${t.dmy}`;
          apply = () => { m.joinDate = t.dmy; addAlias(m, ev.name); };
        } else {
          const recorded = m.joinDate === t.dmy || (m.away || []).some(p => p.returned === t.dmy);
          row.effect = recorded ? 'Already recorded' : `Already active (joined ${m.joinDate})`;
          row.noop = true;
        }
      } else {
        const removed = ev.action === 'remove';
        const verb = removed ? 'Removed' : 'Left';
        if (!m) {
          row.effect = `Add as former member, ${verb.toLowerCase()} ${t.dmy}`;
          apply = () => members.push({
            id: newId(), slot: null, joinDate: '', name: ev.name, uid: '', status: 'former',
            away: [removed ? { left: t.dmy, removed: true } : { left: t.dmy }],
          });
        } else if (m.status === 'active' && lastJoinTime(m) > t.ts) {
          row.effect = `Older than their latest join (${lastJoinDmy(m)})`;
          row.noop = true;
        } else if (m.status === 'active') {
          row.effect = `${verb} ${t.dmy} — mark former`;
          apply = () => {
            m.status = 'former';
            m.away = [...(m.away || []), removed ? { left: t.dmy, removed: true } : { left: t.dmy }];
            addAlias(m, ev.name);
          };
        } else {
          const last = (m.away || []).at(-1);
          if (last && last.left === t.dmy) {
            row.effect = 'Already recorded';
            row.noop = true;
          } else {
            row.effect = `${verb} again ${t.dmy} (had come back unrecorded)`;
            apply = () => {
              m.away = [...(m.away || []), removed ? { left: t.dmy, removed: true } : { left: t.dmy }];
              addAlias(m, ev.name);
            };
          }
        }
      }
      row.applicable = !!apply;
      row.checked = row.applicable && choice.checked !== false;
      row.kind = row.applicable ? 'change' : 'noop';
      if (row.checked) apply();
    }

    // Member-list screenshots: who is in the clan right now.
    const matchedIds = new Set();
    for (const row of listRows) {
      const { lm } = row;
      const choice = choices[row.key] || {};
      row.name = lm.name;
      row.date = ''; row.time = '';
      const auto = bestMember(members, lm.name, { hintId: lm.matchId, hintConfidence: lm.matchConfidence, prefer: m => m.status === 'active' });
      row.suggested = auto ? auto.member.id : 'new';
      row.score = auto ? auto.score : 0;
      const target = choice.target || row.suggested;
      row.target = target;
      const m = target === 'new' || target === 'skip' ? null : byId().get(target);
      if (m) matchedIds.add(m.id);
      row.memberName = describeMember(m);
      let apply = null;
      if (target === 'skip') { row.effect = 'Skipped'; row.noop = true; }
      else if (!m) {
        row.effect = 'In the clan but not on the roster — add as active (join date unknown)';
        apply = () => members.push({ id: newId(), slot: null, joinDate: '', name: lm.name, uid: '', status: 'active' });
      } else if (m.status === 'former') {
        row.effect = 'Seen in member list — mark active (return date unknown)';
        apply = () => { m.status = 'active'; addAlias(m, lm.name); };
      } else {
        row.effect = 'On the roster ✓';
        row.noop = true;
      }
      row.applicable = !!apply;
      row.checked = row.applicable && choice.checked !== false;
      row.kind = row.applicable ? 'change' : 'noop';
      if (row.checked) apply();
      rows.push(row);
    }

    let missing = [];
    if (listRows.length) {
      missing = baseMembers.filter(m => m.status === 'active' && !matchedIds.has(m.id)).map(m => m.name);
    }
    const memberCount = reads.map(r => r.memberCount).find(Boolean) || '';
    return { rows, members, missing, memberCount };
  }

  // ── Profile screenshots → planned changes ────────────────────────────────
  /**
   * reads: AI profile results ({ name, uid, tier, clanTag, matchId, … }).
   * choices: { [rowKey]: { target?, checked?, name?, uid? } }
   */
  function planProfileUpdates(baseMembers, reads, choices = {}) {
    const members = clone(baseMembers);
    const rows = [];
    const seen = new Set();
    for (const read of reads) {
      const key = `pf|${read.uid || fold(read.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const choice = choices[key] || {};
      const row = { key, read };
      const byUid = read.uid ? members.find(m => m.uid === read.uid) : null;
      let auto = byUid ? { member: byUid, score: 1, via: 'uid' } : null;
      if (!auto && read.name) {
        auto = bestMember(members, read.name, {
          hintId: read.matchId, hintConfidence: read.matchConfidence,
          prefer: m => !m.uid,
        });
      }
      row.suggested = auto ? auto.member.id : 'new';
      row.score = auto ? auto.score : 0;
      row.via = auto ? auto.via : '';
      const target = choice.target || row.suggested;
      row.target = target;
      const m = target === 'new' || target === 'skip' ? null : members.find(x => x.id === target);
      row.memberName = describeMember(m);

      const uid = String(choice.uid ?? read.uid ?? '').replace(/\D+/g, '');
      const explicitName = choice.name != null;
      // Keep the roster's own spelling (often fancier Unicode) when the name is the same underneath.
      const sameCore = m && fold(m.name) === fold(read.name);
      const name = String(explicitName ? choice.name : (sameCore ? m.name : read.name || '')).trim();
      row.name = name;
      row.uid = uid;
      row.warnings = [];

      const changes = [];
      if (target !== 'skip') {
        if (!m) changes.push('add');
        else {
          if (uid && uid !== m.uid) changes.push(m.uid ? 'replace-uid' : 'set-uid');
          if (name && name !== m.name && (explicitName || !sameCore)) changes.push('rename');
          if (read.tier != null && read.tier !== m.tier) changes.push('tier');
        }
      }
      if (target === 'skip') row.effect = 'Skipped';
      else if (!m) row.effect = `Add new active member${uid ? ` with UID ${uid}` : ''}`;
      else {
        const bits = [];
        if (changes.includes('set-uid')) bits.push(`Set UID ${uid}`);
        if (changes.includes('replace-uid')) bits.push(`Replace UID ${m.uid} → ${uid}`);
        if (changes.includes('rename')) bits.push(`Rename ${m.name} → ${name}`);
        row.effect = bits.length ? bits.join(' · ') : 'Already up to date';
        if (changes.includes('tier')) row.effect += ` (tier ${read.tier})`;
      }

      if (!m && target !== 'skip' && !name) row.warnings.push('No name');
      if (changes.includes('replace-uid')) row.warnings.push('Member already has a different UID');
      if (uid && !/^\d{5,25}$/.test(uid)) row.warnings.push('UID should be 5–25 digits');
      const clash = uid && target !== 'skip' ? members.find(x => x.uid === uid && x.id !== (m && m.id)) : null;
      if (clash) row.warnings.push(`UID already belongs to ${clash.name}`);
      if (read.clanTag && fold(read.clanTag) !== 'tb') row.warnings.push(`Clan tag on the profile is "${read.clanTag}"`);

      const meaningful = changes.some(c => c !== 'tier');
      // Hard problems block the row; soft ones leave it unticked until the admin decides.
      const hard = row.warnings.some(w => w === 'No name' || w.startsWith('UID should'));
      const soft = row.warnings.some(w => /^(UID already|Member already|Clan tag)/.test(w));
      row.applicable = changes.length > 0 && !hard;
      row.checked = row.applicable && (choice.checked ?? !soft);
      row.kind = meaningful ? 'change' : 'noop';

      if (row.checked) {
        if (!m) {
          members.push({ id: newId(), slot: null, joinDate: '', name, uid, status: 'active', ...(read.tier != null ? { tier: read.tier } : {}) });
        } else {
          if (changes.includes('set-uid') || changes.includes('replace-uid')) m.uid = uid;
          if (changes.includes('rename')) { const old = m.name; m.name = name; recordOldName(m, old); }
          if (read.tier != null) m.tier = read.tier;
        }
      }
      rows.push(row);
    }
    return { rows, members };
  }

  /** Short human summary of applied rows, for the history log. */
  function summarise(rows, label) {
    const n = rows.filter(r => r.checked).length;
    return `${label}: ${n} change${n === 1 ? '' : 's'}`;
  }

  return {
    fold, foldWords, variants, similarity, nameScore, rankMembers, bestMember,
    parseLogTime, dmyToTime, todayDmy, newId, openPeriod, addAlias, recordOldName,
    planClanUpdates, planProfileUpdates, summarise, LIKELY, STRONG,
  };
});

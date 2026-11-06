/* TB clan tools — browser client for the clan API on Hostinger
 * (hostinger/clan-api in this repo): roster, screenshot uploads and Claude
 * reads. Passwords are checked by the server, never stored in page source;
 * once accepted they are remembered on this device until "Lock".
 * When you change this file, bump the ?v= on its <script> tags in
 * members.html, loadouts.html and callouts.html (browsers cache it for 10 min).
 */
(function () {
  'use strict';

  // ⚙ Where the clan API lives (the zip is extracted into public_html/api on the
  // clan-api.stridlabs.com Hostinger site). Change this one line if you move it.
  const DEFAULT_API = 'https://clan-api.stridlabs.com/api';

  const KEY_STORE = { clan: 'tb-clan-key', admin: 'tb-admin-key' };

  function base() {
    let override = null;
    try { override = localStorage.getItem('tb-api-base'); } catch { /* storage blocked */ }
    return (override || DEFAULT_API).replace(/\/+$/, '');
  }

  function getKey(role) { try { return localStorage.getItem(KEY_STORE[role]) || ''; } catch { return ''; } }
  function setKey(role, value) { try { localStorage.setItem(KEY_STORE[role], value); } catch { /* ignore */ } }
  function clearKey(role) { try { localStorage.removeItem(KEY_STORE[role]); } catch { /* ignore */ } }
  /** True when this device holds a password for the role (admin also counts as clan). */
  function hasRole(role) { return role === 'admin' ? !!getKey('admin') : !!(getKey('clan') || getKey('admin')); }
  function lock(role) { if (role) clearKey(role); else { clearKey('clan'); clearKey('admin'); } }

  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.name = 'ApiError'; this.status = status; this.data = data; }
  }

  function authHeaders(role) {
    const h = {};
    if (role === 'admin') {
      if (getKey('admin')) h['X-Admin-Key'] = getKey('admin');
    } else if (role === 'clan') {
      if (getKey('clan')) h['X-Clan-Key'] = getKey('clan');
      else if (getKey('admin')) h['X-Admin-Key'] = getKey('admin');
    }
    return h;
  }

  async function request(path, { method = 'GET', json, form, role, timeoutMs = 30000, headers = {} } = {}) {
    const h = { ...authHeaders(role), ...headers };
    // Browsers can only send plain Latin characters in headers (passwords travel in one).
    if (Object.values(h).some(v => /[^\u0000-\u00ff]/.test(v))) {
      throw new ApiError('That password has a character browsers can’t send (like ƬƁ or an emoji). Use plain letters, numbers and symbols — change it in secrets.php.', 0);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    else if (form) body = form;
    let res;
    try {
      res = await fetch(`${base()}/${path}`, { method, headers: h, body, signal: ctrl.signal, cache: 'no-store' });
    } catch (e) {
      throw new ApiError(e && e.name === 'AbortError' ? 'The clan server took too long to answer' : "Can't reach the clan server", 0);
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !data || data.ok === false) {
      // A remembered password that stopped working (changed on the server): forget it.
      if (res.status === 401 && role && data && data.error === 'Wrong password') {
        if (role === 'admin' || !getKey('clan')) clearKey('admin'); else clearKey('clan');
      }
      throw new ApiError((data && data.error) || `Clan server error (${res.status})`, res.status, data);
    }
    return data;
  }

  // ── Password dialog ───────────────────────────────────────────────────────
  let styled = false;
  function injectStyles() {
    if (styled) return;
    styled = true;
    const css = `
      .capi-back{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;z-index:1000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      .capi-box{background:var(--card,#16161f);border:1px solid var(--border,#2a2a38);border-radius:14px;padding:20px 18px;width:100%;max-width:340px;text-align:center;box-shadow:var(--shadow,0 20px 60px rgba(0,0,0,.5))}
      .capi-title{font-family:var(--display,sans-serif);font-weight:800;font-size:16px;color:var(--text,#e0e0ff);margin-bottom:6px}
      .capi-msg{font-family:var(--mono,monospace);font-size:11px;color:var(--text-dim,#8080b0);line-height:1.5;margin-bottom:14px}
      .capi-msg.err{color:var(--danger,#cc5050)}
      .capi-box input{width:100%;background:var(--input-bg,#0c0c12);border:1px solid var(--border,#2a2a38);border-radius:8px;padding:11px 12px;color:var(--text,#e0e0ff);font-family:var(--mono,monospace);font-size:15px;text-align:center;outline:none;margin-bottom:12px}
      .capi-box input:focus{border-color:var(--accent,#5050cc)}
      .capi-row{display:flex;gap:8px}
      .capi-row button{flex:1;border-radius:8px;padding:10px;font-family:var(--display,sans-serif);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;border:1px solid var(--border,#2a2a38);background:transparent;color:var(--text-mid,#8080b0)}
      .capi-row button.go{background:var(--accent-deep,#2a2a60);border-color:var(--accent,#5050cc);color:var(--text,#e0e0ff)}
      .capi-row button:disabled{opacity:.6;cursor:progress}`;
    const tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /** Ask for a password; `check(pw)` resolves true/false (or throws). Resolves to true when accepted. */
  function passwordDialog({ title, message, check }) {
    injectStyles();
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'capi-back';
      back.innerHTML = `<form class="capi-box" role="dialog" aria-modal="true" aria-labelledby="capiTitle">
        <div class="capi-title" id="capiTitle"></div>
        <div class="capi-msg"></div>
        <input type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Password" required />
        <div class="capi-row"><button type="button" class="no">Cancel</button><button type="submit" class="go">Unlock</button></div>
      </form>`;
      back.querySelector('.capi-title').textContent = title;
      const msg = back.querySelector('.capi-msg');
      msg.textContent = message || '';
      const input = back.querySelector('input');
      const go = back.querySelector('.go');
      const done = ok => { back.remove(); document.removeEventListener('keydown', onKey); resolve(ok); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      back.querySelector('.no').addEventListener('click', () => done(false));
      back.addEventListener('click', e => { if (e.target === back) done(false); });
      back.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        const pw = input.value;
        if (!pw) return;
        go.disabled = true; go.textContent = 'Checking…';
        try {
          if (await check(pw)) return done(true);
          msg.textContent = 'Wrong password — try again'; msg.classList.add('err');
        } catch (err) {
          msg.textContent = err.message || 'Could not check the password'; msg.classList.add('err');
        }
        go.disabled = false; go.textContent = 'Unlock';
        input.select();
      });
      document.body.appendChild(back);
      setTimeout(() => input.focus(), 30);
    });
  }

  /**
   * Make sure this device holds a working password for `role` ('clan' or
   * 'admin'), asking for it if needed. Resolves true when unlocked.
   */
  async function unlock(role, { title, message } = {}) {
    if (hasRole(role)) return true;
    const isAdmin = role === 'admin';
    return passwordDialog({
      title: title || (isAdmin ? '🔒 Admin password' : '🔒 Clan password'),
      message: message || (isAdmin ? 'Needed to change the roster.' : 'Ask in the clan chat if you don’t know it.'),
      async check(pw) {
        try {
          // Send it as both keys: the admin password typed here unlocks everything.
          const res = await request('auth.php', {
            method: 'POST', json: { role },
            headers: isAdmin ? { 'X-Admin-Key': pw } : { 'X-Clan-Key': pw, 'X-Admin-Key': pw },
          });
          setKey(res.role === 'admin' ? 'admin' : 'clan', pw);
          return true;
        } catch (e) {
          if (e.status === 401) return false;
          throw e;
        }
      },
    });
  }

  // ── Images ────────────────────────────────────────────────────────────────
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImg(file));
    }
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }

  /**
   * Resize/re-encode an image file as JPEG no larger than `maxEdge` on its
   * longest side. Small JPEG/PNG/WebP files that already fit are sent as-is.
   */
  async function prepareImage(file, { maxEdge = 2576, quality = 0.9, keepUnder = 1.5 * 1024 * 1024 } = {}) {
    const src = await loadBitmap(file);
    const w = src.width, h = src.height;
    const fits = Math.max(w, h) <= maxEdge;
    if (fits && file.size <= keepUnder && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      if (src.close) src.close();
      return { blob: file, width: w, height: h };
    }
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    if (src.close) src.close();
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality));
    return { blob, width: canvas.width, height: canvas.height };
  }

  /**
   * Best guess at when a screenshot was taken: a date in the file name
   * (Screenshot_20261030-070812.png, IMG_20261030_…, "Screenshot 2026-10-30 at …"),
   * else the file's own date, else today. Returns { iso: 'YYYY-MM-DD', source }.
   */
  function guessFileDate(file, now = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const name = (file && file.name) || '';
    const m = name.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?!\d)/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (d.getMonth() === Number(m[2]) - 1 && d <= now && d.getFullYear() >= 2018) return { iso: iso(d), source: 'filename' };
    }
    if (file && file.lastModified) {
      const d = new Date(file.lastModified);
      const ageDays = (now - d) / 86400000;
      if (ageDays > 0.02 && ageDays < 3 * 365) return { iso: iso(d), source: 'file' };
    }
    return { iso: iso(now), source: 'today' };
  }

  // ── Endpoints ─────────────────────────────────────────────────────────────
  const api = {
    DEFAULT_API, base, ApiError, request,
    getKey, hasRole, lock, unlock, prepareImage, guessFileDate,

    status: () => request('status.php', { timeoutMs: 12000 }),
    getRoster: () => request('roster.php', { timeoutMs: 15000 }),
    saveRoster: (members, baseVersion, summary) =>
      request('roster.php', { method: 'POST', role: 'admin', json: { members, baseVersion, summary } }),
    history: () => request('history.php', { role: 'admin' }),
    restore: (restoreVersion, baseVersion) =>
      request('history.php', { method: 'POST', role: 'admin', json: { restoreVersion, baseVersion } }),
    usage: () => request('usage.php', { role: 'admin' }),
    listMemberImages: () => request('list.php', { timeoutMs: 15000 }),

    /** Read a screenshot with Claude. kind: 'clan' | 'profile' | 'loadout'. */
    extract(kind, blob) {
      const form = new FormData();
      form.append('kind', kind);
      form.append('image', blob, 'screenshot.jpg');
      return request('ai.php', { method: 'POST', form, role: kind === 'loadout' ? 'clan' : 'admin', timeoutMs: 170000 });
    },

    /** Upload a screenshot (folder 'loadouts' | 'callouts') → URL. */
    async uploadScreenshot(folder, blob) {
      const form = new FormData();
      form.append('folder', folder);
      form.append('image', blob, 'upload.jpg');
      return (await request('upload.php', { method: 'POST', form, role: 'clan', timeoutMs: 90000 })).url;
    },

    /** Upload a member reference image → URL. role: 'admin' or 'clan' (server setting). */
    async uploadMemberImage(memberId, slot, blob, role = 'admin') {
      const form = new FormData();
      form.append('folder', 'members');
      form.append('member', memberId);
      form.append('slot', slot);
      form.append('image', blob, 'image.jpg');
      return (await request('upload.php', { method: 'POST', form, role, timeoutMs: 90000 })).url;
    },

    /** Delete an image this API stored. Other URLs are ignored. */
    async deleteImage(url, role = 'clan') {
      if (!api.isApiFile(url)) return { ok: true, skipped: true };
      return request('delete.php', { method: 'POST', role, json: { url } });
    },

    isApiFile: url => typeof url === 'string' && url.startsWith(base() + '/files/'),

    /**
     * Screenshots saved before the move point at the old image host
     * (stridlabs.com/clan-img), which no longer answers. Their files keep the
     * same names under the clan server's files/ folder, so read them from there.
     */
    fixImageUrl(url) {
      if (typeof url !== 'string') return url;
      const m = url.match(/^https?:\/\/(?:www\.)?stridlabs\.com\/clan-img\/files\/(.+)$/);
      return m ? `${base()}/files/${m[1]}` : url;
    },
  };

  window.ClanAPI = api;
})();

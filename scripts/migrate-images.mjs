#!/usr/bin/env node
// One-off: move loadout / callout screenshots from Firebase Storage to the
// Hostinger image host (hostinger/clan-img), then point Firestore at the new
// URLs. Needs Node 18+. Firebase Storage must be reachable while this runs,
// i.e. reinstate Google billing first, run this, then close the account.
//
//   node scripts/migrate-images.mjs --host https://stridlabs.com/clan-img --key Bubbles --dry-run
//   node scripts/migrate-images.mjs --host https://stridlabs.com/clan-img --key Bubbles
//
// If Google billing is already gone but you previously ran
//   gcloud storage cp -r gs://tbloadout.firebasestorage.app/loadouts gs://tbloadout.firebasestorage.app/callouts .
// point the script at that download instead and it never touches Google Storage:
//   node scripts/migrate-images.mjs --host … --key … --from-dir ~
//
// Options: --collection loadouts|callouts (default both), --dry-run (no writes),
//          --from-dir <dir> (read images from <dir>/loadouts/*.jpg, <dir>/callouts/*.jpg).

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) =>
  a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const HOST = String(args.host || '').replace(/\/$/, '');
const KEY = args.key;
const DRY = !!args['dry-run'];
const COLLECTIONS = args.collection ? [args.collection] : ['loadouts', 'callouts'];
const FROM_DIR = args['from-dir'] ? String(args['from-dir']).replace(/^~(?=$|\/)/, homedir()) : null;

// "…/o/loadouts%2F1781400765714-951acv.jpg?alt=media…" → "loadouts/1781400765714-951acv.jpg"
function objectPathFrom(url) {
  const m = url.match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Fetch the image bytes: from the local gcloud download when --from-dir is set
// (falling back to Google if the file isn't there), otherwise straight from Google.
async function getImage(src) {
  if (FROM_DIR) {
    const rel = objectPathFrom(src);
    const local = rel && join(FROM_DIR, rel);
    if (local && existsSync(local)) {
      const ext = local.split('.').pop().toLowerCase();
      const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'image/jpeg';
      return { buf: readFileSync(local), type, via: 'local' };
    }
  }
  const r = await fetch(src);
  if (!r.ok) throw new Error(`download ${r.status}${FROM_DIR ? ' (and no local copy found)' : ''}`);
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'image/jpeg', via: 'google' };
}
if (!HOST || !KEY) { console.error('Usage: --host <clan-img URL> --key <clan password> [--collection X] [--dry-run]'); process.exit(1); }

// Same public Firebase project config as loadouts.html / callouts.html.
const PROJECT = 'tbloadout';
const API_KEY = 'AIzaSyBkVBbffcv-K9tpJ8yXSs6tRRtx5tBoFIk';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function listDocs(coll) {
  const out = []; let token = '';
  do {
    const r = await fetch(`${FS}/${coll}?pageSize=100&key=${API_KEY}${token ? `&pageToken=${token}` : ''}`);
    if (!r.ok) throw new Error(`Firestore list ${coll}: ${r.status} ${await r.text()}`);
    const j = await r.json(); out.push(...(j.documents || [])); token = j.nextPageToken || '';
  } while (token);
  return out;
}

async function upload(buf, contentType, folder) {
  const form = new FormData();
  form.append('folder', folder);
  form.append('image', new Blob([buf], { type: contentType }), 'migrated.jpg');
  const r = await fetch(`${HOST}/upload.php`, { method: 'POST', headers: { 'X-Clan-Key': KEY }, body: form });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(`upload.php: ${r.status} ${j?.error || ''}`);
  return j.url;
}

async function setImageUrl(docName, url) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=imageUrl&key=${API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { imageUrl: { stringValue: url } } }),
  });
  if (!r.ok) throw new Error(`Firestore update: ${r.status} ${await r.text()}`);
}

mkdirSync('out', { recursive: true });
const log = [];
for (const coll of COLLECTIONS) {
  const docs = await listDocs(coll);
  const todo = docs.filter(d => (d.fields?.imageUrl?.stringValue || '').includes('firebasestorage.googleapis.com'));
  console.log(`\n${coll}: ${docs.length} docs, ${todo.length} still on Firebase Storage`);
  for (const d of todo) {
    const label = d.fields.weapon?.stringValue || d.fields.map?.stringValue || d.name.split('/').pop();
    const src = d.fields.imageUrl.stringValue;
    try {
      const { buf, type, via } = await getImage(src);
      if (DRY) { console.log(`  [dry] ${label}: ${buf.length} bytes ready (${via})`); continue; }
      const url = await upload(buf, type, coll);
      await setImageUrl(d.name, url);
      log.push({ coll, label, from: src, to: url });
      console.log(`  ✓ ${label} → ${url}`);
    } catch (e) {
      console.log(`  ✗ ${label}: ${e.message}`);
      log.push({ coll, label, from: src, error: e.message });
    }
  }
}
writeFileSync('out/migrate-images-log.json', JSON.stringify(log, null, 2));
console.log(`\nDone. Log written to out/migrate-images-log.json${DRY ? ' (dry run: nothing changed)' : ''}.`);

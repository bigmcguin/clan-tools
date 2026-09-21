<?php
// Refuse direct requests: this file is only ever included by upload.php / delete.php.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
// ── Clan image host configuration ──────────────────────────────────────────
// Edit these, then upload the whole clan-img folder to your Hostinger site.

// Must match CLAN_PASSWORD in loadouts.html / callouts.html. Uploads and
// deletes without this key are refused. (Friction-level protection: the
// password is visible in the page source, same as the rest of the site.)
const CLAN_UPLOAD_KEY = 'Bubbles';

// Origins allowed to call upload.php / delete.php from the browser.
// Add your site's exact origin(s): scheme + host, no trailing slash.
const ALLOWED_ORIGINS = [
  'https://clan.stridlabs.com',
  'https://bigmcguin.github.io',
];

// Largest upload accepted, in bytes. Pages compress to ~1400px JPEG before
// sending, so real uploads are usually well under 1 MB.
const MAX_BYTES = 6 * 1024 * 1024;

// Folders images may be filed under (one per page).
const ALLOWED_FOLDERS = ['loadouts', 'callouts'];

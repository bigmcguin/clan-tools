<?php
// Refuse direct requests: this file is only ever included by upload.php / delete.php.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
// Shared helpers for upload.php and delete.php. Not called directly.
require __DIR__ . '/config.php';

function send_json(int $status, array $body): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body);
  exit;
}

// CORS: echo back the origin only if it is on the allow-list; answer preflight.
function cors_and_preflight(bool $allowGet = false): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: X-Clan-Key, Content-Type');
    header('Access-Control-Max-Age: 86400');
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
  $method = $_SERVER['REQUEST_METHOD'] ?? '';
  if ($method !== 'POST' && !($allowGet && $method === 'GET')) {
    send_json(405, ['ok' => false, 'error' => $allowGet ? 'GET or POST only' : 'POST only']);
  }
}

function require_key(): void {
  $key = $_SERVER['HTTP_X_CLAN_KEY'] ?? ($_POST['key'] ?? '');
  if (!is_string($key) || !hash_equals(CLAN_UPLOAD_KEY, $key)) {
    send_json(401, ['ok' => false, 'error' => 'Wrong clan password']);
  }
}

// Public URL of this clan-img folder, derived from the request.
function base_url(): string {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  $scheme = $https ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
  $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
  return "$scheme://$host$dir";
}

// Member reference images live at files/members/<member key>/<slot>.<ext>.
// The key is the member's UID (digits) or a lowercase slug of their name.
const MEMBER_FOLDER = 'members';
const MEMBER_SLOTS  = ['codm', 'minecraft', 'roblox', 'poster'];
const MEMBER_KEY_RE = '[a-z0-9][a-z0-9-]{0,63}';

// Turn a stored URL or relative path into a safe "folder/…/name.ext" or null.
// Accepts both random-named uploads (loadouts/callouts) and member slot files.
function relative_file_from(string $urlOrPath): ?string {
  $path = parse_url($urlOrPath, PHP_URL_PATH) ?? $urlOrPath;
  if (preg_match('~(?:^|/)files/((?:[a-z]+)/[0-9]+-[a-z0-9]+\.(?:jpg|png|webp))$~', $path, $m)) {
    [$folder] = explode('/', $m[1], 2);
    return in_array($folder, ALLOWED_FOLDERS, true) ? $m[1] : null;
  }
  $slots = implode('|', MEMBER_SLOTS);
  if (preg_match('~(?:^|/)files/(' . MEMBER_FOLDER . '/' . MEMBER_KEY_RE . '/(?:' . $slots . ')\.(?:jpg|png|webp))$~', $path, $m)) {
    return $m[1];
  }
  return null;
}

// Public URL for a member slot file, with a content-hash stamp so a replaced
// image isn't served stale from the browser's cache (files/.htaccess caches hard).
function member_file_url(string $key, string $slot, string $ext, string $absPath): string {
  $stamp = substr((string) @md5_file($absPath), 0, 10) ?: (string) time();
  return base_url() . "/files/" . MEMBER_FOLDER . "/$key/$slot.$ext?v=$stamp";
}

// { "<key>": { "<slot>": "<url>", … }, … } for every member image on disk.
function member_index(): array {
  $out = [];
  $root = __DIR__ . '/files/' . MEMBER_FOLDER;
  if (!is_dir($root)) return $out;
  foreach (glob("$root/*", GLOB_ONLYDIR) ?: [] as $dir) {
    $key = basename($dir);
    if (!preg_match('~^' . MEMBER_KEY_RE . '$~', $key)) continue;
    foreach (MEMBER_SLOTS as $slot) {
      foreach (['jpg', 'png', 'webp'] as $ext) {
        $f = "$dir/$slot.$ext";
        if (is_file($f)) { $out[$key][$slot] = member_file_url($key, $slot, $ext, $f); break; }
      }
    }
  }
  return $out;
}

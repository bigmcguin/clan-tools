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
function cors_and_preflight(): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: X-Clan-Key, Content-Type');
    header('Access-Control-Max-Age: 86400');
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') send_json(405, ['ok' => false, 'error' => 'POST only']);
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

// Turn a stored URL or relative path into a safe "folder/name.ext" or null.
function relative_file_from(string $urlOrPath): ?string {
  $path = parse_url($urlOrPath, PHP_URL_PATH) ?? $urlOrPath;
  if (!preg_match('~(?:^|/)files/((?:[a-z]+)/[0-9]+-[a-z0-9]+\.(?:jpg|png|webp))$~', $path, $m)) return null;
  [$folder] = explode('/', $m[1], 2);
  return in_array($folder, ALLOWED_FOLDERS, true) ? $m[1] : null;
}

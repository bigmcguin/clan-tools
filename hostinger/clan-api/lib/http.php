<?php
// Request/response helpers: JSON replies, CORS, method checks, body parsing.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

function send_json(int $status, array $body): never {
  if (!headers_sent()) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
  }
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

function request_method(): string {
  return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

/**
 * Answer CORS for allowed origins, handle the preflight, and refuse other
 * methods. Write requests from origins that aren't on the list are refused
 * outright (browsers would block reading the reply anyway).
 */
function cors(array $methods): void {
  $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
  $allowed = in_array($origin, (array) cfg('allowed_origins', []), true);
  if ($origin !== '' && $allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: ' . implode(', ', array_unique([...$methods, 'OPTIONS'])));
    header('Access-Control-Allow-Headers: X-Clan-Key, X-Admin-Key, Content-Type');
    header('Access-Control-Max-Age: 86400');
  }
  $method = request_method();
  if ($method === 'OPTIONS') { http_response_code(204); exit; }
  if (!in_array($method, $methods, true)) {
    send_json(405, ['ok' => false, 'error' => implode(' or ', $methods) . ' only']);
  }
  if ($origin !== '' && !$allowed && $method !== 'GET') {
    send_json(403, ['ok' => false, 'error' => "Origin $origin is not allowed — add it to allowed_origins in config.php"]);
  }
}

function header_value(string $name): string {
  $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
  return trim((string) ($_SERVER[$key] ?? ''));
}

/** JSON request body as an array (max 2 MB). */
function read_json_body(): array {
  $raw = file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024 + 1);
  if ($raw === false || $raw === '') return [];
  if (strlen($raw) > 2 * 1024 * 1024) throw new ApiError(413, 'Request too large');
  $data = json_decode($raw, true);
  if (!is_array($data)) throw new ApiError(400, 'Body must be JSON');
  return $data;
}

function client_ip(): string {
  return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** Short, salted hash of the caller's IP so logs and limits never store raw IPs. */
function ip_tag(): string {
  return substr(hash('sha256', client_ip() . '|' . install_salt()), 0, 16);
}

/** Public URL of the API folder (no trailing slash). */
function base_url(): string {
  $configured = cfg('public_base_url');
  if (is_string($configured) && $configured !== '') return rtrim($configured, '/');
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
  $scheme = $https ? 'https' : 'http';
  $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
  $dir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
  return "$scheme://$host$dir";
}

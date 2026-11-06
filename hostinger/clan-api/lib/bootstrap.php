<?php
// Loaded first by every endpoint: settings, secrets, helpers, error handling.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const CLAN_API_VERSION = '2.0.0';

ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/http.php';
require __DIR__ . '/storage.php';
require __DIR__ . '/auth.php';

/** Where secrets.php may live, most private first. */
function secrets_candidates(): array {
  $list = [];
  $env = getenv('CLAN_API_SECRETS');
  if (is_string($env) && $env !== '') $list[] = $env;          // local tests
  $list[] = dirname(__DIR__, 2) . '/clan-api-secrets.php';      // one level above the API folder
  $list[] = dirname(__DIR__) . '/secrets.php';                  // next to config.php
  return $list;
}

function load_settings(): array {
  $config = require dirname(__DIR__) . '/config.php';
  $secrets = [];
  $from = null;
  foreach (secrets_candidates() as $file) {
    if (is_file($file)) {
      $loaded = require $file;
      if (is_array($loaded)) { $secrets = $loaded; $from = $file; }
      break;
    }
  }
  $settings = array_replace($config, $secrets);
  $settings['_secrets_file'] = $from;
  foreach (['anthropic_api_key', 'clan_password', 'admin_password'] as $k) {
    $settings[$k] = trim((string) ($settings[$k] ?? ''));
  }
  return $settings;
}

$GLOBALS['CLAN_SETTINGS'] = load_settings();

function cfg(string $key, mixed $default = null): mixed {
  return $GLOBALS['CLAN_SETTINGS'][$key] ?? $default;
}

/** Errors the browser should see as a clean JSON message with an HTTP status. */
class ApiError extends RuntimeException {
  public function __construct(public readonly int $status, string $message, public readonly array $extra = []) {
    parent::__construct($message);
  }
}

function log_error(Throwable $e): void {
  $line = sprintf("[%s] %s: %s in %s:%d\n", gmdate('c'), get_class($e), $e->getMessage(), $e->getFile(), $e->getLine());
  @file_put_contents(data_dir() . '/error.log', $line, FILE_APPEND | LOCK_EX);
}

set_exception_handler(function (Throwable $e): void {
  if ($e instanceof ApiError) send_json($e->status, ['ok' => false, 'error' => $e->getMessage()] + $e->extra);
  log_error($e);
  send_json(500, ['ok' => false, 'error' => 'Server error — check data/error.log on the server']);
});

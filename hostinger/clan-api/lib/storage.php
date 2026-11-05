<?php
// File storage: JSON read/write with locking and atomic replace.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

function data_dir(): string {
  static $dir = null;
  if ($dir !== null) return $dir;
  $dir = rtrim((string) cfg('data_dir', dirname(__DIR__) . '/data'), '/');
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  return $dir;
}

function data_path(string $rel): string {
  $path = data_dir() . '/' . ltrim($rel, '/');
  $parent = dirname($path);
  if (!is_dir($parent)) @mkdir($parent, 0755, true);
  return $path;
}

/** Random per-install salt for hashing IPs (created on first use). */
function install_salt(): string {
  static $salt = null;
  if ($salt !== null) return $salt;
  $file = data_path('salt.txt');
  $salt = is_file($file) ? trim((string) file_get_contents($file)) : '';
  if (strlen($salt) < 16) {
    $salt = bin2hex(random_bytes(16));
    @file_put_contents($file, $salt, LOCK_EX);
  }
  return $salt;
}

function read_json(string $file, mixed $default = null): mixed {
  if (!is_file($file)) return $default;
  $raw = file_get_contents($file);
  if ($raw === false || $raw === '') return $default;
  $data = json_decode($raw, true);
  return $data === null ? $default : $data;
}

function encode_json(mixed $data, bool $pretty = false): string {
  $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;
  return json_encode($data, $pretty ? $flags | JSON_PRETTY_PRINT : $flags);
}

/** Write via a temp file + rename so readers never see a half-written file. */
function write_json_atomic(string $file, mixed $data, bool $pretty = false): void {
  $tmp = $file . '.tmp-' . bin2hex(random_bytes(4));
  if (file_put_contents($tmp, encode_json($data, $pretty)) === false) {
    throw new ApiError(500, 'Could not write to the data folder — check it is writable');
  }
  @chmod($tmp, 0644);
  if (!rename($tmp, $file)) {
    @unlink($tmp);
    throw new ApiError(500, 'Could not save data file');
  }
}

/** Run $fn while holding an exclusive lock named $name. */
function with_lock(string $name, callable $fn): mixed {
  $fh = fopen(data_path("locks/$name.lock"), 'c');
  if ($fh === false) throw new ApiError(500, 'Could not open lock file — check the data folder is writable');
  try {
    flock($fh, LOCK_EX);
    return $fn();
  } finally {
    flock($fh, LOCK_UN);
    fclose($fh);
  }
}

function append_jsonl(string $file, array $record): void {
  @file_put_contents($file, encode_json($record) . "\n", FILE_APPEND | LOCK_EX);
}

/**
 * Sliding-window counter. Returns true and records a hit when under $max hits
 * in the last $window seconds; false when the limit is reached.
 */
function rate_take(string $bucket, int $max, int $window): bool {
  if ($max <= 0) return false;
  $bucket = preg_replace('/[^a-z0-9_-]/i', '', $bucket);
  return with_lock('limits', function () use ($bucket, $max, $window): bool {
    $file = data_path("limits/$bucket.json");
    $now = time();
    $hits = array_values(array_filter((array) read_json($file, []), fn($t) => is_int($t) && $t > $now - $window));
    if (count($hits) >= $max) return false;
    $hits[] = $now;
    write_json_atomic($file, $hits);
    return true;
  });
}

/** Hits recorded in the window, without adding one. */
function rate_count(string $bucket, int $window): int {
  $bucket = preg_replace('/[^a-z0-9_-]/i', '', $bucket);
  $now = time();
  $hits = (array) read_json(data_path("limits/$bucket.json"), []);
  return count(array_filter($hits, fn($t) => is_int($t) && $t > $now - $window));
}

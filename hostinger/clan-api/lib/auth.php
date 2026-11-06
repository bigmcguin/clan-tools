<?php
// Passwords are checked here on the server — they never appear in the site's
// page source. Browsers send them in X-Clan-Key / X-Admin-Key headers.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

function password_matches(string $given, string $expected, bool $ignoreCase): bool {
  if ($given === '' || $expected === '') return false;
  if ($ignoreCase) {
    $given = mb_strtolower($given, 'UTF-8');
    $expected = mb_strtolower($expected, 'UTF-8');
  }
  return hash_equals($expected, $given);
}

/** 'admin', 'clan' or null for the current request's headers. */
function request_role(): ?string {
  $admin = header_value('X-Admin-Key');
  if ($admin !== '' && password_matches($admin, (string) cfg('admin_password', ''), false)) return 'admin';
  $clan = header_value('X-Clan-Key');
  if ($clan !== '' && password_matches($clan, (string) cfg('clan_password', ''), true)) return 'clan';
  return null;
}

function auth_fail_bucket(): string { return 'authfail-' . ip_tag(); }

function loadout_add_role(): string { return cfg('loadout_add_role', 'public') === 'clan' ? 'clan' : 'public'; }
function loadout_delete_role(): string { return cfg('loadout_delete_role', 'admin') === 'clan' ? 'clan' : 'admin'; }

/**
 * Role for an action open to $need ('public', 'clan' or 'admin'). Public
 * actions never ask for a password, but a valid one still counts (so clan
 * members and admins get their own, larger limits).
 */
function role_for(string $need): string {
  return $need === 'public' ? (request_role() ?? 'public') : require_role($need);
}

function auth_blocked(): bool {
  return rate_count(auth_fail_bucket(), (int) cfg('auth_fail_window', 900)) >= (int) cfg('auth_fail_limit', 8);
}

/**
 * Stop the request unless it carries a password for $role ('clan' or
 * 'admin'; the admin password also counts as clan). Returns the role found.
 */
function require_role(string $role): string {
  if (auth_blocked()) {
    send_json(429, ['ok' => false, 'error' => 'Too many wrong passwords from this device — try again in 15 minutes']);
  }
  $have = request_role();
  if ($have === 'admin' || ($role === 'clan' && $have === 'clan')) return $have;

  if ($role === 'admin' && cfg('admin_password', '') === '') {
    send_json(503, ['ok' => false, 'error' => 'Admin password is not set on the server yet (secrets.php)']);
  }
  if ($role === 'clan' && cfg('clan_password', '') === '' && cfg('admin_password', '') === '') {
    send_json(503, ['ok' => false, 'error' => 'Clan password is not set on the server yet (secrets.php)']);
  }
  $sent = header_value('X-Admin-Key') !== '' || header_value('X-Clan-Key') !== '';
  if ($sent) rate_take(auth_fail_bucket(), 1000, (int) cfg('auth_fail_window', 900));
  send_json(401, [
    'ok' => false,
    'error' => $sent ? 'Wrong password' : ($role === 'admin' ? 'Admin password required' : 'Clan password required'),
    'needs' => $role,
  ]);
}

<?php
// GET  → { ok, roster: { version, updatedAt, summary, members } | null }   (public)
// POST { baseVersion, members, summary } → saves a new version     (admin)
//      409 + the current roster if someone else saved first.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/roster.php';
cors(['GET', 'POST']);

if (request_method() === 'GET') {
  send_json(200, ['ok' => true, 'roster' => roster_public(roster_load())]);
}

require_role('admin');
$body = read_json_body();
$base = $body['baseVersion'] ?? null;
if (!is_int($base) || $base < 0) throw new ApiError(400, 'baseVersion (a whole number) is required');
try {
  $saved = roster_save($body['members'] ?? null, $base, (string) ($body['summary'] ?? ''));
} catch (RosterConflict $c) {
  send_json(409, [
    'ok' => false,
    'error' => 'Someone saved the roster after you loaded it. The latest version has been loaded — please redo your change.',
    'roster' => $c->current,
  ]);
}
send_json(200, ['ok' => true, 'roster' => roster_public($saved)]);

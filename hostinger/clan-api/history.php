<?php
// GET  → { ok, versions: [{ version, updatedAt, summary, active, total }] }   (admin)
// POST { restoreVersion, baseVersion } → saves that old version as the newest (admin)
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/roster.php';
cors(['GET', 'POST']);
require_role('admin');

if (request_method() === 'GET') {
  send_json(200, ['ok' => true, 'versions' => history_list()]);
}

$body = read_json_body();
$restore = $body['restoreVersion'] ?? null;
$base = $body['baseVersion'] ?? null;
if (!is_int($restore) || !is_int($base)) throw new ApiError(400, 'restoreVersion and baseVersion are required');
$old = history_load($restore);
if ($old === null) throw new ApiError(404, "Version $restore is not in the history any more");
try {
  $saved = roster_save($old['members'], $base, "Restored version $restore");
} catch (RosterConflict $c) {
  send_json(409, ['ok' => false, 'error' => 'The roster changed meanwhile — reloaded, try again.', 'roster' => $c->current]);
}
send_json(200, ['ok' => true, 'roster' => roster_public($saved)]);

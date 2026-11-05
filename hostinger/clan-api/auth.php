<?php
// POST {"role": "clan" | "admin"} with the X-Clan-Key or X-Admin-Key header
// → { ok: true, role } when the password is right. Used by the site's unlock
// dialogs; wrong guesses count towards the per-device lockout.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
cors(['POST']);
$body = read_json_body();
$want = ($body['role'] ?? 'clan') === 'admin' ? 'admin' : 'clan';
$role = require_role($want);
send_json(200, ['ok' => true, 'role' => $role]);

<?php
// GET → { ok: true, members: { "<member key>": { codm: url, minecraft: url, … } } }
// Public (no key needed): it only lists files that are already publicly served.
require __DIR__ . '/_common.php';
cors_and_preflight(true);
header('Cache-Control: no-store');
send_json(200, ['ok' => true, 'members' => member_index()]);

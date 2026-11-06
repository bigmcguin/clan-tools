<?php
// GET → { ok, members: { "<member id>": { codm: url, minecraft: url, … } } }
// Public: it only lists images that are already publicly served.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/images.php';
cors(['GET']);
send_json(200, ['ok' => true, 'members' => (object) member_image_index()]);

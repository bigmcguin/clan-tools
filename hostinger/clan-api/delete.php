<?php
// POST url=<image URL or files/… path> → removes a file this API stored.
// Loadout screenshots need loadout_delete_role (admin by default), callout
// screenshots the clan password, member images member_images_role.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/images.php';
cors(['POST']);

$url = (string) ($_POST['url'] ?? '');
if ($url === '') {
  $body = read_json_body();
  $url = is_string($body['url'] ?? null) ? $body['url'] : '';
}
$file = managed_file($url);
if ($file === null) throw new ApiError(400, 'Not an image managed by this API');
require_role(match ($file['folder']) {
  MEMBER_FOLDER => member_image_role(),
  'loadouts' => loadout_delete_role(),
  default => 'clan',
});

$path = files_dir() . '/' . $file['rel'];
if (!is_file($path)) send_json(200, ['ok' => true, 'deleted' => false, 'note' => 'Already gone']);
if (!unlink($path)) throw new ApiError(500, 'Could not delete file');
send_json(200, ['ok' => true, 'deleted' => true]);

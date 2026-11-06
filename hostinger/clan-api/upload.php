<?php
// POST multipart:
//   image=<file>, folder=loadouts|callouts                          (clan password)
//   image=<file>, folder=members, member=<member id>, slot=<slot>    (member_images_role)
// → { ok, url, bytes }
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/images.php';
cors(['POST']);

$folder = (string) ($_POST['folder'] ?? '');
if ($folder === MEMBER_FOLDER) {
  require_role(member_image_role());
  $key = strtolower(trim((string) ($_POST['member'] ?? '')));
  $slot = (string) ($_POST['slot'] ?? '');
  if (!preg_match('~^' . MEMBER_KEY_RE . '$~', $key)) throw new ApiError(400, 'Bad member id');
  if (!in_array($slot, (array) cfg('member_image_slots', []), true)) throw new ApiError(400, 'Unknown image slot');
  $img = uploaded_image('image');
  send_json(200, ['ok' => true, 'url' => save_member_image($img, $key, $slot), 'bytes' => $img['size']]);
}
if (!in_array($folder, SCREENSHOT_FOLDERS, true)) throw new ApiError(400, 'Unknown folder');
require_role('clan');
$img = uploaded_image('image');
send_json(200, ['ok' => true, 'url' => save_screenshot($img, $folder), 'bytes' => $img['size']]);

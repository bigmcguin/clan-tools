<?php
// POST multipart/form-data: image=<file>, folder=loadouts|callouts
//                        or image=<file>, folder=members, member=<UID or slug>, slot=codm|minecraft|roblox|poster
// Header: X-Clan-Key: <clan password>
// Returns: { ok: true, url: "https://…/clan-img/files/loadouts/1699999999-ab12cd.jpg" }
require __DIR__ . '/_common.php';
cors_and_preflight();
require_key();

// Two modes:
//   folder=loadouts|callouts                       → random filename (screenshots)
//   folder=members&member=<key>&slot=<codm|…>      → fixed files/members/<key>/<slot>.<ext>
$folder = $_POST['folder'] ?? '';
$memberKey = $memberSlot = null;
if ($folder === MEMBER_FOLDER) {
  $memberKey  = strtolower(trim((string) ($_POST['member'] ?? '')));
  $memberSlot = (string) ($_POST['slot'] ?? '');
  if (!preg_match('~^' . MEMBER_KEY_RE . '$~', $memberKey)) send_json(400, ['ok' => false, 'error' => 'Bad member key']);
  if (!in_array($memberSlot, MEMBER_SLOTS, true)) send_json(400, ['ok' => false, 'error' => 'Unknown image slot']);
} elseif (!in_array($folder, ALLOWED_FOLDERS, true)) {
  send_json(400, ['ok' => false, 'error' => 'Unknown folder']);
}

if (!isset($_FILES['image']) || !is_uploaded_file($_FILES['image']['tmp_name'])) {
  $err = $_FILES['image']['error'] ?? 'none';
  send_json(400, ['ok' => false, 'error' => "No image received (upload error $err)"]);
}
$f = $_FILES['image'];
if ($f['size'] <= 0 || $f['size'] > MAX_BYTES) send_json(413, ['ok' => false, 'error' => 'Image too large']);

// Trust the bytes, not the filename or the declared type.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->file($f['tmp_name']);
$ext   = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? null;
if ($ext === null || @getimagesize($f['tmp_name']) === false) {
  send_json(415, ['ok' => false, 'error' => 'Only JPEG, PNG or WebP images are accepted']);
}

if ($memberKey !== null) {
  $dir = __DIR__ . '/files/' . MEMBER_FOLDER . "/$memberKey";
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) send_json(500, ['ok' => false, 'error' => 'Cannot create folder']);
  // One file per slot: drop any previous version whatever its extension.
  foreach (['jpg', 'png', 'webp'] as $old) { $prev = "$dir/$memberSlot.$old"; if (is_file($prev)) @unlink($prev); }
  $dest = "$dir/$memberSlot.$ext";
  if (!move_uploaded_file($f['tmp_name'], $dest)) send_json(500, ['ok' => false, 'error' => 'Could not save file']);
  @chmod($dest, 0644);
  send_json(200, ['ok' => true, 'url' => member_file_url($memberKey, $memberSlot, $ext, $dest), 'bytes' => filesize($dest)]);
}

$dir = __DIR__ . "/files/$folder";
if (!is_dir($dir) && !mkdir($dir, 0755, true)) send_json(500, ['ok' => false, 'error' => 'Cannot create folder']);

$name = sprintf('%d-%s.%s', (int) round(microtime(true) * 1000), substr(bin2hex(random_bytes(4)), 0, 6), $ext);
$dest = "$dir/$name";
if (!move_uploaded_file($f['tmp_name'], $dest)) send_json(500, ['ok' => false, 'error' => 'Could not save file']);
@chmod($dest, 0644);

send_json(200, ['ok' => true, 'url' => base_url() . "/files/$folder/$name", 'bytes' => filesize($dest)]);

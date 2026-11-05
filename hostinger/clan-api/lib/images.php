<?php
// Image files: loadout/callout screenshots (random names) and member
// reference images (files/members/<member id>/<slot>.<ext>).
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const SCREENSHOT_FOLDERS = ['loadouts', 'callouts'];
const MEMBER_FOLDER = 'members';
const MEMBER_KEY_RE = '[a-z0-9][a-z0-9-]{0,63}';
const IMAGE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

function files_dir(): string { return dirname(__DIR__) . '/files'; }

/**
 * Validate the uploaded file in $_FILES[$field]. Returns
 * ['path' => tmp path, 'mime' => sniffed type, 'ext' => extension, 'size' => bytes].
 */
function uploaded_image(string $field = 'image'): array {
  $f = $_FILES[$field] ?? null;
  if (!is_array($f) || !is_uploaded_file((string) ($f['tmp_name'] ?? ''))) {
    $code = is_array($f) ? (int) ($f['error'] ?? -1) : -1;
    if (in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) throw new ApiError(413, 'Image too large');
    throw new ApiError(400, 'No image received');
  }
  $size = (int) $f['size'];
  if ($size <= 0 || $size > (int) cfg('max_upload_bytes', 8 * 1024 * 1024)) throw new ApiError(413, 'Image too large');
  // Trust the bytes, not the file name or the browser's claimed type.
  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
  $ext = IMAGE_TYPES[$mime] ?? null;
  if ($ext === null || @getimagesize($f['tmp_name']) === false) {
    throw new ApiError(415, 'Only JPEG, PNG or WebP images are accepted');
  }
  return ['path' => $f['tmp_name'], 'mime' => $mime, 'ext' => $ext, 'size' => $size];
}

function member_image_role(): string {
  return cfg('member_images_role', 'admin') === 'clan' ? 'clan' : 'admin';
}

/** URL for a member slot file, stamped with a content hash to beat caches. */
function member_file_url(string $key, string $slot, string $ext, string $abs): string {
  $stamp = substr((string) @md5_file($abs), 0, 10) ?: (string) time();
  return base_url() . '/files/' . MEMBER_FOLDER . "/$key/$slot.$ext?v=$stamp";
}

function save_member_image(array $img, string $key, string $slot): string {
  $dir = files_dir() . '/' . MEMBER_FOLDER . "/$key";
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) throw new ApiError(500, 'Cannot create image folder');
  foreach (IMAGE_TYPES as $old) { $prev = "$dir/$slot.$old"; if (is_file($prev)) @unlink($prev); }
  $dest = "$dir/$slot.{$img['ext']}";
  if (!move_uploaded_file($img['path'], $dest)) throw new ApiError(500, 'Could not save image');
  @chmod($dest, 0644);
  return member_file_url($key, $slot, $img['ext'], $dest);
}

function save_screenshot(array $img, string $folder): string {
  $dir = files_dir() . "/$folder";
  if (!is_dir($dir) && !mkdir($dir, 0755, true)) throw new ApiError(500, 'Cannot create image folder');
  $name = sprintf('%d-%s.%s', (int) round(microtime(true) * 1000), bin2hex(random_bytes(3)), $img['ext']);
  $dest = "$dir/$name";
  if (!move_uploaded_file($img['path'], $dest)) throw new ApiError(500, 'Could not save image');
  @chmod($dest, 0644);
  return base_url() . "/files/$folder/$name";
}

/**
 * Map a stored URL (or files/… path) to ['rel' => 'folder/…', 'folder' => …],
 * or null if it isn't a file this API manages.
 */
function managed_file(string $urlOrPath): ?array {
  $path = parse_url($urlOrPath, PHP_URL_PATH) ?: $urlOrPath;
  $folders = implode('|', SCREENSHOT_FOLDERS);
  if (preg_match("~(?:^|/)files/(($folders)/[0-9]+-[a-f0-9]+\.(?:jpg|png|webp))$~", $path, $m)) {
    return ['rel' => $m[1], 'folder' => $m[2]];
  }
  $slots = implode('|', (array) cfg('member_image_slots', []));
  if (preg_match('~(?:^|/)files/(' . MEMBER_FOLDER . '/' . MEMBER_KEY_RE . "/(?:$slots)\.(?:jpg|png|webp))$~", $path, $m)) {
    return ['rel' => $m[1], 'folder' => MEMBER_FOLDER];
  }
  return null;
}

/** { "<member id>": { "<slot>": url } } for every member image on disk. */
function member_image_index(): array {
  $out = [];
  $root = files_dir() . '/' . MEMBER_FOLDER;
  if (!is_dir($root)) return $out;
  foreach (glob("$root/*", GLOB_ONLYDIR) ?: [] as $dir) {
    $key = basename($dir);
    if (!preg_match('~^' . MEMBER_KEY_RE . '$~', $key)) continue;
    foreach ((array) cfg('member_image_slots', []) as $slot) {
      foreach (IMAGE_TYPES as $ext) {
        $f = "$dir/$slot.$ext";
        if (is_file($f)) { $out[$key][$slot] = member_file_url($key, $slot, $ext, $f); break; }
      }
    }
  }
  return $out;
}

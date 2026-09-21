<?php
// POST form or JSON: url=<full image URL or files/… path>
// Header: X-Clan-Key: <clan password>
// Only deletes files inside ./files/<allowed folder>/ that match our naming pattern.
require __DIR__ . '/_common.php';
cors_and_preflight();
require_key();

$url = $_POST['url'] ?? '';
if ($url === '') {
  $raw = json_decode(file_get_contents('php://input'), true);
  $url = is_array($raw) ? ($raw['url'] ?? '') : '';
}
$rel = is_string($url) ? relative_file_from($url) : null;
if ($rel === null) send_json(400, ['ok' => false, 'error' => 'Not an image managed by this host']);

$path = __DIR__ . "/files/$rel";
if (!is_file($path)) send_json(200, ['ok' => true, 'deleted' => false, 'note' => 'Already gone']);
if (!unlink($path)) send_json(500, ['ok' => false, 'error' => 'Could not delete file']);
send_json(200, ['ok' => true, 'deleted' => true]);

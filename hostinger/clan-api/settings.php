<?php
// Member settings (sensitivity / HUD share codes and other CODM settings).
// GET                                       → { ok, editRole, settings: { "<member id>": { codes, other, version, updatedAt, by } } }   (anyone)
// GET  ?history=<member id>                 → { ok, versions: [...] }, newest first                                                  (admin)
// POST { memberId, settings, baseVersion }  → saves; 409 + the current entry if someone saved first      (settings_edit_role: anyone by default)
// POST { memberId, restoreVersion }         → makes an earlier version current again                                                (admin)
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/roster.php';
require __DIR__ . '/lib/settings.php';
cors(['GET', 'POST']);

if (request_method() === 'GET') {
  $historyOf = (string) ($_GET['history'] ?? '');
  if ($historyOf !== '') {
    require_role('admin');
    if (!preg_match(MEMBER_ID_RE, $historyOf)) throw new ApiError(400, 'Unknown member');
    send_json(200, ['ok' => true, 'versions' => settings_history($historyOf)]);
  }
  $all = array_map('settings_public', array_filter(settings_load_all(), 'is_array'));
  send_json(200, ['ok' => true, 'editRole' => settings_edit_role(), 'settings' => (object) $all]);
}

$body = read_json_body();
$id = (string) ($body['memberId'] ?? '');
if (!settings_member_exists($id)) throw new ApiError(404, "That member isn't on the roster");

if (array_key_exists('restoreVersion', $body)) {
  require_role('admin');
  $wanted = $body['restoreVersion'];
  if (!is_int($wanted)) throw new ApiError(400, 'restoreVersion must be a whole number');
  $old = null;
  foreach (settings_history($id) as $h) {
    if (is_array($h) && (int) ($h['version'] ?? 0) === $wanted) { $old = $h; break; }
  }
  if ($old === null) throw new ApiError(404, "Version $wanted is not in the history any more");
  $saved = settings_save($id, settings_clean($old), null, 'admin');
  send_json(200, ['ok' => true, 'entry' => settings_public($saved)]);
}

$role = role_for(settings_edit_role());
if ($role === 'public' && !rate_take('settings-ip-' . ip_tag(), (int) cfg('public_settings_hourly_per_ip', 30), 3600)) {
  throw new ApiError(429, 'Too many saves from this device in the last hour — try again later');
}
$base = $body['baseVersion'] ?? null;
if ($base !== null && !is_int($base)) throw new ApiError(400, 'baseVersion must be a whole number');
try {
  $saved = settings_save($id, settings_clean($body['settings'] ?? null), $base, $role);
} catch (SettingsConflict $c) {
  send_json(409, [
    'ok' => false,
    'error' => 'Someone else saved these settings after you opened them. The latest version has been loaded — check it and save again.',
    'entry' => $c->current,
  ]);
}
send_json(200, ['ok' => true, 'entry' => settings_public($saved)]);

<?php
// GET → health check. Open https://<api>/status.php after installing: every
// value under "checks" should be true. Never shows secret values.
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/roster.php';
require_once __DIR__ . '/lib/claude.php';
cors(['GET']);

$dataDir = data_dir();
$filesDir = __DIR__ . '/files';
$roster = roster_load();
$checks = [
  'phpVersionOk'   => version_compare(PHP_VERSION, '8.1.0', '>='),
  'curlExtension'  => extension_loaded('curl'),
  'claudeSdk'      => sdk_available(),
  'dataWritable'   => is_dir($dataDir) && is_writable($dataDir),
  'filesWritable'  => is_dir($filesDir) && is_writable($filesDir),
  'secretsFile'    => cfg('_secrets_file') !== null,
  'anthropicKey'   => str_starts_with((string) cfg('anthropic_api_key', ''), 'sk-'),
  'clanPassword'   => cfg('clan_password', '') !== '',
  'adminPassword'  => cfg('admin_password', '') !== '',
];
send_json(200, [
  'ok' => !in_array(false, $checks, true),
  'service' => 'tb-clan-api',
  'version' => CLAN_API_VERSION,
  'php' => PHP_VERSION,
  'checks' => $checks,
  'ai' => ['enabled' => ai_configured(), 'model' => (string) cfg('anthropic_model')],
  'memberImagesRole' => member_images_role_public(),
  'loadouts' => ['addRole' => loadout_add_role(), 'deleteRole' => loadout_delete_role()],
  'settings' => ['editRole' => settings_edit_role()],
  'rosterVersion' => $roster ? (int) $roster['version'] : 0,
]);

function member_images_role_public(): string {
  return cfg('member_images_role', 'admin') === 'clan' ? 'clan' : 'admin';
}

<?php
// Member settings: sensitivity/HUD share codes and other CODM settings, kept
// per member id (so they stay attached when a name or UID changes).
//   data/settings.json                  { "<member id>": { codes, other, version, updatedAt, by, from } }
//   data/settings-history/<id>.json     earlier versions, newest first (admin can restore)
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/prompts.php';

class SettingsConflict extends RuntimeException {
  public function __construct(public readonly ?array $current) { parent::__construct('Settings changed meanwhile'); }
}

/** Who may save settings: 'public' (anyone), 'clan' or 'admin'. */
function settings_edit_role(): string {
  $role = cfg('settings_edit_role', 'public');
  return in_array($role, ['public', 'clan', 'admin'], true) ? $role : 'public';
}

/** One value: printable text on one line, trimmed and capped. */
function settings_value(mixed $v, int $max): string {
  if (!is_string($v) && !is_int($v) && !is_float($v)) return '';
  $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $v) ?? '';
  $s = trim(preg_replace('/\s{2,}/u', ' ', $s) ?? '');
  return mb_substr($s, 0, $max);
}

/** Only the known fields, each cleaned. Unknown keys are dropped. */
function settings_clean(mixed $in): array {
  $in = is_array($in) ? $in : [];
  $codes = is_array($in['codes'] ?? null) ? $in['codes'] : [];
  $other = is_array($in['other'] ?? null) ? $in['other'] : [];
  $out = ['codes' => [], 'other' => []];
  foreach (SETTINGS_CODES as $k) $out['codes'][$k] = settings_value($codes[$k] ?? '', SETTINGS_CODE_MAX);
  foreach (SETTINGS_OTHER as $k) $out['other'][$k] = settings_value($other[$k] ?? '', SETTINGS_VALUE_MAX);
  return $out;
}

function settings_file(): string { return data_path('settings.json'); }
function settings_history_file(string $id): string { return data_path("settings-history/$id.json"); }

function settings_load_all(): array {
  $all = read_json(settings_file(), []);
  return is_array($all) ? $all : [];
}

/** What anyone may see: everything except the hashed device tag. */
function settings_public(array $entry): array {
  unset($entry['from']);
  return $entry;
}

function settings_member_exists(string $id): bool {
  if (!preg_match(MEMBER_ID_RE, $id)) return false;
  $roster = roster_load();
  foreach ($roster['members'] ?? [] as $m) if (($m['id'] ?? '') === $id) return true;
  return false;
}

function settings_history(string $id): array {
  $list = read_json(settings_history_file($id), []);
  return is_array($list) ? array_values($list) : [];
}

/**
 * Save one member's settings. The previous version goes into its history.
 * $baseVersion: the version the editor started from (null = don't check).
 */
function settings_save(string $id, array $clean, ?int $baseVersion, string $by): array {
  return with_lock('settings', function () use ($id, $clean, $baseVersion, $by): array {
    $all = settings_load_all();
    $current = isset($all[$id]) && is_array($all[$id]) ? $all[$id] : null;
    $version = $current ? (int) ($current['version'] ?? 0) : 0;
    if ($baseVersion !== null && $baseVersion !== $version) throw new SettingsConflict($current ? settings_public($current) : null);
    // Saves from the same device in quick succession count as one edit, so
    // repeated saves can't push the earlier good versions out of the history.
    $window = (int) cfg('settings_history_merge_seconds', 600);
    $age = $current ? time() - (int) strtotime((string) ($current['updatedAt'] ?? '')) : PHP_INT_MAX;
    $sameEdit = $current && $window > 0 && ($current['from'] ?? '') === ip_tag() && $age < $window;
    if ($current && !$sameEdit) {
      $history = settings_history($id);
      array_unshift($history, $current);
      write_json_atomic(settings_history_file($id), array_slice($history, 0, max(1, (int) cfg('settings_history_keep', 30))));
    }
    $entry = $clean + ['version' => $version + 1, 'updatedAt' => gmdate('c'), 'by' => $by, 'from' => ip_tag()];
    $all[$id] = $entry;
    write_json_atomic(settings_file(), $all);
    return $entry;
  });
}

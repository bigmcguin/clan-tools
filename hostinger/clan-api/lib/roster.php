<?php
// The clan roster: one JSON file, saved with a version number. Every save
// keeps a snapshot in data/history/ so any change can be rolled back.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const ROSTER_MAX_MEMBERS = 2000;
const MEMBER_ID_RE = '/^[a-z0-9][a-z0-9-]{0,63}$/';
const DMY_RE = '/^(\d{2})\/(\d{2})\/(\d{2})$/';

class RosterConflict extends RuntimeException {
  public function __construct(public readonly ?array $current) { parent::__construct('Roster changed'); }
}

function roster_file(): string { return data_path('roster.json'); }

function roster_load(): ?array {
  $r = read_json(roster_file());
  return is_array($r) && isset($r['members']) && is_array($r['members']) ? $r : null;
}

function roster_public(?array $r): ?array {
  if ($r === null) return null;
  return [
    'version'   => (int) ($r['version'] ?? 0),
    'updatedAt' => (string) ($r['updatedAt'] ?? ''),
    'summary'   => (string) ($r['summary'] ?? ''),
    'members'   => array_values($r['members']),
  ];
}

// ── Validation ──────────────────────────────────────────────────────────────
function clean_text(mixed $v, int $max, string $field): string {
  if ($v === null) return '';
  if (!is_string($v) && !is_int($v) && !is_float($v)) throw new ApiError(400, "$field must be text");
  $s = trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string) $v) ?? '');
  if (mb_strlen($s, 'UTF-8') > $max) throw new ApiError(400, "$field is too long (max $max characters)");
  return $s;
}

function clean_dmy(mixed $v, string $field, bool $required = false): string {
  $s = clean_text($v, 10, $field);
  if ($s === '') {
    if ($required) throw new ApiError(400, "$field is required");
    return '';
  }
  if (!preg_match(DMY_RE, $s, $m) || !checkdate((int) $m[2], (int) $m[1], 2000 + (int) $m[3])) {
    throw new ApiError(400, "$field must be a date like 05/11/26 (got \"$s\")");
  }
  return $s;
}

function clean_member(mixed $m, int $i, array $slots): array {
  if (!is_array($m)) throw new ApiError(400, "Member #$i is not an object");
  $name = clean_text($m['name'] ?? '', 80, "Member #$i name");
  $label = $name !== '' ? $name : "#$i";
  if ($name === '') throw new ApiError(400, "Member #$i has no name");

  $id = clean_text($m['id'] ?? '', 64, "$label id");
  if (!preg_match(MEMBER_ID_RE, $id)) throw new ApiError(400, "$label has an invalid id");

  $uid = preg_replace('/\s+/', '', clean_text($m['uid'] ?? '', 40, "$label UID"));
  if ($uid !== '' && !preg_match('/^\d{5,25}$/', $uid)) throw new ApiError(400, "$label UID must be digits only");

  $slot = $m['slot'] ?? null;
  if ($slot === '' || $slot === null) $slot = null;
  elseif (is_numeric($slot) && (int) $slot == $slot && (int) $slot >= 0 && (int) $slot <= 9999) $slot = (int) $slot;
  else throw new ApiError(400, "$label slot must be a whole number");

  $status = $m['status'] ?? 'active';
  if (!in_array($status, ['active', 'former'], true)) throw new ApiError(400, "$label status must be active or former");

  $out = [
    'id' => $id,
    'slot' => $slot,
    'joinDate' => clean_dmy($m['joinDate'] ?? '', "$label join date"),
    'name' => $name,
    'uid' => $uid,
    'status' => $status,
  ];

  $tag = clean_text($m['tag'] ?? '', 30, "$label tag");
  if ($tag !== '') $out['tag'] = $tag;

  $away = $m['away'] ?? [];
  if (!is_array($away) || count($away) > 60) throw new ApiError(400, "$label away history is invalid");
  $periods = [];
  foreach (array_values($away) as $j => $p) {
    if (!is_array($p)) throw new ApiError(400, "$label away period #$j is invalid");
    $period = ['left' => clean_dmy($p['left'] ?? '', "$label left date", true)];
    $ret = clean_dmy($p['returned'] ?? '', "$label returned date");
    if ($ret !== '') $period['returned'] = $ret;
    if (!empty($p['removed'])) $period['removed'] = true;
    $periods[] = $period;
  }
  if ($periods) $out['away'] = $periods;

  $note = clean_text($m['note'] ?? '', 500, "$label note");
  if ($note !== '') $out['note'] = $note;

  $aliases = $m['aliases'] ?? [];
  if (!is_array($aliases) || count($aliases) > 30) throw new ApiError(400, "$label aliases are invalid");
  $clean = [];
  foreach ($aliases as $a) {
    $a = clean_text($a, 80, "$label alias");
    if ($a !== '' && $a !== $name && !in_array($a, $clean, true)) $clean[] = $a;
  }
  if ($clean) $out['aliases'] = $clean;

  $images = $m['images'] ?? [];
  if (!is_array($images)) throw new ApiError(400, "$label images are invalid");
  $imgs = [];
  foreach ($images as $slotName => $src) {
    if (!in_array($slotName, $slots, true)) continue;
    $src = clean_text($src, 500, "$label image");
    if ($src === '') continue;
    if (!preg_match('~^(assets/[A-Za-z0-9/_.-]+|https://[^\s"\'<>]+)$~', $src)) {
      throw new ApiError(400, "$label image link must be an https URL or an assets/ path");
    }
    $imgs[$slotName] = $src;
  }
  if ($imgs) $out['images'] = $imgs;

  $tier = $m['tier'] ?? null;
  if ($tier !== null && $tier !== '') {
    if (!is_numeric($tier) || (int) $tier < 0 || (int) $tier > 100000) throw new ApiError(400, "$label tier is invalid");
    $out['tier'] = (int) $tier;
  }
  return $out;
}

function roster_clean_members(mixed $members): array {
  if (!is_array($members) || !array_is_list($members)) throw new ApiError(400, 'members must be a list');
  if (count($members) > ROSTER_MAX_MEMBERS) throw new ApiError(400, 'Too many members');
  $slots = (array) cfg('member_image_slots', []);
  $seen = [];
  $out = [];
  foreach ($members as $i => $m) {
    $clean = clean_member($m, $i + 1, $slots);
    if (isset($seen[$clean['id']])) throw new ApiError(400, "Two members share the id {$clean['id']}");
    $seen[$clean['id']] = true;
    $out[] = $clean;
  }
  return $out;
}

// ── Saving ──────────────────────────────────────────────────────────────────
/**
 * Save a new roster version. $baseVersion must equal the stored version
 * (0 when nothing is stored yet), otherwise RosterConflict is thrown so two
 * admins can't silently overwrite each other.
 */
function roster_save(mixed $members, int $baseVersion, string $summary): array {
  $clean = roster_clean_members($members);
  $summary = clean_text($summary, 300, 'summary');
  return with_lock('roster', function () use ($clean, $baseVersion, $summary): array {
    $current = roster_load();
    $currentVersion = $current ? (int) $current['version'] : 0;
    if ($baseVersion !== $currentVersion) throw new RosterConflict(roster_public($current));
    $roster = [
      'version'   => $currentVersion + 1,
      'updatedAt' => gmdate('c'),
      'summary'   => $summary !== '' ? $summary : 'Roster updated',
      'members'   => $clean,
    ];
    write_json_atomic(roster_file(), $roster, true);
    write_json_atomic(history_file($roster['version']), $roster, true);
    history_prune();
    append_jsonl(data_path('changelog.jsonl'), [
      'v' => $roster['version'], 'at' => $roster['updatedAt'], 'summary' => $roster['summary'],
      'count' => count($clean), 'by' => ip_tag(),
    ]);
    return $roster;
  });
}

// ── History ─────────────────────────────────────────────────────────────────
function history_file(int $version): string {
  return data_path(sprintf('history/roster-v%06d.json', $version));
}

function history_versions(): array {
  $files = glob(data_dir() . '/history/roster-v*.json') ?: [];
  $versions = [];
  foreach ($files as $f) {
    if (preg_match('/roster-v(\d+)\.json$/', $f, $m)) $versions[] = (int) $m[1];
  }
  rsort($versions);
  return $versions;
}

function history_prune(): void {
  $keep = max(10, (int) cfg('history_keep', 150));
  foreach (array_slice(history_versions(), $keep) as $v) @unlink(history_file($v));
}

function history_list(int $limit = 60): array {
  $out = [];
  foreach (array_slice(history_versions(), 0, $limit) as $v) {
    $r = read_json(history_file($v));
    if (!is_array($r)) continue;
    $members = (array) ($r['members'] ?? []);
    $out[] = [
      'version'   => $v,
      'updatedAt' => (string) ($r['updatedAt'] ?? ''),
      'summary'   => (string) ($r['summary'] ?? ''),
      'active'    => count(array_filter($members, fn($m) => ($m['status'] ?? '') === 'active')),
      'total'     => count($members),
    ];
  }
  return $out;
}

function history_load(int $version): ?array {
  $r = read_json(history_file($version));
  return is_array($r) && isset($r['members']) ? $r : null;
}

/** Compact roster for Claude: just enough to match names to members. */
function roster_brief(?array $r): array {
  if ($r === null) return [];
  $out = [];
  foreach ($r['members'] as $m) {
    $out[] = [
      'id' => $m['id'],
      'name' => $m['name'],
      'aliases' => $m['aliases'] ?? [],
      'status' => $m['status'],
      'uid' => $m['uid'] ?? '',
    ];
  }
  return $out;
}

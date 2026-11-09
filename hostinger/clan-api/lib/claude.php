<?php
// Reads a screenshot with Claude (official Anthropic PHP SDK, vendored in
// vendor/) and returns JSON in the shape defined in prompts.php.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/prompts.php';
require_once __DIR__ . '/settings.php';

use Anthropic\Client;
use Anthropic\RequestOptions;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\APITimeoutException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\BadRequestException;
use Anthropic\Core\Exceptions\ContentTooLargeException;
use Anthropic\Core\Exceptions\InternalServerException;
use Anthropic\Core\Exceptions\NotFoundException;
use Anthropic\Core\Exceptions\PermissionDeniedException;
use Anthropic\Core\Exceptions\RateLimitException;

// Models that accept server-side refusal fallbacks (fallbacks: "default").
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];
const AI_MAX_EDGE = 2576;              // longest side Claude reads at full detail
const AI_MAX_BYTES = 3_600_000;        // ~4.8 MB once base64-encoded: under the 5 MB per-image limit

function sdk_available(): bool {
  return is_file(dirname(__DIR__) . '/vendor/autoload.php');
}

function ai_configured(): bool {
  return str_starts_with((string) cfg('anthropic_api_key', ''), 'sk-') && sdk_available();
}

function ai_client(): Client {
  require_once dirname(__DIR__) . '/vendor/autoload.php';
  $transport = new \GuzzleHttp\Client([
    'timeout' => (float) cfg('anthropic_timeout', 100),
    'connect_timeout' => 15,
  ]);
  $baseUrl = cfg('anthropic_base_url');
  return new Client(
    apiKey: (string) cfg('anthropic_api_key'),
    baseUrl: is_string($baseUrl) && $baseUrl !== '' ? $baseUrl : null,
    requestOptions: RequestOptions::with(maxRetries: 2, transporter: $transport),
  );
}

/**
 * Shrink an uploaded screenshot if it is bigger than Claude needs.
 * Returns [bytes, mime].
 */
function ai_prepare_image(string $path, string $mime): array {
  $bytes = (string) file_get_contents($path);
  $size = @getimagesize($path);
  $long = $size ? max($size[0], $size[1]) : 0;
  if ($long <= AI_MAX_EDGE && strlen($bytes) <= AI_MAX_BYTES) return [$bytes, $mime];
  if (!function_exists('imagecreatefromstring')) {
    if (strlen($bytes) > AI_MAX_BYTES) throw new ApiError(413, 'Screenshot is too large — try a smaller one');
    return [$bytes, $mime];
  }
  $src = @imagecreatefromstring($bytes);
  if ($src === false) throw new ApiError(415, 'Could not read that image');
  $w = imagesx($src); $h = imagesy($src);
  $scale = min(1, AI_MAX_EDGE / max($w, $h));
  $nw = max(1, (int) round($w * $scale)); $nh = max(1, (int) round($h * $scale));
  $dst = imagecreatetruecolor($nw, $nh);
  imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
  foreach ([90, 82, 72] as $q) {
    ob_start();
    imagejpeg($dst, null, $q);
    $out = (string) ob_get_clean();
    if (strlen($out) <= AI_MAX_BYTES) return [$out, 'image/jpeg'];
  }
  throw new ApiError(413, 'Screenshot is too large — try a smaller one');
}

/**
 * Ask Claude to read one screenshot. Returns
 * ['data' => array, 'usage' => [...], 'model' => string].
 */
function ai_extract(string $kind, string $bytes, string $mime, array $rosterBrief): array {
  $model = (string) cfg('anthropic_model', 'claude-opus-5-5');
  $efforts = (array) cfg('anthropic_effort', []);
  $effort = in_array($efforts[$kind] ?? '', ['low', 'medium', 'high'], true) ? $efforts[$kind] : 'medium';

  $params = [
    'maxTokens' => 16000,
    'model' => $model,
    'system' => AI_SYSTEM_PROMPT,
    'messages' => [[
      'role' => 'user',
      'content' => [
        ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $mime, 'data' => base64_encode($bytes)]],
        ['type' => 'text', 'text' => ai_user_text($kind, $rosterBrief)],
      ],
    ]],
    'outputConfig' => [
      'effort' => $effort,
      'format' => ['type' => 'json_schema', 'schema' => ai_schema($kind)],
    ],
  ];
  if (cfg('anthropic_fallbacks', true) && in_array($model, FALLBACK_MODELS, true)) {
    $params['fallbacks'] = 'default';
    $params['betas'] = ['server-side-fallback-2026-07-01'];
  }

  $started = microtime(true);
  try {
    $msg = ai_client()->beta->messages->create(...$params);
  } catch (AuthenticationException | PermissionDeniedException $e) {
    ai_log($kind, $model, null, 'auth');
    throw new ApiError(502, 'The Claude API key on the server was rejected — check anthropic_api_key in secrets.php');
  } catch (RateLimitException $e) {
    ai_log($kind, $model, null, 'rate_limit');
    throw new ApiError(503, 'Claude is rate-limiting this account right now — wait a minute and try again');
  } catch (InternalServerException $e) {
    // Includes 529 overloaded, 503 and 504 from the API (after the SDK's own retries).
    ai_log($kind, $model, null, 'overloaded');
    throw new ApiError(503, 'Claude is busy right now — try again in a minute');
  } catch (NotFoundException $e) {
    ai_log($kind, $model, null, 'not_found');
    throw new ApiError(502, "Claude doesn't recognise the model \"$model\" — check anthropic_model");
  } catch (ContentTooLargeException $e) {
    ai_log($kind, $model, null, 'too_large');
    throw new ApiError(413, 'Screenshot is too large for Claude — try a smaller one');
  } catch (BadRequestException $e) {
    ai_log($kind, $model, null, 'bad_request');
    throw new ApiError(502, 'Claude rejected the request: ' . ai_api_message($e));
  } catch (APIStatusException $e) {
    $type = $e->type?->value ?? '';
    ai_log($kind, $model, null, $type ?: 'api_error');
    if ($type === 'billing_error') {
      throw new ApiError(502, 'The Anthropic account is out of credit — top up at console.anthropic.com');
    }
    throw new ApiError(502, 'Claude returned an error (' . ($type ?: 'unknown') . '): ' . ai_api_message($e));
  } catch (APITimeoutException $e) {
    ai_log($kind, $model, null, 'timeout');
    throw new ApiError(504, 'Claude took too long to answer — try again');
  } catch (APIConnectionException $e) {
    ai_log($kind, $model, null, 'connection');
    throw new ApiError(504, "The server couldn't reach Claude — try again shortly");
  } catch (APIException $e) {
    ai_log($kind, $model, null, 'sdk_error');
    throw new ApiError(502, 'Claude request failed — try again');
  }

  $usage = [
    'inputTokens' => $msg->usage->inputTokens,
    'outputTokens' => $msg->usage->outputTokens,
    'seconds' => round(microtime(true) - $started, 1),
  ];
  if ($msg->stopReason === 'refusal') {
    ai_log($kind, $msg->model, $usage, 'refusal');
    throw new ApiError(422, 'Claude declined to read this image');
  }
  if ($msg->stopReason === 'max_tokens') {
    ai_log($kind, $msg->model, $usage, 'max_tokens');
    throw new ApiError(502, "Claude's answer was cut off — try a clearer screenshot");
  }
  $text = '';
  foreach ($msg->content as $block) {
    if (($block->type ?? '') === 'text') { $text = (string) $block->text; break; }
  }
  $data = json_decode($text, true);
  if (!is_array($data)) {
    ai_log($kind, $msg->model, $usage, 'bad_json');
    throw new ApiError(502, 'Claude sent back something unreadable — try again');
  }
  ai_log($kind, $msg->model, $usage, 'ok');
  return ['data' => ai_clean($kind, $data, $rosterBrief), 'usage' => $usage, 'model' => $msg->model];
}

/** The API's own error message from an SDK status exception, trimmed. */
function ai_api_message(APIStatusException $e): string {
  $body = $e->body ?? null;
  $msg = is_array($body) ? ($body['error']['message'] ?? '') : '';
  return mb_substr(is_string($msg) && $msg !== '' ? $msg : 'HTTP ' . ($e->status ?? '?'), 0, 240);
}

function ai_log(string $kind, string $model, ?array $usage, string $outcome): void {
  append_jsonl(data_path('ai-usage.jsonl'), [
    'at' => gmdate('c'), 'kind' => $kind, 'model' => $model, 'outcome' => $outcome,
    'in' => $usage['inputTokens'] ?? 0, 'out' => $usage['outputTokens'] ?? 0, 'by' => ip_tag(),
  ]);
}

// ── Defensive clean-up of Claude's answer ────────────────────────────────────
function ai_str(mixed $v, int $max = 120): string {
  return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
}

function int_or_null_value(mixed $v, int $min, int $max): ?int {
  if (!is_int($v) && !(is_string($v) && ctype_digit($v))) return null;
  $n = (int) $v;
  return $n < $min || $n > $max ? null : $n;
}

/** "Static-HV-1M2A4E5I8C": letters, digits, spaces and a few separators only. */
function clean_build_code(mixed $v): string {
  $code = preg_replace('/\s+/u', ' ', ai_str($v, 80)) ?? '';
  return preg_match('/^[\p{L}\p{N}.][\p{L}\p{N} ._\-]{2,79}$/u', $code) ? $code : '';
}

function clean_match(array $row, array $ids): array {
  $id = ai_str($row['matchId'] ?? '', 64);
  $conf = $row['matchConfidence'] ?? 'none';
  $known = $id !== '' && isset($ids[$id]);
  return [
    'matchId' => $known ? $id : '',
    'matchConfidence' => $known && in_array($conf, MATCH_CONFIDENCE, true) ? $conf : 'none',
  ];
}

function ai_clean(string $kind, array $d, array $rosterBrief): array {
  $ids = array_fill_keys(array_column($rosterBrief, 'id'), true);
  switch ($kind) {
    case 'clan':
      $events = [];
      foreach ((array) ($d['events'] ?? []) as $e) {
        if (!is_array($e)) continue;
        $dt = ai_str($e['datetime'] ?? '', 20);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/', $dt)) $dt = '';
        $action = in_array($e['action'] ?? '', ['join', 'quit', 'remove', 'promote', 'demote', 'other'], true) ? $e['action'] : 'other';
        $events[] = [
          'datetime' => $dt, 'action' => $action, 'name' => ai_str($e['name'] ?? '', 80),
          'officer' => ai_str($e['officer'] ?? '', 80), 'position' => ai_str($e['position'] ?? '', 40),
          'logText' => ai_str($e['logText'] ?? '', 160),
        ] + clean_match($e, $ids);
      }
      $members = [];
      foreach ((array) ($d['members'] ?? []) as $m) {
        if (!is_array($m) || ai_str($m['name'] ?? '') === '') continue;
        $members[] = ['name' => ai_str($m['name'], 80), 'position' => ai_str($m['position'] ?? '', 40)] + clean_match($m, $ids);
      }
      $screen = in_array($d['screen'] ?? '', ['clan_log', 'member_list', 'other'], true) ? $d['screen'] : 'other';
      return ['screen' => $screen, 'memberCount' => ai_str($d['memberCount'] ?? '', 20), 'events' => $events,
              'members' => $members, 'notes' => ai_str($d['notes'] ?? '', 500)];

    case 'profile':
      $uid = preg_replace('/\D+/', '', ai_str($d['uid'] ?? '', 60)) ?? '';
      $notes = ai_str($d['notes'] ?? '', 500);
      if ($uid !== '' && (strlen($uid) < 5 || strlen($uid) > 25)) { $uid = ''; $notes = trim($notes . ' UID looked wrong, so it was dropped.'); }
      $match = clean_match($d, $ids);
      // A UID that is already on the roster beats any name guess.
      if ($uid !== '') {
        foreach ($rosterBrief as $m) {
          if (($m['uid'] ?? '') === $uid) { $match = ['matchId' => $m['id'], 'matchConfidence' => 'high']; break; }
        }
      }
      return [
        'screen' => ($d['screen'] ?? '') === 'player_profile' ? 'player_profile' : 'other',
        'name' => ai_str($d['name'] ?? '', 80), 'uid' => $uid,
        'tier' => int_or_null_value($d['tier'] ?? null, 0, 100000),
        'clanTag' => ai_str($d['clanTag'] ?? '', 20),
        'likes' => int_or_null_value($d['likes'] ?? null, 0, PHP_INT_MAX),
        'notes' => $notes,
      ] + $match;

    case 'loadout':
      $att = [];
      foreach (ATTACHMENT_SLOTS as $slot) $att[$slot] = ai_str($d['attachments'][$slot] ?? '', 100);
      $stats = [];
      // Gunsmith stats are usually 0–100 but some builds go higher (Fire Rate 111).
      foreach (STAT_KEYS as $k) $stats[$k] = int_or_null_value($d['stats'][$k] ?? null, 0, STAT_MAX);
      $class = $d['weaponClass'] ?? '';
      return [
        'screen' => in_array($d['screen'] ?? '', ['gunsmith', 'loadout'], true) ? $d['screen'] : 'other',
        'weapon' => ai_str($d['weapon'] ?? '', 60),
        'weaponClass' => in_array($class, WEAPON_CLASSES, true) ? $class : '',
        'buildCode' => clean_build_code($d['buildCode'] ?? ''),
        'buildName' => ai_str($d['buildName'] ?? '', 80), 'blueprint' => ai_str($d['blueprint'] ?? '', 80),
        'attachments' => $att, 'stats' => $stats,
        'playerName' => ai_str($d['playerName'] ?? '', 80), 'notes' => ai_str($d['notes'] ?? '', 500),
      ];

    case 'settings':
      return ['screen' => ($d['screen'] ?? '') === 'settings' ? 'settings' : 'other']
        + settings_clean($d)
        + ['notes' => ai_str($d['notes'] ?? '', 300)];
  }
  return $d;
}

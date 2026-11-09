<?php
// POST multipart: kind=clan|profile|loadout, image=<screenshot>
//   clan    → clan log / member list (admin)
//   profile → player profile: name + UID (admin)
//   loadout → gunsmith screenshot (anyone; set loadout_add_role to 'clan' to require the clan password)
//   settings → CODM settings screens / share codes (settings_edit_role: anyone by default)
// → { ok, kind, result, usage, model }
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/roster.php';
require __DIR__ . '/lib/images.php';
require __DIR__ . '/lib/claude.php';
cors(['POST']);
@set_time_limit(180);

$kind = (string) ($_POST['kind'] ?? '');
$needs = ['clan' => 'admin', 'profile' => 'admin', 'loadout' => loadout_add_role(), 'settings' => settings_edit_role()][$kind] ?? null;
if ($needs === null) throw new ApiError(400, 'kind must be clan, profile, loadout or settings');
$role = role_for($needs);

if (!sdk_available()) throw new ApiError(503, 'The Claude SDK (vendor folder) is missing — re-upload clan-api.zip');
if (!ai_configured()) throw new ApiError(503, 'The Claude API key is not set on the server yet (secrets.php)');

$img = uploaded_image('image');

$perIp = (array) cfg('ai_hourly_per_ip', []);
if (!rate_take('ai-ip-' . ip_tag() . "-$role", (int) ($perIp[$role] ?? 10), 3600)) {
  throw new ApiError(429, 'Too many screenshots from this device in the last hour — try again later');
}
[$dayBucket, $dayLimit] = $role === 'public'
  ? ['ai-24h-public', (int) cfg('public_ai_daily_limit', 60)]
  : ['ai-24h', (int) cfg('ai_daily_limit', 150)];
if (!rate_take($dayBucket, $dayLimit, 86400)) {
  throw new ApiError(429, 'Today\'s screenshot-reading allowance is used up — try again tomorrow, or fill the form in yourself');
}

[$bytes, $mime] = ai_prepare_image($img['path'], $img['mime']);
$brief = in_array($kind, ['clan', 'profile'], true) ? roster_brief(roster_load()) : [];
$out = ai_extract($kind, $bytes, $mime, $brief);
send_json(200, ['ok' => true, 'kind' => $kind] + ['result' => $out['data'], 'usage' => $out['usage'], 'model' => $out['model']]);

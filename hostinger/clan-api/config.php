<?php
// ── TB clan API: settings ────────────────────────────────────────────────────
// Nothing secret lives here. Passwords and the Claude API key go in
// secrets.php (see secrets.example.php), which is never committed to GitHub
// and is not in the install zip, so re-uploading the zip never overwrites it.
// Any key below can also be overridden from secrets.php.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

return [
  // Browser origins allowed to call this API: scheme + host, no trailing slash.
  'allowed_origins' => [
    'https://clan.stridlabs.com',
    'https://bigmcguin.github.io',
  ],

  // ── Claude ────────────────────────────────────────────────────────────────
  // Model used to read screenshots. Change it in secrets.php if you prefer a
  // cheaper one (e.g. 'claude-sonnet-5-5' or 'claude-haiku-5-5').
  'anthropic_model' => 'claude-opus-5-5',
  // How hard Claude thinks per screenshot type: low | medium | high.
  'anthropic_effort' => [
    'clan'    => 'medium', // clan log / member list: matching names to the roster
    'profile' => 'medium', // player profile: name + UID
    'loadout' => 'low',    // gunsmith screenshot: straight transcription
    'settings' => 'low',   // CODM settings screens / share codes: straight transcription
  ],
  // If Claude declines a request for safety reasons, let the API retry it on
  // another model automatically (only sent for models that support it).
  'anthropic_fallbacks' => true,
  // Seconds to wait for Claude before giving up.
  'anthropic_timeout' => 100,
  // Leave null. Only used by the local test suite to point at a mock server.
  'anthropic_base_url' => null,

  // ── Cost and abuse limits ─────────────────────────────────────────────────
  'ai_daily_limit'   => 150,                            // screenshot reads per 24 h by clan/admin
  'ai_hourly_per_ip' => ['public' => 10, 'clan' => 20, 'admin' => 120], // per device per hour
  'auth_fail_limit'  => 8,                              // wrong passwords allowed per device…
  'auth_fail_window' => 900,                            // …per 15 minutes

  // ── Loadouts ──────────────────────────────────────────────────────────────
  // Who may add a loadout (have Claude read the screenshot and upload it):
  // 'public' = anyone, no password · 'clan' = clan password.
  'loadout_add_role' => 'public',
  // Who may delete loadout screenshots: 'admin' or 'clan'.
  'loadout_delete_role' => 'admin',
  // Limits for adding without a password (shared by everyone, kept separate
  // from the clan/admin allowance so it can't use that up).
  'public_ai_daily_limit'       => 60,  // screenshot reads per 24 h
  'public_upload_hourly_per_ip' => 15,  // screenshot uploads per device per hour
  'public_upload_daily_limit'   => 120, // screenshot uploads per 24 h

  // ── Member settings (sensitivity / HUD codes and other CODM settings) ─────
  // Who may save a member's settings: 'public' = anyone, no password ·
  // 'clan' = clan password · 'admin' = admin password only.
  // Claude reading settings screenshots follows the same rule.
  'settings_edit_role' => 'public',
  'public_settings_hourly_per_ip' => 30, // saves per device per hour without a password
  'settings_history_keep' => 30,         // earlier versions kept per member, for admin restore
  'settings_history_merge_seconds' => 600, // saves from one device within this time count as one version

  // ── Uploads ───────────────────────────────────────────────────────────────
  'max_upload_bytes' => 8 * 1024 * 1024,
  // Who may upload/replace member reference images: 'admin' or 'clan'.
  'member_images_role' => 'admin',
  'member_image_slots' => ['codm', 'minecraft', 'roblox', 'poster'],

  // ── Storage ───────────────────────────────────────────────────────────────
  // Roster, history and logs. Blocked from the web by data/.htaccess.
  'data_dir' => __DIR__ . '/data',
  // Roster versions kept for "History → Restore".
  'history_keep' => 150,
  // Public URL of this folder, e.g. 'https://clan-api.stridlabs.com'. Leave
  // null to work it out from each request.
  'public_base_url' => null,
];

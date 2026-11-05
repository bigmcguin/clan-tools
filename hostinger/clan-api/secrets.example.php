<?php
// ── TB clan API: secrets template ────────────────────────────────────────────
// 1. Make a copy of this file named  secrets.php  in the same folder
//    (or, safer, put it one folder ABOVE public_html and name it
//    clan-api-secrets.php — the API looks there first).
// 2. Fill in the three values below and save.
// 3. Never paste these values into GitHub, Discord or a chat.
//
// The API refuses to run AI reads or roster changes until they are set.
// Visit /status.php afterwards: every check should say true.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

return [
  // From https://console.anthropic.com → API keys. Starts with "sk-ant-".
  'anthropic_api_key' => '',

  // Shared clan password: lets members read loadout screenshots with Claude
  // and upload loadout/callout screenshots. Not case-sensitive.
  'clan_password' => '',

  // Your admin password: roster changes, UID updates, history restore and
  // member reference images. Case-sensitive. Make it different from the
  // clan password.
  'admin_password' => '',

  // Optional overrides of anything in config.php, for example:
  // 'anthropic_model' => 'claude-sonnet-5-5',
  // 'ai_daily_limit'  => 300,
  // 'member_images_role' => 'clan',
];

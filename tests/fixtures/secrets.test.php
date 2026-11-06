<?php
// Secrets for the local test suite only (fake key, throwaway passwords).
return [
  'anthropic_api_key' => 'sk-ant-test-key',
  'clan_password' => 'Test-Clan-Pw',
  'admin_password' => 'Admin-Test-1',
  'anthropic_base_url' => getenv('MOCK_ANTHROPIC') ?: 'http://127.0.0.1:8790',
  'data_dir' => getenv('CLAN_API_DATA') ?: sys_get_temp_dir() . '/clan-api-test-data',
  'allowed_origins' => ['http://127.0.0.1:8080', 'http://localhost:8080'],
  'ai_hourly_per_ip' => ['clan' => (int) (getenv('AI_CLAN_PER_HOUR') ?: 50), 'admin' => 200],
  'ai_daily_limit' => (int) (getenv('AI_DAILY_LIMIT') ?: 500),
  'public_ai_daily_limit' => (int) (getenv('PUBLIC_AI_DAILY') ?: 500),
  'anthropic_timeout' => 20,
];

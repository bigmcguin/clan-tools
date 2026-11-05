<?php
// GET → screenshot reads and token use for today / 7 days / 30 days (admin).
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
cors(['GET']);
require_role('admin');

// Approximate list prices in US$ per million tokens (input, output).
$prices = [
  'claude-opus-5-5' => [4, 20], 'claude-sonnet-5-5' => [2, 10], 'claude-haiku-5-5' => [0.10, 0.50],
  'claude-fable-5-1' => [10, 50], 'claude-opus-5' => [5, 25], 'claude-sonnet-5' => [2, 10],
];
$now = time();
$periods = ['today' => strtotime('today UTC'), 'last7Days' => $now - 7 * 86400, 'last30Days' => $now - 30 * 86400];
$sum = [];
foreach ($periods as $k => $_) $sum[$k] = ['reads' => 0, 'failed' => 0, 'inputTokens' => 0, 'outputTokens' => 0, 'estUsd' => 0.0];

$file = data_path('ai-usage.jsonl');
$fh = is_file($file) ? fopen($file, 'r') : false;
while ($fh && ($line = fgets($fh)) !== false) {
  $r = json_decode($line, true);
  if (!is_array($r)) continue;
  $t = strtotime((string) ($r['at'] ?? '')) ?: 0;
  [$pin, $pout] = $prices[$r['model'] ?? ''] ?? [4, 20];
  foreach ($periods as $k => $since) {
    if ($t < $since) continue;
    $ok = ($r['outcome'] ?? '') === 'ok';
    $sum[$k]['reads'] += $ok ? 1 : 0;
    $sum[$k]['failed'] += $ok ? 0 : 1;
    $sum[$k]['inputTokens'] += (int) ($r['in'] ?? 0);
    $sum[$k]['outputTokens'] += (int) ($r['out'] ?? 0);
    $sum[$k]['estUsd'] += ((int) ($r['in'] ?? 0) * $pin + (int) ($r['out'] ?? 0) * $pout) / 1e6;
  }
}
if ($fh) fclose($fh);
foreach ($sum as &$s) $s['estUsd'] = round($s['estUsd'], 2);
send_json(200, ['ok' => true, 'usage' => $sum, 'dailyLimit' => (int) cfg('ai_daily_limit', 150)]);

<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Music-User-Token, Content-Type, Accept');
header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'HEAD') {
  http_response_code(405);
  echo 'Method not allowed';
  exit();
}

echo json_encode([
  'ok' => true,
  'status' => 'ok',
  'runtime' => 'php',
  'version' => 'engine_v1',
  'engine' => [
    'automix' => [
      'preloadLeadSec' => 14,
      'preloadMinSec' => 8,
      'triggerLeadSec' => 0.35,
      'hardSwitchIfNotReadyMs' => 1200,
    ],
    'spatialize' => [
      'updateHz' => 30,
      'cycleHz' => 0.08,
      'depth' => 0.65,
      'crossfadeDepth' => 0.9,
      'smoothingSec' => 0.08,
    ],
  ],
]);

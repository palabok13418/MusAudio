<?php
require_once __DIR__ . '/_util.php';

mus_set_cors('GET,HEAD,OPTIONS', 'Authorization, Music-User-Token, Content-Type, Accept');
mus_handle_options();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
  mus_json(405, [ 'ok' => false, 'error' => 'method_not_allowed' ]);
}

mus_json(200, [
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

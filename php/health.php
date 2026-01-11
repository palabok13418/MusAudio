<?php
require_once __DIR__ . '/_util.php';

mus_set_cors('GET,HEAD,OPTIONS', 'Authorization, Music-User-Token, Content-Type, Accept');
mus_handle_options();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
  mus_json(405, [ 'ok' => false, 'error' => 'method_not_allowed' ]);
}

mus_json(200, [ 'ok' => true, 'status' => 'ok', 'runtime' => 'php' ]);

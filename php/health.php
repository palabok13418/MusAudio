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

echo json_encode([ 'ok' => true, 'status' => 'ok', 'runtime' => 'php' ]);

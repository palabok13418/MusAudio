<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Music-User-Token, Content-Type, Accept');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit();
}

function allowed_target($u) {
  $p = parse_url($u);
  if (!$p) return false;
  $scheme = isset($p['scheme']) ? strtolower($p['scheme']) : '';
  if ($scheme !== 'https' && $scheme !== 'http') return false;
  $host = isset($p['host']) ? strtolower($p['host']) : '';
  if ($host === 'amp-api.music.apple.com') return true;
  if (str_ends_with($host, '.music.apple.com')) return true;
  if (str_ends_with($host, '.mzstatic.com')) return true;
  return false;
}

$target = isset($_GET['url']) ? trim(strval($_GET['url'])) : '';
if ($target === '' || !allowed_target($target)) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(400);
  echo json_encode([ 'ok' => false, 'error' => 'Invalid url' ]);
  exit();
}

$headers = [];
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$mut = $_SERVER['HTTP_MUSIC_USER_TOKEN'] ?? '';
if ($auth !== '') $headers[] = 'Authorization: ' . $auth;
if ($mut !== '') $headers[] = 'Music-User-Token: ' . $mut;
$headers[] = 'Accept: ' . ($_SERVER['HTTP_ACCEPT'] ?? '*/*');

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_HTTPGET, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

$resp = curl_exec($ch);
if ($resp === false) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(502);
  echo json_encode([ 'ok' => false, 'error' => 'Upstream fetch failed' ]);
  exit();
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$rawHeaders = substr($resp, 0, $headerSize);
$body = substr($resp, $headerSize);

$contentType = 'application/octet-stream';
foreach (explode("\r\n", $rawHeaders) as $line) {
  if (stripos($line, 'content-type:') === 0) {
    $contentType = trim(substr($line, strlen('content-type:')));
    break;
  }
}

http_response_code(intval($status));
header('Content-Type: ' . $contentType);
echo $body;

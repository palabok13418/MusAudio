<?php
require_once __DIR__ . '/_util.php';

mus_set_cors('GET,HEAD,OPTIONS', 'Authorization, Music-User-Token, Content-Type, Accept, Range, If-None-Match, If-Modified-Since');
mus_handle_options();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
  mus_json(405, [ 'ok' => false, 'error' => 'method_not_allowed' ]);
}

$target = isset($_GET['url']) ? trim(strval($_GET['url'])) : '';
if ($target === '' || !mus_allowed_apple_target($target)) {
  mus_json(400, [ 'ok' => false, 'error' => 'invalid_url' ]);
}

$headers = [];
$auth = mus_sanitize_header_value($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$mut = mus_sanitize_header_value($_SERVER['HTTP_MUSIC_USER_TOKEN'] ?? '');
if ($auth !== '') $headers[] = 'Authorization: ' . $auth;
if ($mut !== '') $headers[] = 'Music-User-Token: ' . $mut;

$accept = mus_sanitize_header_value($_SERVER['HTTP_ACCEPT'] ?? '*/*');
if ($accept === '') $accept = '*/*';
$headers[] = 'Accept: ' . $accept;

$range = mus_sanitize_header_value($_SERVER['HTTP_RANGE'] ?? '');
if ($range !== '') $headers[] = 'Range: ' . $range;
$inm = mus_sanitize_header_value($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
if ($inm !== '') $headers[] = 'If-None-Match: ' . $inm;
$ims = mus_sanitize_header_value($_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '');
if ($ims !== '') $headers[] = 'If-Modified-Since: ' . $ims;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $target);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 35);
curl_setopt($ch, CURLOPT_HTTPGET, true);
if ($method === 'HEAD') {
  curl_setopt($ch, CURLOPT_NOBODY, true);
}

$pass = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
  'cache-control',
  'content-encoding',
  'content-disposition',
];

$ok = mus_proxy_stream($ch, $pass);
try { curl_close($ch); } catch (Throwable $t) {}
if (!$ok && !headers_sent()) {
  mus_json(502, [ 'ok' => false, 'error' => 'upstream_fetch_failed' ]);
}

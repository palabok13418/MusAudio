<?php
require_once __DIR__ . '/_util.php';

mus_set_cors('POST,OPTIONS', 'Authorization, Music-User-Token, Content-Type, Accept, Range, If-None-Match, If-Modified-Since, X-Filename');
mus_handle_options();

$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';
if ($method !== 'POST') {
  mus_json(405, [ 'ok' => false, 'error' => 'method_not_allowed' ]);
}

$base = mus_env_first([ 'ANALYZE_BACKEND_URL', 'PROBE_BACKEND_URL', 'DECODE_BACKEND_URL', 'DEMUCS_BACKEND_URL' ]);
if ($base === '') {
  mus_json(500, [ 'ok' => false, 'error' => 'missing_analyze_backend', 'hint' => 'Set ANALYZE_BACKEND_URL, PROBE_BACKEND_URL, DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' ]);
}
$base = rtrim($base, '/');
$url = $base . '/analyze';

$seconds = '';
try {
  $seconds = isset($_GET['seconds']) ? trim(strval($_GET['seconds'])) : '';
} catch (Throwable $t) {
  $seconds = '';
}
if ($seconds !== '') {
  $url = $url . '?seconds=' . urlencode($seconds);
}

$body = mus_read_body_to_tmp('mus_analyze_', 0);
if (!$body['ok']) {
  mus_json(intval($body['status']), [ 'ok' => false, 'error' => strval($body['error']) ]);
}
$tmp = $body['tmp'];
$total = intval($body['size']);

$fp = fopen($tmp, 'rb');
if ($fp === false) {
  try { @unlink($tmp); } catch (Throwable $t) {}
  mus_json(500, [ 'ok' => false, 'error' => 'tmp_read_failed' ]);
}

$headers = [];
$headers[] = 'Content-Type: application/octet-stream';
$headers[] = 'Accept: application/json';
$fn = mus_sanitize_header_value($_SERVER['HTTP_X_FILENAME'] ?? '');
if ($fn !== '') {
  $headers[] = 'X-Filename: ' . $fn;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_UPLOAD, true);
curl_setopt($ch, CURLOPT_INFILE, $fp);
curl_setopt($ch, CURLOPT_INFILESIZE, $total);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 120);

$pass = [
  'content-type',
  'content-length',
  'cache-control',
];

$ok = mus_proxy_stream($ch, $pass);

try { fclose($fp); } catch (Throwable $t) {}
try { @unlink($tmp); } catch (Throwable $t) {}
try { curl_close($ch); } catch (Throwable $t) {}

if (!$ok && !headers_sent()) {
  mus_json(502, [ 'ok' => false, 'error' => 'upstream_fetch_failed' ]);
}

exit();

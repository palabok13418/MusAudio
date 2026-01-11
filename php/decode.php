<?php
require_once __DIR__ . '/_util.php';

mus_set_cors('POST,OPTIONS', 'Authorization, Music-User-Token, Content-Type, Accept, Range, If-None-Match, If-Modified-Since, X-Filename');
mus_handle_options();

$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';
if ($method !== 'POST') {
  mus_json(405, [ 'ok' => false, 'error' => 'method_not_allowed' ]);
}

$base = mus_env_first([ 'DECODE_BACKEND_URL', 'DEMUCS_BACKEND_URL' ]);
if ($base === '') {
  mus_json(500, [ 'ok' => false, 'error' => 'missing_decode_backend', 'hint' => 'Set DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' ]);
}
$base = rtrim($base, '/');
$url = $base . '/decode';

$q = [];
try {
  $fmt = isset($_GET['format']) ? strtolower(trim(strval($_GET['format']))) : '';
  if ($fmt === 'wav' || $fmt === 'mp3' || $fmt === 'm4a') {
    $q['format'] = $fmt;
  }
} catch (Throwable $t) {}
try {
  $sr = isset($_GET['sr']) ? intval($_GET['sr']) : 0;
  if ($sr <= 0 && isset($_GET['ar'])) {
    $sr = intval($_GET['ar']);
  }
  if ($sr >= 8000 && $sr <= 192000) {
    $q['sr'] = strval($sr);
  }
} catch (Throwable $t) {}
try {
  $ac = isset($_GET['ac']) ? intval($_GET['ac']) : 0;
  if ($ac <= 0 && isset($_GET['channels'])) {
    $ac = intval($_GET['channels']);
  }
  if ($ac >= 1 && $ac <= 2) {
    $q['ac'] = strval($ac);
  }
} catch (Throwable $t) {}

if (!empty($q)) {
  $url = $url . '?' . http_build_query($q);
}

$body = mus_read_body_to_tmp('mus_decode_', 0);
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
$headers[] = 'Accept: */*';
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
curl_setopt($ch, CURLOPT_TIMEOUT, 200);

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

try { fclose($fp); } catch (Throwable $t) {}
try { @unlink($tmp); } catch (Throwable $t) {}
try { curl_close($ch); } catch (Throwable $t) {}

if (!$ok && !headers_sent()) {
  mus_json(502, [ 'ok' => false, 'error' => 'upstream_fetch_failed' ]);
}

exit();

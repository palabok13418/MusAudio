<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, X-Filename');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(405);
  echo json_encode([ 'ok' => false, 'error' => 'method_not_allowed' ]);
  exit();
}

$base = trim(strval(getenv('ANALYZE_BACKEND_URL') ?: (getenv('PROBE_BACKEND_URL') ?: (getenv('DECODE_BACKEND_URL') ?: (getenv('DEMUCS_BACKEND_URL') ?: '')))));
if ($base === '') {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'missing_analyze_backend', 'hint' => 'Set ANALYZE_BACKEND_URL, PROBE_BACKEND_URL, DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' ]);
  exit();
}
$base = rtrim($base, "/");
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

$len = 0;
try {
  $len = intval($_SERVER['CONTENT_LENGTH'] ?? '0');
} catch (Throwable $t) {
  $len = 0;
}
if ($len > 250 * 1024 * 1024) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(413);
  echo json_encode([ 'ok' => false, 'error' => 'too_large' ]);
  exit();
}

$tmp = tempnam(sys_get_temp_dir(), 'mus_analyze_');
if ($tmp === false || $tmp === '') {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'tmp_failed' ]);
  exit();
}

$in = fopen('php://input', 'rb');
$out = fopen($tmp, 'wb');
if ($in === false || $out === false) {
  try { if ($in !== false) fclose($in); } catch (Throwable $t) {}
  try { if ($out !== false) fclose($out); } catch (Throwable $t) {}
  try { @unlink($tmp); } catch (Throwable $t) {}
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'stream_failed' ]);
  exit();
}

$total = 0;
while (!feof($in)) {
  $chunk = fread($in, 1024 * 1024);
  if ($chunk === false) break;
  if ($chunk === '') continue;
  $total += strlen($chunk);
  fwrite($out, $chunk);
  if ($total > 250 * 1024 * 1024) break;
}
try { fclose($in); } catch (Throwable $t) {}
try { fclose($out); } catch (Throwable $t) {}

if ($total <= 0) {
  try { @unlink($tmp); } catch (Throwable $t) {}
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(400);
  echo json_encode([ 'ok' => false, 'error' => 'empty_body' ]);
  exit();
}

if ($total > 250 * 1024 * 1024) {
  try { @unlink($tmp); } catch (Throwable $t) {}
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(413);
  echo json_encode([ 'ok' => false, 'error' => 'too_large' ]);
  exit();
}

$fp = fopen($tmp, 'rb');
if ($fp === false) {
  try { @unlink($tmp); } catch (Throwable $t) {}
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([ 'ok' => false, 'error' => 'tmp_read_failed' ]);
  exit();
}

$headers = [];
$headers[] = 'Content-Type: application/octet-stream';
$headers[] = 'Accept: application/json';
$fn = $_SERVER['HTTP_X_FILENAME'] ?? '';
if ($fn !== '') {
  $headers[] = 'X-Filename: ' . $fn;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_UPLOAD, true);
curl_setopt($ch, CURLOPT_INFILE, $fp);
curl_setopt($ch, CURLOPT_INFILESIZE, $total);

$resp = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);

try { fclose($fp); } catch (Throwable $t) {}
try { @unlink($tmp); } catch (Throwable $t) {}

if ($resp === false) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(502);
  echo json_encode([ 'ok' => false, 'error' => 'upstream_fetch_failed' ]);
  exit();
}

$rawHeaders = substr($resp, 0, $headerSize);
$body = substr($resp, $headerSize);

$contentType = 'application/json';
foreach (explode("\r\n", $rawHeaders) as $line) {
  if (stripos($line, 'content-type:') === 0) {
    $contentType = trim(substr($line, strlen('content-type:')));
    break;
  }
}

http_response_code(intval($status));
header('Content-Type: ' . $contentType);
echo $body;

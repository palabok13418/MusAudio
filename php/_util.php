<?php

function mus_origin() {
  try {
    $o = $_SERVER['HTTP_ORIGIN'] ?? '';
    $o = trim(strval($o));
    return $o;
  } catch (Throwable $t) {
    return '';
  }
}

function mus_set_cors($methods, $headers) {
  $origin = mus_origin();
  header('Access-Control-Allow-Origin: ' . ($origin !== '' ? $origin : '*'));
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: ' . $methods);
  header('Access-Control-Allow-Headers: ' . $headers);
  header('Access-Control-Expose-Headers: Content-Type, Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, Cache-Control, Content-Encoding, Content-Disposition');
  header('Access-Control-Max-Age: 86400');
  header('Cache-Control: no-store');
}

function mus_handle_options() {
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit();
  }
}

function mus_json($status, $payload) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(intval($status));
  echo json_encode($payload);
  exit();
}

function mus_ends_with($s, $suffix) {
  $s = strval($s);
  $suffix = strval($suffix);
  if ($suffix === '') return true;
  $ls = strlen($s);
  $l2 = strlen($suffix);
  if ($l2 > $ls) return false;
  return substr($s, $ls - $l2) === $suffix;
}

function mus_allowed_apple_target($u) {
  try {
    $p = parse_url(strval($u));
    if (!$p) return false;
    $scheme = isset($p['scheme']) ? strtolower(strval($p['scheme'])) : '';
    if ($scheme !== 'https' && $scheme !== 'http') return false;
    $host = isset($p['host']) ? strtolower(strval($p['host'])) : '';
    if ($host === 'itunes.apple.com') return true;
    if ($host === 'amp-api.music.apple.com') return true;
    if (mus_ends_with($host, '.music.apple.com')) return true;
    if (mus_ends_with($host, '.mzstatic.com')) return true;
    return false;
  } catch (Throwable $t) {
    return false;
  }
}

function mus_env_first($names) {
  foreach ($names as $n) {
    try {
      $v = getenv(strval($n));
      if ($v === false) continue;
      $s = trim(strval($v));
      if ($s !== '') return $s;
    } catch (Throwable $t) {
    }
  }
  return '';
}

function mus_sanitize_header_value($v) {
  try {
    $s = strval($v);
    $s = preg_replace("/[\r\n]+/", ' ', $s);
    $s = trim($s);
    if (strlen($s) > 180) $s = substr($s, 0, 180);
    return $s;
  } catch (Throwable $t) {
    return '';
  }
}

function mus_read_body_to_tmp($prefix, $maxBytes) {
  $tmp = tempnam(sys_get_temp_dir(), $prefix);
  if ($tmp === false || $tmp === '') {
    return [ 'ok' => false, 'error' => 'tmp_failed', 'status' => 500, 'tmp' => '', 'size' => 0 ];
  }

  $in = fopen('php://input', 'rb');
  $out = fopen($tmp, 'wb');
  if ($in === false || $out === false) {
    try { if ($in !== false) fclose($in); } catch (Throwable $t) {}
    try { if ($out !== false) fclose($out); } catch (Throwable $t) {}
    try { @unlink($tmp); } catch (Throwable $t) {}
    return [ 'ok' => false, 'error' => 'stream_failed', 'status' => 500, 'tmp' => '', 'size' => 0 ];
  }

  $total = 0;
  while (!feof($in)) {
    $chunk = fread($in, 1024 * 1024);
    if ($chunk === false) break;
    if ($chunk === '') continue;
    $total += strlen($chunk);
    fwrite($out, $chunk);
    if ($maxBytes > 0 && $total > $maxBytes) break;
  }
  try { fclose($in); } catch (Throwable $t) {}
  try { fclose($out); } catch (Throwable $t) {}

  if ($total <= 0) {
    try { @unlink($tmp); } catch (Throwable $t) {}
    return [ 'ok' => false, 'error' => 'empty_body', 'status' => 400, 'tmp' => '', 'size' => 0 ];
  }

  if ($maxBytes > 0 && $total > $maxBytes) {
    try { @unlink($tmp); } catch (Throwable $t) {}
    return [ 'ok' => false, 'error' => 'too_large', 'status' => 413, 'tmp' => '', 'size' => 0 ];
  }

  return [ 'ok' => true, 'error' => '', 'status' => 200, 'tmp' => $tmp, 'size' => $total ];
}

function mus_proxy_stream($ch, $passHeaders) {
  $sent = false;

  curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $headerLine) use (&$sent, $passHeaders) {
    $line = trim($headerLine);
    if ($line === '') return strlen($headerLine);

    if (stripos($line, 'HTTP/') === 0) {
      $parts = preg_split('/\s+/', $line);
      if (count($parts) >= 2) {
        $code = intval($parts[1]);
        if ($code > 0) {
          http_response_code($code);
          $sent = true;
        }
      }
      return strlen($headerLine);
    }

    $pos = strpos($line, ':');
    if ($pos === false) return strlen($headerLine);
    $k = strtolower(trim(substr($line, 0, $pos)));
    $v = trim(substr($line, $pos + 1));

    if (in_array($k, $passHeaders, true) && $v !== '') {
      $name = implode('-', array_map(function($p){ return $p ? strtoupper($p[0]).substr($p,1) : $p; }, explode('-', $k)));
      header($name . ': ' . $v);
    }

    return strlen($headerLine);
  });

  curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) {
    echo $data;
    return strlen($data);
  });

  $ok = curl_exec($ch);
  if ($ok === false) {
    return false;
  }
  return true;
}

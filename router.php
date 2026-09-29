<?php
// Router untuk PHP built-in server (dipakai di Docker/Railway).
//
// Railway tidak mengirim header cache sama sekali, sehingga browser bisa
// menyimpan index.html + CSS/JS versi lama dan tampilan tidak berubah
// setelah deploy. Router ini memaksa semua respons memakai anti-cache.
//
// Catatan teknis: saat router `return false` untuk file statis, PHP built-in
// server membangun sendiri header respons dan membuang header dari router.
// Karena itu file statis disajikan manual di sini.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if ($uri === '/' || $uri === '') $uri = '/index.html';

$root = realpath(__DIR__);
$file = realpath($root . $uri);

function not_found() {
  http_response_code(404);
  header('Content-Type: text/plain; charset=utf-8');
  echo '404 Not Found';
  exit;
}

// tolak akses di luar direktori web (path traversal) dan file yang tidak ada
if ($file === false || strpos($file, $root . DIRECTORY_SEPARATOR) !== 0) not_found();
if (is_dir($file)) {
  $file = realpath($file . DIRECTORY_SEPARATOR . 'index.html');
  if ($file === false) not_found();
}
if (!is_file($file)) not_found();

// file PHP (api.php, setup_db.php, dst) biar PHP yang eksekusi
if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'php') return false;

$types = [
  'html' => 'text/html; charset=UTF-8',
  'htm'  => 'text/html; charset=UTF-8',
  'css'  => 'text/css; charset=UTF-8',
  'js'   => 'application/javascript; charset=utf-8',
  'json' => 'application/json; charset=UTF-8',
  'svg'  => 'image/svg+xml',
  'png'  => 'image/png',
  'jpg'  => 'image/jpeg',
  'ico'  => 'image/x-icon',
  'txt'  => 'text/plain; charset=UTF-8',
  'map'  => 'application/json',
  'webmanifest' => 'application/manifest+json',
];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
readfile($file);
exit;

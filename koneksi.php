<?php
// Koneksi database.
// Lokal (Laragon): host 127.0.0.1, user root, tanpa password.
// Hosting (Railway MySQL plugin): otomatis pakai env MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE/MYSQLPORT.
$DB_HOST = getenv('MYSQLHOST') ?: getenv('DB_HOST') ?: '127.0.0.1';
$DB_USER = getenv('MYSQLUSER') ?: getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('MYSQLPASSWORD') ?: getenv('DB_PASS') ?: '';
$DB_NAME = getenv('MYSQLDATABASE') ?: getenv('DB_NAME') ?: 'db_eabsensi';
$DB_PORT = (int)(getenv('MYSQLPORT') ?: 3306);

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT);
if ($conn->connect_error) {
  http_response_code(500);
  header('Content-Type: application/json');
  die(json_encode(['ok' => false, 'msg' => 'Koneksi DB gagal: ' . $conn->connect_error . '. Pastikan MySQL Laragon sudah Start.']));
}
$conn->set_charset('utf8mb4');

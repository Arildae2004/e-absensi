<?php
// Jalankan sekali: php setup_db.php  ATAU buka http://localhost:8001/setup_db.php
// Membuat database + tabel + data contoh (guru, kelas, siswa).
header('Content-Type: text/plain; charset=utf-8');

$host = getenv('MYSQLHOST') ?: getenv('DB_HOST') ?: '127.0.0.1';
$user = getenv('MYSQLUSER') ?: getenv('DB_USER') ?: 'root';
$pass = getenv('MYSQLPASSWORD') ?: getenv('DB_PASS') ?: '';
$name = getenv('MYSQLDATABASE') ?: getenv('DB_NAME') ?: 'db_eabsensi';
$port = (int)(getenv('MYSQLPORT') ?: 3306);

// Tunggu database siap (penting saat deploy: MySQL butuh waktu start)
mysqli_report(MYSQLI_REPORT_OFF);
$db = null;
for ($i = 1; $i <= 30; $i++) {
  try {
    $db = @new mysqli($host, $user, $pass, '', $port);
    if ($db && !$db->connect_error) break;
  } catch (Throwable $e) { $db = null; }
  if (php_sapi_name() === 'cli') echo "Menunggu MySQL $host... ($i)\n";
  sleep(2);
}
if (!$db || $db->connect_error) die("GAGAL konek MySQL ke $host:$port. Pastikan MySQL sudah jalan.\n");

$db->query("CREATE DATABASE IF NOT EXISTS `$name` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$db->select_db($name);

$sql = [
"CREATE TABLE IF NOT EXISTS sekolah (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama_sekolah VARCHAR(100) NOT NULL DEFAULT 'SMAN 1 Jakarta',
  alamat_sekolah VARCHAR(255) DEFAULT 'Jl. Merdeka No. 10',
  tahun_ajaran VARCHAR(20) NOT NULL DEFAULT '2025/2026',
  semester ENUM('Ganjil','Genap') NOT NULL DEFAULT 'Ganjil',
  batas_waktu_absensi TIME NOT NULL DEFAULT '10:00:00'
)",
"CREATE TABLE IF NOT EXISTS guru (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nip_username VARCHAR(30) UNIQUE NOT NULL,
  nama_guru VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  inisial VARCHAR(10)
)",
"CREATE TABLE IF NOT EXISTS kelas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama_kelas VARCHAR(20) NOT NULL UNIQUE,
  id_wali_kelas INT NULL,
  FOREIGN KEY (id_wali_kelas) REFERENCES guru(id) ON DELETE SET NULL
)",
"CREATE TABLE IF NOT EXISTS siswa (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nis VARCHAR(20) UNIQUE NOT NULL,
  nama_siswa VARCHAR(100) NOT NULL,
  jenis_kelamin ENUM('L','P') NOT NULL,
  no_hp_ortu VARCHAR(20),
  id_kelas INT NOT NULL,
  FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE
)",
"CREATE TABLE IF NOT EXISTS absensi (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_siswa INT NOT NULL,
  id_kelas INT NOT NULL,
  id_guru INT NOT NULL,
  tanggal DATE NOT NULL,
  jam_ke INT DEFAULT 1,
  status ENUM('H','I','S','A') NOT NULL,
  keterangan VARCHAR(255) DEFAULT '-',
  FOREIGN KEY (id_siswa) REFERENCES siswa(id) ON DELETE CASCADE,
  FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (id_guru) REFERENCES guru(id) ON DELETE CASCADE,
  CONSTRAINT unique_absensi_siswa UNIQUE (id_siswa, tanggal, jam_ke)
)",
"CREATE TABLE IF NOT EXISTS pemanggilan_siswa (
  id INT PRIMARY KEY AUTO_INCREMENT,
  id_siswa INT NOT NULL,
  id_kelas INT NOT NULL,
  jumlah_alpa INT DEFAULT 0,
  status ENUM('Pending','Diproses','Selesai') DEFAULT 'Pending',
  FOREIGN KEY (id_siswa) REFERENCES siswa(id) ON DELETE CASCADE,
  FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE
)",
];

foreach ($sql as $q) {
  if (!$db->query($q)) die("GAGAL buat tabel: " . $db->error . "\n");
}
echo "OK: database + tabel siap.\n";

// --- SEED ---
$db->query("INSERT IGNORE INTO sekolah (id,nama_sekolah,alamat_sekolah,tahun_ajaran,semester,batas_waktu_absensi)
  VALUES (1,'SMAN 1 Jakarta','Jl. Merdeka No. 10','2025/2026','Ganjil','10:00:00')");

$passHash = password_hash('admin123', PASSWORD_DEFAULT);
$stmt = $db->prepare("INSERT IGNORE INTO guru (nip_username,nama_guru,password,inisial) VALUES (?,?,?,?)");
$nip = '19870512'; $nama = 'Ratna Wijaya'; $inis = 'RW';
$stmt->bind_param('ssss', $nip, $nama, $passHash, $inis);
$stmt->execute();
$guruId = $db->query("SELECT id FROM guru WHERE nip_username='19870512'")->fetch_assoc()['id'];

foreach (['X-1','XI IPA 1','XII IPS 1'] as $k) {
  $st = $db->prepare("INSERT IGNORE INTO kelas (nama_kelas,id_wali_kelas) VALUES (?,?)");
  $st->bind_param('si', $k, $guruId); $st->execute();
}

$contoh = [
  ['Ahmad Fauzi','L'],['Siti Aisyah','P'],['Budi Santoso','L'],['Dewi Lestari','P'],
  ['Rizky Ramadhan','L'],['Putri Ayu','P'],['Andi Pratama','L'],['Nadia Safitri','P'],
];
$kelasRows = $db->query("SELECT id,nama_kelas FROM kelas");
$nis = 2024001;
while ($kl = $kelasRows->fetch_assoc()) {
  foreach ($contoh as $i => [$nm,$jk]) {
    $nisStr = (string)($nis++);
    $hp = '0812-4400-' . substr($nisStr,-2);
    $st = $db->prepare("INSERT IGNORE INTO siswa (nis,nama_siswa,jenis_kelamin,no_hp_ortu,id_kelas) VALUES (?,?,?,?,?)");
    $st->bind_param('ssssi', $nisStr, $nm, $jk, $hp, $kl['id']);
    $st->execute();
  }
}
echo "OK: data contoh terisi.\n";
echo "Login: NIP=19870512  password=admin123\n";

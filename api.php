<?php
// API JSON untuk frontend. Akses: api.php?action=login | siswa | absensi_get | absensi_save | rekap | dashboard | pengaturan
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require __DIR__ . '/koneksi.php';

$action = $_GET['action'] ?? '';
$body = json_decode(file_get_contents('php://input'), true) ?: $_POST;

function out($data, $code = 200) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function kelasId($conn, $nama) {
  if ($nama === 'SEMUA' || !$nama) return null;
  $st = $conn->prepare("SELECT id FROM kelas WHERE nama_kelas=?");
  $st->bind_param('s', $nama); $st->execute();
  $r = $st->get_result()->fetch_assoc();
  return $r['id'] ?? null;
}

// ---------- LOGIN ----------
if ($action === 'login') {
  $u = trim($body['username'] ?? ''); $p = $body['password'] ?? '';
  if (!$u || !$p) out(['ok'=>false,'msg'=>'NIP dan sandi wajib diisi'], 400);
  // izinkan input "19870512 201001 1 002" -> ambil segmen pertama agar cocok dgn seed
  $u1 = strtok($u, " ");
  $st = $conn->prepare("SELECT id,nip_username,nama_guru,password,inisial FROM guru WHERE nip_username=? OR nip_username=?");
  $st->bind_param('ss', $u, $u1); $st->execute();
  $g = $st->get_result()->fetch_assoc();
  if (!$g || !password_verify($p, $g['password'])) out(['ok'=>false,'msg'=>'NIP / sandi salah'], 401);
  unset($g['password']);
  out(['ok'=>true,'guru'=>$g]);
}

// ---------- DASHBOARD ----------
if ($action === 'dashboard') {
  $tgl = $_GET['tanggal'] ?? date('Y-m-d');
  $kelas = $_GET['kelas'] ?? 'SEMUA';
  $kid = kelasId($conn, $kelas);
  $w = $kid ? "AND s.id_kelas=$kid" : "";
  $total = $conn->query("SELECT COUNT(*) c FROM siswa s WHERE 1 $w")->fetch_assoc()['c'];
  $q = $conn->query("SELECT status,COUNT(*) c FROM absensi a JOIN siswa s ON s.id=a.id_siswa
    WHERE a.tanggal='$tgl' $w GROUP BY status");
  $c = ['H'=>0,'I'=>0,'S'=>0,'A'=>0];
  while ($r = $q->fetch_assoc()) $c[$r['status']] = (int)$r['c'];
  $terisi = array_sum($c);
  out(['ok'=>true,'tanggal'=>$tgl,'total'=>(int)$total,'terisi'=>$terisi,
    'hadir'=>$c['H'],'izin'=>$c['I'],'sakit'=>$c['S'],'alpa'=>$c['A']]);
}

// ---------- LIST SISWA ----------
if ($action === 'siswa') {
  $kelas = $_GET['kelas'] ?? 'SEMUA'; $q = trim($_GET['q'] ?? '');
  $kid = kelasId($conn, $kelas);
  $sql = "SELECT s.id,s.nis,s.nama_siswa,s.jenis_kelamin,s.no_hp_ortu,k.nama_kelas
    FROM siswa s JOIN kelas k ON k.id=s.id_kelas WHERE 1";
  if ($kid) $sql .= " AND s.id_kelas=$kid";
  if ($q !== '') { $e = $conn->real_escape_string($q); $sql .= " AND (s.nama_siswa LIKE '%$e%' OR s.nis LIKE '%$e%')"; }
  $sql .= " ORDER BY s.nama_siswa LIMIT 200";
  $rows = $conn->query($sql)->fetch_all(MYSQLI_ASSOC);
  out(['ok'=>true,'data'=>$rows]);
}

// ---------- SIMPAN SISWA ----------
if ($action === 'siswa_save') {
  $nis = trim($body['nis'] ?? ''); $nm = trim($body['nama'] ?? '');
  $jk = $body['jk'] ?? 'L'; $hp = trim($body['hp'] ?? ''); $kls = $body['kelas'] ?? '';
  $id = $body['id'] ?? null;
  if (!$nis || !$nm || !$kls) out(['ok'=>false,'msg'=>'NIS, nama, kelas wajib'], 400);
  $kid = kelasId($conn, $kls);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  if ($id) {
    $st = $conn->prepare("UPDATE siswa SET nis=?,nama_siswa=?,jenis_kelamin=?,no_hp_ortu=?,id_kelas=? WHERE id=?");
    $st->bind_param('ssssii', $nis,$nm,$jk,$hp,$kid,$id);
    out(['ok'=>$st->execute()]);
  } else {
    $st = $conn->prepare("INSERT INTO siswa (nis,nama_siswa,jenis_kelamin,no_hp_ortu,id_kelas) VALUES (?,?,?,?,?)");
    $st->bind_param('ssssi', $nis,$nm,$jk,$hp,$kid);
    if (!$st->execute()) out(['ok'=>false,'msg'=>'Gagal: '.$st->error], 400);
    out(['ok'=>true,'id'=>$st->insert_id]);
  }
}

// ---------- HAPUS SISWA ----------
if ($action === 'siswa_hapus') {
  $id = (int)($body['id'] ?? 0);
  if (!$id) out(['ok'=>false,'msg'=>'ID tidak valid'], 400);
  $st = $conn->prepare("DELETE FROM siswa WHERE id=?");
  $st->bind_param('i', $id); $st->execute();
  if ($st->affected_rows === 0) out(['ok'=>false,'msg'=>'Siswa tidak ditemukan'], 404);
  out(['ok'=>true]); // absensi ikut terhapus via FK ON DELETE CASCADE
}

// ---------- AMBIL ABSENSI ----------
if ($action === 'absensi_get') {
  $tgl = $_GET['tanggal'] ?? date('Y-m-d'); $kelas = $_GET['kelas'] ?? 'X-1';
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Pilih kelas spesifik'], 400);
  $rows = $conn->query("SELECT s.id,s.nis,s.nama_siswa,a.status,a.keterangan
    FROM siswa s LEFT JOIN absensi a ON a.id_siswa=s.id AND a.tanggal='$tgl' AND a.jam_ke=1
    WHERE s.id_kelas=$kid ORDER BY s.nama_siswa")->fetch_all(MYSQLI_ASSOC);
  out(['ok'=>true,'tanggal'=>$tgl,'kelas'=>$kelas,'data'=>$rows]);
}

// ---------- SIMPAN ABSENSI ----------
if ($action === 'absensi_save') {
  $tgl = $body['tanggal'] ?? date('Y-m-d');
  $kelas = $body['kelas'] ?? ''; $guru = (int)($body['id_guru'] ?? 0);
  $items = $body['items'] ?? [];
  if (!$kelas || !$guru || !$items) out(['ok'=>false,'msg'=>'Data tidak lengkap'], 400);
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  $conn->begin_transaction();
  try {
    $st = $conn->prepare("INSERT INTO absensi (id_siswa,id_kelas,id_guru,tanggal,jam_ke,status,keterangan)
      VALUES (?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), keterangan=VALUES(keterangan)");
    foreach ($items as $it) {
      $sid = (int)$it['id_siswa']; $s = $it['status'] ?? 'H'; $ket = $it['keterangan'] ?? '-';
      if (!in_array($s, ['H','I','S','A'])) $s = 'H';
      $st->bind_param('iiisss', $sid, $kid, $guru, $tgl, $s, $ket);
      $st->execute();
    }
    $conn->commit();
    out(['ok'=>true,'tersimpan'=>count($items)]);
  } catch (Throwable $e) { $conn->rollback(); out(['ok'=>false,'msg'=>$e->getMessage()], 500); }
}

// ---------- HAPUS ABSENSI (per tanggal+kelas, untuk betulkan salah input) ----------
if ($action === 'absensi_hapus') {
  $tgl = $body['tanggal'] ?? ''; $kelas = $body['kelas'] ?? ''; $guru = (int)($body['id_guru'] ?? 0);
  if (!$tgl || !$kelas || !$guru) out(['ok'=>false,'msg'=>'Data tidak lengkap'], 400);
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  $st = $conn->prepare("DELETE FROM absensi WHERE tanggal=? AND id_kelas=?");
  $st->bind_param('si', $tgl, $kid); $st->execute();
  out(['ok'=>true,'dihapus'=>$st->affected_rows]);
}

// ---------- REKAP ----------
if ($action === 'rekap') {
  $bulan = $_GET['bulan'] ?? date('Y-m'); $kelas = $_GET['kelas'] ?? 'SEMUA';
  $kid = kelasId($conn, $kelas);
  $w = $kid ? "AND s.id_kelas=$kid" : "";
  $sql = "SELECT s.nis,s.nama_siswa,k.nama_kelas,
    SUM(a.status='H') H, SUM(a.status='I') I, SUM(a.status='S') S, SUM(a.status='A') A,
    COUNT(a.id) tot FROM siswa s JOIN kelas k ON k.id=s.id_kelas
    LEFT JOIN absensi a ON a.id_siswa=s.id AND DATE_FORMAT(a.tanggal,'%Y-%m')='$bulan'
    WHERE 1 $w GROUP BY s.id ORDER BY s.nama_siswa LIMIT 200";
  $rows = $conn->query($sql)->fetch_all(MYSQLI_ASSOC);
  foreach ($rows as &$r) {
    $t = (int)$r['tot']; $r['pct'] = $t ? round($r['H']/$t*100) : 0;
    $r['status'] = $t == 0 ? '—' : ($r['pct'] >= 90 ? 'Baik' : ($r['pct'] >= 75 ? 'Pantau' : 'Bermasalah'));
  }
  out(['ok'=>true,'bulan'=>$bulan,'data'=>$rows]);
}

// ---------- PENGATURAN ----------
if ($action === 'pengaturan_get') {
  out(['ok'=>true,'data'=>$conn->query("SELECT * FROM sekolah WHERE id=1")->fetch_assoc()]);
}
if ($action === 'pengaturan_save') {
  $st = $conn->prepare("UPDATE sekolah SET nama_sekolah=?,alamat_sekolah=?,tahun_ajaran=?,semester=?,batas_waktu_absensi=? WHERE id=1");
  $st->bind_param('sssss', $body['nama_sekolah'], $body['alamat_sekolah'], $body['tahun_ajaran'], $body['semester'], $body['batas']);
  out(['ok'=>$st->execute()]);
}

// ---------- DAFTAR KELAS ----------
if ($action === 'kelas') {
  out(['ok'=>true,'data'=>$conn->query("SELECT k.nama_kelas,COUNT(s.id) jml FROM kelas k LEFT JOIN siswa s ON s.id_kelas=k.id GROUP BY k.id")->fetch_all(MYSQLI_ASSOC)]);
}

out(['ok'=>false,'msg'=>'action tidak dikenal'], 404);

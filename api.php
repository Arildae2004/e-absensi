<?php
// API JSON untuk frontend. Akses: api.php?action=login | siswa | absensi_get | absensi_save | rekap | dashboard | pengaturan
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
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
// Nama disimpan dalam bentuk Title Case supaya konsisten di semua tampilan
// ("ARIL SAFITRI" -> "Aril Safitri", "ahmad fauzi" -> "Ahmad Fauzi")
// Hanya huruf ASCII yang diubah; byte non-ASCII (UTF-8) dibiarkan apa adanya.
function titleCaseNama($s) {
  $s = trim(preg_replace('/\s+/', ' ', $s));
  if ($s === '') return $s;
  $out = '';
  $prev = ' ';
  $len = strlen($s);
  for ($i = 0; $i < $len; $i++) {
    $ch = $s[$i];
    if (preg_match('/[a-zA-Z]/', $ch)) {
      $awalKata = ($prev === ' ' || $prev === '-' || $prev === "'");
      $out .= $awalKata ? strToUpper($ch) : strToLower($ch);
    } else {
      $out .= $ch;
    }
    $prev = $ch;
  }
  return $out;
}

// ---------- util keamanan & identitas ----------
// Kredensial demo: env DEMO_LOGIN (1=tampil, 0=sembunyi).
// Bila tidak diset — tampil di lokal, otomatis sembunyi di Railway (produksi).
function flagDemo() {
  $e = getenv('DEMO_LOGIN');
  if ($e !== false && $e !== '') return in_array(strtolower($e), ['1', 'true', 'yes', 'on']);
  return !getenv('RAILWAY_ENVIRONMENT');
}
// Peran efektif: kolom `peran`, bisa ditambah paksa lewat env ADMIN_NIPS (dipisah koma)
function peranEfektif($nip, $peran) {
  if ($peran === 'admin') return 'admin';
  $env = getenv('ADMIN_NIPS');
  if ($env) foreach (explode(',', $env) as $n) if (trim($n) !== '' && trim($n) === (string)$nip) return 'admin';
  return 'guru';
}
function tokenDariRequest($body) {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
  if (preg_match('/Bearer\s+([A-Za-z0-9]+)/i', $h, $m)) return $m[1];
  return trim($body['token'] ?? ''); // cadangan bila header tidak diteruskan server
}
// Semua aksi selain `login` & `pengaturan_get` wajib membawa token sesi yang masih berlaku
function perluAuth($conn, $body) {
  $tok = tokenDariRequest($body);
  if ($tok === '') out(['ok'=>false,'msg'=>'Sesi berakhir. Silakan masuk kembali.'], 401);
  $st = $conn->prepare("SELECT id,nip_username,nama_guru,inisial,peran FROM guru WHERE token=? AND token_exp>NOW()");
  $st->bind_param('s', $tok); $st->execute();
  $g = $st->get_result()->fetch_assoc();
  if (!$g) out(['ok'=>false,'msg'=>'Sesi berakhir. Silakan masuk kembali.'], 401);
  $g['peran'] = peranEfektif($g['nip_username'], $g['peran']);
  return $g;
}
function wajibAdmin($akun) {
  if (($akun['peran'] ?? 'guru') !== 'admin') out(['ok'=>false,'msg'=>'Fitur ini hanya untuk Admin/TU.'], 403);
}

// ---------- LOGIN ----------
if ($action === 'login') {
  $u = trim($body['username'] ?? ''); $p = $body['password'] ?? '';
  if (!$u || !$p) out(['ok'=>false,'msg'=>'NIP dan sandi wajib diisi'], 400);
  // izinkan input "19870512 201001 1 002" -> ambil segmen pertama agar cocok dgn seed
  $u1 = strtok($u, " ");
  $st = $conn->prepare("SELECT id,nip_username,nama_guru,password,inisial,peran FROM guru WHERE nip_username=? OR nip_username=?");
  $st->bind_param('ss', $u, $u1); $st->execute();
  $g = $st->get_result()->fetch_assoc();
  if (!$g || !password_verify($p, $g['password'])) out(['ok'=>false,'msg'=>'NIP / sandi salah'], 400);
  unset($g['password']);
  // terbitkan token sesi (berlaku 30 hari)
  $token = bin2hex(random_bytes(24));
  $exp = date('Y-m-d H:i:s', time() + 30 * 86400);
  $st = $conn->prepare("UPDATE guru SET token=?, token_exp=? WHERE id=?");
  $st->bind_param('ssi', $token, $exp, $g['id']); $st->execute();
  $g['peran'] = peranEfektif($g['nip_username'], $g['peran']);
  out(['ok'=>true,'guru'=>$g,'token'=>$token]);
}

// ---------- SESI: semua aksi lain wajib token (kecuali pengaturan_get untuk halaman login) ----------
$AKUN = in_array($action, ['pengaturan_get', ''], true) ? null : perluAuth($conn, $body);

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
  $nis = trim($body['nis'] ?? ''); $nm = titleCaseNama($body['nama'] ?? '');
  $jk = $body['jk'] ?? 'L'; $hp = trim($body['hp'] ?? ''); $kls = $body['kelas'] ?? '';
  $id = $body['id'] ?? null;
  if (!$nis || !$nm || !$kls) out(['ok'=>false,'msg'=>'NIS, nama, kelas wajib'], 400);
  $kid = kelasId($conn, $kls);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  try {
    if ($id) {
      $st = $conn->prepare("UPDATE siswa SET nis=?,nama_siswa=?,jenis_kelamin=?,no_hp_ortu=?,id_kelas=? WHERE id=?");
      $st->bind_param('ssssii', $nis,$nm,$jk,$hp,$kid,$id);
      out(['ok'=>$st->execute()]);
    } else {
      $st = $conn->prepare("INSERT INTO siswa (nis,nama_siswa,jenis_kelamin,no_hp_ortu,id_kelas) VALUES (?,?,?,?,?)");
      $st->bind_param('ssssi', $nis,$nm,$jk,$hp,$kid);
      $st->execute();
      out(['ok'=>true,'id'=>$st->insert_id]);
    }
  } catch (Throwable $e) {
    out(['ok'=>false,'msg'=> $conn->errno === 1062 ? 'Gagal: NIS sudah terdaftar.' : 'Gagal menyimpan siswa.'], 400);
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
  // lokasi perekam absensi (bila pernah tersimpan)
  $st = $conn->prepare("SELECT lokasi_lat lat, lokasi_lng lng, lokasi_akurasi akurasi, id_guru
    FROM absensi WHERE id_kelas=? AND tanggal=? AND lokasi_lat IS NOT NULL LIMIT 1");
  $st->bind_param('is', $kid, $tgl); $st->execute();
  out(['ok'=>true,'tanggal'=>$tgl,'kelas'=>$kelas,'data'=>$rows,'lokasi'=>$st->get_result()->fetch_assoc()]);
}

// ---------- SIMPAN ABSENSI ----------
if ($action === 'absensi_save') {
  $tgl = $body['tanggal'] ?? date('Y-m-d');
  $kelas = $body['kelas'] ?? ''; $guru = (int)$AKUN['id'];
  $items = $body['items'] ?? [];
  if (!$kelas || !$items) out(['ok'=>false,'msg'=>'Data tidak lengkap'], 400);
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  // lokasi guru saat mengisi (opsional, dikirim dari HP)
  $lat = isset($body['lokasi']['lat']) ? (float)$body['lokasi']['lat'] : null;
  $lng = isset($body['lokasi']['lng']) ? (float)$body['lokasi']['lng'] : null;
  $akr = isset($body['lokasi']['akurasi']) ? (float)$body['lokasi']['akurasi'] : null;
  $conn->begin_transaction();
  try {
    $st = $conn->prepare("INSERT INTO absensi (id_siswa,id_kelas,id_guru,tanggal,jam_ke,status,keterangan,lokasi_lat,lokasi_lng,lokasi_akurasi)
      VALUES (?,?,?,?,1,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), keterangan=VALUES(keterangan),
        lokasi_lat=VALUES(lokasi_lat), lokasi_lng=VALUES(lokasi_lng), lokasi_akurasi=VALUES(lokasi_akurasi)");
    foreach ($items as $it) {
      $sid = (int)$it['id_siswa']; $s = $it['status'] ?? 'H'; $ket = $it['keterangan'] ?? '-';
      if (!in_array($s, ['H','I','S','A'])) $s = 'H';
      $st->bind_param('iiisssddd', $sid, $kid, $guru, $tgl, $s, $ket, $lat, $lng, $akr);
      $st->execute();
    }
    $conn->commit();
    out(['ok'=>true,'tersimpan'=>count($items),'lokasi'=>($lat !== null ? ['lat'=>$lat,'lng'=>$lng,'akurasi'=>$akr] : null)]);
  } catch (Throwable $e) { $conn->rollback(); out(['ok'=>false,'msg'=>$e->getMessage()], 500); }
}

// ---------- HAPUS ABSENSI (per tanggal+kelas, untuk betulkan salah input) ----------
if ($action === 'absensi_hapus') {
  $tgl = $body['tanggal'] ?? ''; $kelas = $body['kelas'] ?? ''; $guru = (int)$AKUN['id'];
  if (!$tgl || !$kelas) out(['ok'=>false,'msg'=>'Data tidak lengkap'], 400);
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
  // publik: dipakai halaman login untuk mengambil identitas sekolah
  $d = $conn->query("SELECT * FROM sekolah WHERE id=1")->fetch_assoc();
  out(['ok'=>true,'data'=>$d,'demo'=>flagDemo()]);
}
if ($action === 'pengaturan_save') {
  wajibAdmin($AKUN);
  $logo = trim($body['logo_sekolah'] ?? '');
  if ($logo !== '' && !preg_match('#^https?://#i', $logo) && !preg_match('#^[\w\-./]+\.(png|jpe?g|svg|webp)$#i', $logo)) {
    out(['ok'=>false,'msg'=>'Logo harus URL gambar (png/jpg/svg/webp).'], 400);
  }
  $st = $conn->prepare("UPDATE sekolah SET nama_sekolah=?,alamat_sekolah=?,tahun_ajaran=?,semester=?,batas_waktu_absensi=?,logo_sekolah=? WHERE id=1");
  $st->bind_param('ssssss', $body['nama_sekolah'], $body['alamat_sekolah'], $body['tahun_ajaran'], $body['semester'], $body['batas'], $logo);
  try {
    out(['ok'=>$st->execute()]);
  } catch (Throwable $e) {
    out(['ok'=>false,'msg'=>'Gagal menyimpan pengaturan.'], 500);
  }
}

// ---------- GANTI SANDI (akun yang sedang masuk) ----------
if ($action === 'ganti_password') {
  $lama = $body['lama'] ?? ''; $baru = $body['baru'] ?? '';
  if (strlen($baru) < 6) out(['ok'=>false,'msg'=>'Sandi baru minimal 6 karakter.'], 400);
  if ($lama === '') out(['ok'=>false,'msg'=>'Sandi lama wajib diisi.'], 400);
  $st = $conn->prepare("SELECT password FROM guru WHERE id=?"); $st->bind_param('i', $AKUN['id']); $st->execute();
  $hash = $st->get_result()->fetch_assoc()['password'] ?? '';
  if (!password_verify($lama, $hash)) out(['ok'=>false,'msg'=>'Sandi lama salah.'], 400);
  $h2 = password_hash($baru, PASSWORD_DEFAULT);
  $st = $conn->prepare("UPDATE guru SET password=? WHERE id=?"); $st->bind_param('si', $h2, $AKUN['id']);
  out(['ok'=>$st->execute()]);
}

// ---------- MANAJEMEN GURU (khusus Admin/TU) ----------
if ($action === 'guru_list') {
  wajibAdmin($AKUN);
  out(['ok'=>true,'data'=>$conn->query("SELECT id,nip_username,nama_guru,inisial,peran FROM guru ORDER BY nama_guru")->fetch_all(MYSQLI_ASSOC)]);
}
if ($action === 'guru_simpan') {
  wajibAdmin($AKUN);
  $id = $body['id'] ?? null;
  $nip = trim($body['nip'] ?? ''); $nama = titleCaseNama($body['nama'] ?? '');
  $inis = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $body['inisial'] ?? ''), 0, 3));
  $sandi = (string)($body['sandi'] ?? '');
  $peran = ($body['peran'] ?? 'guru') === 'admin' ? 'admin' : 'guru';
  if (!$nip || !$nama) out(['ok'=>false,'msg'=>'NIP dan nama wajib diisi.'], 400);
  if ($inis === '') $inis = strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $nama), 0, 2));
  try {
    if ($id) {
      if ($sandi !== '') {
        $h = password_hash($sandi, PASSWORD_DEFAULT);
        $st = $conn->prepare("UPDATE guru SET nip_username=?,nama_guru=?,inisial=?,peran=?,password=? WHERE id=?");
        $st->bind_param('sssssi', $nip, $nama, $inis, $peran, $h, $id);
      } else {
        $st = $conn->prepare("UPDATE guru SET nip_username=?,nama_guru=?,inisial=?,peran=? WHERE id=?");
        $st->bind_param('ssssi', $nip, $nama, $inis, $peran, $id);
      }
      $st->execute();
      out(['ok'=>true]);
    }
    if ($sandi === '') out(['ok'=>false,'msg'=>'Sandi awal wajib diisi untuk guru baru.'], 400);
    $h = password_hash($sandi, PASSWORD_DEFAULT);
    $st = $conn->prepare("INSERT INTO guru (nip_username,nama_guru,inisial,peran,password) VALUES (?,?,?,?,?)");
    $st->bind_param('sssss', $nip, $nama, $inis, $peran, $h);
    $st->execute();
    out(['ok'=>true,'id'=>$st->insert_id]);
  } catch (Throwable $e) {
    out(['ok'=>false,'msg'=> $conn->errno === 1062 ? 'Gagal: NIP sudah dipakai guru lain.' : 'Gagal menyimpan guru.'], 400);
  }
}
if ($action === 'guru_hapus') {
  wajibAdmin($AKUN);
  $id = (int)($body['id'] ?? 0);
  if (!$id) out(['ok'=>false,'msg'=>'ID tidak valid'], 400);
  if ($id === (int)$AKUN['id']) out(['ok'=>false,'msg'=>'Tidak bisa menghapus akun sendiri.'], 400);
  $conn->begin_transaction();
  try {
    // riwayat absensi dialihkan ke admin yang menghapus agar data tidak hilang
    $st = $conn->prepare("UPDATE absensi SET id_guru=? WHERE id_guru=?"); $st->bind_param('ii', $AKUN['id'], $id); $st->execute();
    $st = $conn->prepare("UPDATE kelas SET id_wali_kelas=NULL WHERE id_wali_kelas=?"); $st->bind_param('i', $id); $st->execute();
    $st = $conn->prepare("DELETE FROM guru WHERE id=?"); $st->bind_param('i', $id); $st->execute();
    $ok = $st->affected_rows > 0;
    $conn->commit();
    out(['ok'=>$ok]);
  } catch (Throwable $e) { $conn->rollback(); out(['ok'=>false,'msg'=>$e->getMessage()], 500); }
}

// ---------- BUKTI FOTO KEGIATAN (1 per kelas per tanggal) ----------
if ($action === 'bukti_simpan') {
  $kelas = $body['kelas'] ?? ''; $tgl = $body['tanggal'] ?? date('Y-m-d');
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  $foto64 = (string)($body['foto'] ?? '');
  $foto64 = preg_replace('#^data:image/[\w+.-]+;base64,#', '', $foto64);
  $bin = base64_decode($foto64, true);
  if (!$bin) out(['ok'=>false,'msg'=>'Foto tidak valid.'], 400);
  if (strlen($bin) > 3 * 1024 * 1024) out(['ok'=>false,'msg'=>'Ukuran foto maksimal 3 MB.'], 400);
  $mime = (string)($body['mime'] ?? 'image/jpeg');
  if (!preg_match('#^image/(jpeg|png|webp)$#', $mime)) $mime = 'image/jpeg';
  $st = $conn->prepare("INSERT INTO bukti_absensi (id_kelas,tanggal,id_guru,mime,foto) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE id_guru=VALUES(id_guru), mime=VALUES(mime), foto=VALUES(foto), diambil_pada=CURRENT_TIMESTAMP");
  // catatan: bind tipe 'b' tidak mengirim byte di build PHP ini — 's' terbukti utuh
  $st->bind_param('isiss', $kid, $tgl, $AKUN['id'], $mime, $bin);
  if (!$st->execute()) out(['ok'=>false,'msg'=>'Gagal menyimpan foto: ' . $st->error], 500);
  out(['ok'=>true]);
}
if ($action === 'bukti_get') {
  $kelas = $_GET['kelas'] ?? ''; $tgl = $_GET['tanggal'] ?? date('Y-m-d');
  $kid = kelasId($conn, $kelas);
  if (!$kid) out(['ok'=>false,'msg'=>'Kelas tidak dikenal'], 400);
  $st = $conn->prepare("SELECT mime,foto,diambil_pada FROM bukti_absensi WHERE id_kelas=? AND tanggal=?");
  $st->bind_param('is', $kid, $tgl); $st->execute();
  $r = $st->get_result()->fetch_assoc();
  if (!$r) out(['ok'=>false,'msg'=>'Belum ada foto bukti.'], 404);
  out(['ok'=>true,'mime'=>$r['mime'],'diambil_pada'=>$r['diambil_pada'],'foto'=>base64_encode($r['foto'])]);
}

// ---------- DAFTAR KELAS ----------
if ($action === 'kelas') {
  out(['ok'=>true,'data'=>$conn->query("SELECT k.nama_kelas,COUNT(s.id) jml FROM kelas k LEFT JOIN siswa s ON s.id_kelas=k.id GROUP BY k.id")->fetch_all(MYSQLI_ASSOC)]);
}

out(['ok'=>false,'msg'=>'action tidak dikenal'], 404);

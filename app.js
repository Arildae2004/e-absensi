// Frontend terhubung ke backend PHP + MySQL (api.php).
const API = 'api.php';
let GURU = JSON.parse(sessionStorage.getItem('guru') || 'null');
let TOKEN = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
let ABSENSI = []; // baris absensi aktif

// --- request dengan token sesi (backend menolak semua aksi tanpa token) ---
const hdr = () => (TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {});
let pesanSesi = false;
function sesiHabis() {
  if (pesanSesi) return;
  pesanSesi = true;
  TOKEN = '';
  sessionStorage.removeItem('token'); localStorage.removeItem('token'); sessionStorage.removeItem('guru');
  if (document.getElementById('app').classList.contains('hidden')) return; // masih di halaman login
  alert('Sesi berakhir. Silakan masuk kembali.');
  location.reload();
}
async function jget(url) {
  const r = await fetch(url, { headers: hdr() });
  if (r.status === 401) { sesiHabis(); return { ok: false, msg: 'Sesi berakhir.' }; }
  return r.json();
}
async function jpost(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hdr() }, body: JSON.stringify(data) });
  if (r.status === 401) { sesiHabis(); return { ok: false, msg: 'Sesi berakhir.' }; }
  return r.json();
}
const pill = s => ({ H: '<span class="pill h">Hadir</span>', I: '<span class="pill i">Izin</span>', S: '<span class="pill s">Sakit</span>', A: '<span class="pill a">Alpa</span>' }[s] || '<span class="pill">-</span>');
const nmStatus = s => ({ H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' }[s] || '-');

// Nama selalu tampil Title Case supaya konsisten: "ARIL" -> "Aril", "ahmad fauzi" -> "Ahmad Fauzi"
const titleCase = s => String(s || '')
  .toLocaleLowerCase('id-id')
  .replace(/(^|[\s\-'.’])(\S)/g, (m, p1, p2) => p1 + p2.toLocaleUpperCase('id-id'));

// Badge berwarna agar status mudah dibaca sekilas (hijau=baik, kuning=pantau, merah=perhatian, abu=belum ada data)
function badge(teks) {
  let s = String(teks || '').trim();
  if (!s || s === '—') s = 'Belum ada data';
  const k = /Bermasalah|Perhatian|Alpa/.test(s) ? 'b-a'
    : /Pantau|Izin/.test(s) ? 'b-i'
    : /Sakit/.test(s) ? 'b-s'
    : /Baik|Hadir/.test(s) ? 'b-h'
    : 'b-kosong';
  return `<span class="badge ${k}">${esc(s)}</span>`;
}
// Label status rekap bulanan — dipakai tabel Rekap & ringkasan dashboard
function labelRekap(x) {
  if (!Number(x.tot)) return 'Belum ada data';
  const pct = Number(x.pct);
  if (x.A > 0 && pct < 75) return 'Alpa';
  return pct >= 90 ? 'Hadir Baik' : (pct >= 75 ? 'Perlu Pantau' : 'Perlu Perhatian');
}

async function masuk() {
  const u = document.getElementById('in-nip').value.trim();
  const p = document.getElementById('in-pass').value;
  const msg = document.getElementById('login-msg');
  msg.classList.add('hidden');
  try {
    const r = await jpost(API + '?action=login', { username: u, password: p });
    if (!r.ok) { msg.textContent = r.msg || 'Login gagal'; msg.classList.remove('hidden'); return; }
    GURU = r.guru; TOKEN = r.token; pesanSesi = false;
    sessionStorage.setItem('guru', JSON.stringify(GURU));
    if (document.getElementById('in-ingat').checked) { localStorage.setItem('token', TOKEN); sessionStorage.removeItem('token'); }
    else { sessionStorage.setItem('token', TOKEN); localStorage.removeItem('token'); }
    enterApp();
  } catch (e) {
    msg.textContent = 'Tidak bisa hubungi server. Periksa koneksi internet lalu muat ulang halaman.';
    msg.classList.remove('hidden');
  }
}
function keluar() {
  sessionStorage.removeItem('guru'); sessionStorage.removeItem('token'); localStorage.removeItem('token');
  location.reload();
}

// panduan "lupa sandi" — tombol pengganti tautan mati di formulir login
function lupaSandi() { document.getElementById('lupa-box').classList.toggle('hidden'); }

// ---------- Akun saya (ganti kata sandi) ----------
function bukaAkun() {
  if (!GURU) return;
  document.getElementById('ak-ava').textContent = (GURU.inisial || 'GR').toUpperCase();
  document.getElementById('ak-nama').textContent = titleCase(GURU.nama_guru);
  document.getElementById('ak-nip').textContent = GURU.nip_username ? `NIP ${GURU.nip_username}` : '—';
  document.getElementById('ak-peran').textContent = GURU.peran === 'admin' ? 'Admin / TU' : 'Guru / Wali Kelas';
  document.getElementById('ak-msg').textContent = '';
  ['ak-lama', 'ak-baru', 'ak-ulang'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modal-akun').classList.remove('hidden');
}
function tutupAkun() { document.getElementById('modal-akun').classList.add('hidden'); }
async function gantiSandi() {
  const m = document.getElementById('ak-msg');
  const lama = document.getElementById('ak-lama').value;
  const baru = document.getElementById('ak-baru').value;
  const ulang = document.getElementById('ak-ulang').value;
  m.className = 'note';
  if (baru.length < 6) { m.textContent = 'Sandi baru minimal 6 karakter.'; m.className = 'note err'; return; }
  if (baru !== ulang) { m.textContent = 'Konfirmasi sandi baru tidak sama.'; m.className = 'note err'; return; }
  try {
    const r = await jpost(API + '?action=ganti_password', { lama, baru });
    if (!r.ok) { m.textContent = r.msg || 'Gagal mengganti sandi.'; m.className = 'note err'; return; }
    m.textContent = 'Sandi berhasil diganti. Gunakan sandi baru pada login berikutnya.';
    ['ak-lama', 'ak-baru', 'ak-ulang'].forEach(id => document.getElementById(id).value = '');
  } catch (e) { m.textContent = 'Gagal hubungi server.'; m.className = 'note err'; }
}

function enterApp() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('u-nama').textContent = titleCase(GURU.nama_guru);
  document.getElementById('u-ava').textContent = (GURU.inisial || String(GURU.nama_guru || '').slice(0, 2)).toUpperCase();
  document.getElementById('u-kelas').textContent = GURU.nip_username ? `NIP ${GURU.nip_username}` : 'Akun Guru';
  const admin = GURU.peran === 'admin';
  document.getElementById('u-peran').textContent = admin ? 'Admin / TU' : 'Guru / Wali Kelas';
  // menu khusus Admin/TU disembunyikan untuk guru biasa
  document.getElementById('menu-pengaturan').classList.toggle('hidden', !admin);
  document.getElementById('menu-guru').classList.toggle('hidden', !admin);
  if (!admin && ['pengaturan', 'guru'].includes((document.querySelector('.pg:not(.hidden)') || {}).id?.replace('pg-', ''))) pindah('dashboard');
  muatSemua(); muatPengaturan(); if (admin) muatGuru();
}
function pindah(nama) {
  document.querySelectorAll('.sidebar nav button').forEach(b => b.classList.toggle('active', b.dataset.p === nama));
  document.querySelectorAll('.pg').forEach(p => p.classList.add('hidden'));
  document.getElementById('pg-' + nama).classList.remove('hidden');
  document.getElementById('judul').textContent = { dashboard: 'Dashboard', absensi: 'Absensi', siswa: 'Data Siswa', rekap: 'Rekap', pengaturan: 'Pengaturan', guru: 'Manajemen Guru' }[nama] || nama;
  // filter bulan + Export/Cetak hanya relevan di halaman Rekap
  document.getElementById('top-rekap').classList.toggle('hidden', nama !== 'rekap');
  // minta izin lokasi saat pertama kali buka halaman absensi (audit kehadiran wali kelas)
  if (nama === 'absensi' && !LOKASI_DIMINTA) ambilLokasi();
}
const F = () => ({ kelas: document.getElementById('flt-kelas').value, tgl: document.getElementById('flt-tgl').value });
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULANS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtTgl = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? `${d} ${BULANS[m - 1] || ''} ${y}` : '—'; };
const fmtTglPanjang = iso => { const [y, m, d] = String(iso || '').split('-').map(Number); return y ? `${HARI[new Date(y, m - 1, d).getDay()]}, ${d} ${BULANS[m - 1] || ''} ${y}` : '—'; };
const fmtBulan = ym => { const [y, m] = String(ym || '').split('-').map(Number); return y ? `${BULANS[m - 1] || ''} ${y}` : '—'; };
let SEMESTER = 'Ganjil';

// Tanggal selalu ikut hari ini supaya tidak basi saat di-hosting (Railway).
function setTanggalHariIni() {
  const t = document.getElementById('flt-tgl');
  t.value = hariIni();
  document.getElementById('rekap-bulan').value = t.value.slice(0, 7);
  isiFooter();
  syncJudul();
}
// ---------- Identitas sekolah (tabel sekolah) ----------
let SEKOLAH = null;   // isi terakhir dari pengaturan_get
let DEMO = false;     // tampil/tidak kredensial demo di halaman login

function isiFooter() {
  const nama = SEKOLAH?.nama_sekolah || 'E-Absensi';
  const alm = SEKOLAH?.alamat_sekolah || '';
  document.getElementById('foot-sekolah').textContent =
    `© ${new Date().getFullYear()} ${nama}${alm ? ' — ' + alm : ''}`;
}
function isiKop() {
  const nama = SEKOLAH?.nama_sekolah || 'Sekolah';
  document.getElementById('kop-nama').textContent = nama;
  document.getElementById('kop-alm').textContent = SEKOLAH?.alamat_sekolah || '—';
  document.getElementById('kop-thn').textContent =
    `Tahun Ajaran ${SEKOLAH?.tahun_ajaran || '—'} • Semester ${SEMESTER}`;
  document.getElementById('ttd-tgl').textContent = fmtTgl(hariIni());
  document.getElementById('ttd-nama').textContent = titleCase(GURU?.nama_guru || '') || '…………………………';
}
// dijalankan saat halaman dibuka (termasuk sebelum login) — menarik nama/alamat/tahun/logo sekolah
async function muatIdentitas() {
  try {
    const r = await jget(API + '?action=pengaturan_get'); // aksi publik: tanpa token
    if (!r.ok) return;
    SEKOLAH = r.data || {};
    DEMO = r.demo !== false;
    SEMESTER = SEKOLAH.semester || SEMESTER;
    const nama = SEKOLAH.nama_sekolah || 'Sekolah';
    document.title = `E-Absensi ${nama}`;
    document.querySelector('.school-head b').textContent = String(nama).toUpperCase();
    document.querySelector('.school-head span').textContent =
      `Sistem Informasi Absensi Siswa • TP ${SEKOLAH.tahun_ajaran || '—'}`;
    document.querySelectorAll('.brand span').forEach(e => e.textContent = nama);
    isiFooter(); isiKop(); syncJudul();
    // logo sekolah (bila diisi di Pengaturan)
    const logo = (SEKOLAH.logo_sekolah || '').trim();
    if (logo) {
      document.querySelectorAll('.school-logo').forEach(e => { e.src = logo; e.onerror = () => { e.src = 'logo-192.png'; }; });
      const ic = document.querySelector('link[rel="icon"]'); if (ic) ic.href = logo;
    }
    // kredensial demo: hanya ditampilkan bila server mengizinkan (env DEMO_LOGIN)
    const nip = document.getElementById('in-nip'), pass = document.getElementById('in-pass');
    const help = document.querySelector('#login .help');
    if (DEMO) {
      nip.value = '19870512'; pass.value = 'admin123';
      help.innerHTML = 'Demo — NIP <b>19870512</b> / sandi <b>admin123</b>. Hubungi TU untuk akun baru.';
    } else {
      nip.value = ''; pass.value = '';
      help.textContent = 'Gunakan akun yang diberikan TU. Lupa sandi? Hubungi TU/Admin sekolah.';
    }
    document.getElementById('lupa-kontak').textContent =
      `${nama}${SEKOLAH.alamat_sekolah ? ', ' + SEKOLAH.alamat_sekolah : ''}`;
  } catch (e) { /* server belum terjangkau — tampilan tetap memakai teks bawaan */ }
}
function syncJudul() {
  const { tgl } = F();
  document.getElementById('sub-tgl').textContent = `${fmtTglPanjang(tgl)} • Semester ${SEMESTER}`;
}
function muatSemua() { syncJudul(); muatDashboard(); muatAbsensi(); muatSiswa(); muatRekap(); }

async function muatDashboard() {
  const { kelas, tgl } = F();
  try {
    const d = await jget(`${API}?action=dashboard&tanggal=${tgl}&kelas=${encodeURIComponent(kelas)}`);
    if (!d.ok) return;
    document.getElementById('st-total').textContent = d.total;
    document.getElementById('st-total-sub').textContent = `${d.terisi}/${d.total} sudah diisi`;
    document.getElementById('st-hadir').textContent = d.hadir;
    document.getElementById('st-hadir-sub').textContent = d.terisi ? Math.round(d.hadir / d.terisi * 100) + '% dari yang terisi' : 'belum ada data';
    document.getElementById('st-is').textContent = d.izin + d.sakit;
    document.getElementById('st-is-sub').textContent = `${d.izin} izin • ${d.sakit} sakit`;
    document.getElementById('st-alpa').textContent = d.alpa;
    const subAlpa = document.getElementById('st-alpa-sub');
    subAlpa.textContent = d.alpa > 0 ? 'Perlu tindak lanjut' : 'Tidak ada alpa';
    subAlpa.className = d.alpa > 0 ? 'down' : 'muted2';
    const wb = document.querySelector('#alert-absen b');
    if (d.terisi === 0) { wb.textContent = `Absensi ${fmtTgl(tgl)} belum diisi.`; }
    else { wb.textContent = `Absensi ${fmtTgl(tgl)} sudah terisi ${d.terisi} siswa.`; }
    document.querySelector('#alert-absen span').textContent = `Kelas ${kelas} • ${d.total} siswa`;
    // tabel absensi hari itu (kelas spesifik; kalau SEMUA tampilkan X-1)
    const kShow = kelas === 'SEMUA' ? 'X-1' : kelas;
    document.getElementById('dash-tabel-judul').textContent = `Absensi ${fmtTgl(tgl)} — ${kShow}`;
    const a = await jget(`${API}?action=absensi_get&tanggal=${tgl}&kelas=${encodeURIComponent(kShow)}`);
    document.getElementById('tb-dash').innerHTML = (a.data || []).slice(0, 6).map(r =>
      `<tr><td>${r.nis}</td><td>${titleCase(r.nama_siswa)}</td><td>${r.status ? pill(r.status) : '<span class="pill">Belum</span>'}</td><td>${esc(r.keterangan || '-')}</td></tr>`).join('')
      || '<tr><td colspan="4">Tidak ada siswa.</td></tr>';
    // mini rekap bulan berjalan
    const bl = tgl.slice(0, 7);
    const rk = await jget(`${API}?action=rekap&bulan=${bl}&kelas=${encodeURIComponent(kShow)}`);
    document.getElementById('tb-mini-rekap').innerHTML = (rk.data || []).slice(0, 5).map(r => {
      if (!Number(r.tot)) return `<tr class="row-empty"><td><b>${titleCase(r.nama_siswa)}</b></td><td class="muted2">–</td><td>${badge('Belum ada data')}</td></tr>`;
      return `<tr><td><b>${titleCase(r.nama_siswa)}</b></td><td>${r.pct}%</td><td>${badge(labelRekap(r))}</td></tr>`;
    }).join('') || '<tr><td colspan="3">Belum ada data.</td></tr>';
  } catch (e) {
    // server tidak terjangkau — jangan biarkan tampilan "Memuat…" selamanya
    document.querySelector('#alert-absen b').textContent = 'Gagal memuat data dari server.';
    document.querySelector('#alert-absen span').textContent = 'Periksa koneksi lalu muat ulang halaman.';
    document.getElementById('tb-dash').innerHTML = '<tr><td colspan="4" class="muted2">Gagal memuat.</td></tr>';
    document.getElementById('tb-mini-rekap').innerHTML = '<tr><td colspan="3" class="muted2">Gagal memuat.</td></tr>';
  }
}

// ---------- Lokasi & foto bukti kegiatan ----------
let LOKASI = null;         // {lat,lng,akurasi} terakhir
let LOKASI_DIMINTA = false; // supaya izin GPS hanya diminta sekali
function tampilkanLokasi(t, dariServer) {
  const el = document.getElementById('lokasi-info');
  if (!t) return;
  const akur = t.akurasi ? ` ±${Math.round(Number(t.akurasi))} m` : '';
  const maps = `https://www.google.com/maps?q=${t.lat},${t.lng}`;
  el.innerHTML = dariServer ? '📍 Terekam: ' : '📍 Lokasi saya: '
    + `<a href="${maps}" target="_blank" rel="noopener">${Number(t.lat).toFixed(5)}, ${Number(t.lng).toFixed(5)}</a>${akur}`;
}
function ambilLokasi() {
  const el = document.getElementById('lokasi-info');
  LOKASI_DIMINTA = true;
  if (!navigator.geolocation) { el.textContent = '📍 Perangkat tidak mendukung GPS'; return; }
  el.textContent = '📍 Mengambil lokasi…';
  navigator.geolocation.getCurrentPosition(
    p => {
      LOKASI = { lat: p.coords.latitude, lng: p.coords.longitude, akurasi: Math.round(p.coords.accuracy || 0) };
      tampilkanLokasi(LOKASI, false);
    },
    () => {
      LOKASI = null;
      el.textContent = '📍 Izin lokasi ditolak — klik "Ambil Lokasi" untuk mencoba lagi';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}
// ubah foto hasil kamera menjadi JPEG maksimum 1280px agar ringan disimpan
function ubahKeJpeg(file, sisi = 1280, kualitas = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const skala = Math.min(1, sisi / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * skala));
      c.height = Math.max(1, Math.round(img.height * skala));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Gagal mengubah gambar')), 'image/jpeg', kualitas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Berkas gambar tidak terbaca')); };
    img.src = url;
  });
}
async function kirimBukti(inp) {
  const f = inp.files && inp.files[0];
  if (!f) return;
  const m = document.getElementById('abs-msg');
  let { kelas, tgl } = F(); if (kelas === 'SEMUA') kelas = 'X-1';
  m.textContent = 'Mengirim foto bukti…';
  try {
    const blob = await ubahKeJpeg(f);
    const b64 = await new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => res(String(rd.result).split(',')[1]);
      rd.onerror = () => rej(new Error('Gagal membaca berkas'));
      rd.readAsDataURL(blob);
    });
    const r = await jpost(API + '?action=bukti_simpan', { kelas, tanggal: tgl, mime: 'image/jpeg', foto: b64 });
    if (!r.ok) { m.textContent = 'Foto gagal dikirim: ' + (r.msg || 'server'); return; }
    const th = document.getElementById('bukti-thumb');
    th.src = URL.createObjectURL(blob); th.classList.remove('hidden');
    document.getElementById('bukti-info').textContent = `Foto bukti tersimpan • ${fmtTgl(tgl)} • ${Math.round(blob.size / 1024)} KB`;
    m.textContent = 'Foto bukti kegiatan tersimpan.';
  } catch (e) { m.textContent = 'Foto gagal: ' + e.message; }
  inp.value = '';
}
async function muatBukti(kelas, tgl) {
  const info = document.getElementById('bukti-info');
  const th = document.getElementById('bukti-thumb');
  try {
    const r = await jget(`${API}?action=bukti_get&kelas=${encodeURIComponent(kelas)}&tanggal=${tgl}`);
    if (!r.ok) { info.textContent = 'Belum ada foto bukti'; th.classList.add('hidden'); return; }
    th.src = `data:${r.mime};base64,${r.foto}`; th.classList.remove('hidden');
    info.textContent = `Foto bukti ${fmtTgl(tgl)} • diambil ${String(r.diambil_pada || '').slice(11, 16) || '—'}`;
  } catch (e) { info.textContent = 'Belum ada foto bukti'; th.classList.add('hidden'); }
}

async function muatAbsensi() {
  let { kelas, tgl } = F();
  if (kelas === 'SEMUA') kelas = 'X-1'; // absensi input per kelas
  document.getElementById('abs-judul').textContent = `Absensi Kelas ${kelas}`;
  document.getElementById('abs-sub').textContent = `${fmtTgl(tgl)} • Jam ke-1`;
  try {
    const r = await jget(`${API}?action=absensi_get&tanggal=${tgl}&kelas=${encodeURIComponent(kelas)}`);
    ABSENSI = r.data || [];
    document.getElementById('tb-absensi').innerHTML = ABSENSI.map(barisAbsen).join('');
    // lokasi yang tercatat saat absensi hari itu disimpan (bila belum ada lokasi perangkat)
    if (r.lokasi && !LOKASI) tampilkanLokasi(r.lokasi, true);
    muatBukti(kelas, tgl);
  } catch (e) { document.getElementById('tb-absensi').innerHTML = '<tr><td colspan="5">Gagal memuat. Cek server.</td></tr>'; }
}
function setSt(id, st, el) {
  const r = ABSENSI.find(x => x.id == id); if (!r) return;
  r.status = st;
  const box = el.closest('.radio');
  box.querySelectorAll('label').forEach(l => l.removeAttribute('class'));
  el.closest('label').classList.add({ H: 'on-h', I: 'on-i', S: 'on-s', A: 'on-a' }[st]);
}
function setKet(id, v) { const r = ABSENSI.find(x => x.id == id); if (r) r.keterangan = v; }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function barisAbsen(s, i) {
  return `<tr><td>${i + 1}</td><td><b>${titleCase(s.nama_siswa)}</b></td><td>${s.nis}</td>
    <td><div class="radio">${['H', 'I', 'S', 'A'].map(st =>
      `<label class="${(s.status || 'H') === st ? 'on-' + st.toLowerCase() : ''}"><input type="radio" name="ab${s.id}" ${((s.status || 'H') === st) ? 'checked' : ''} onchange="setSt(${s.id},'${st}',this)"/> ${st}</label>`).join('')}</div></td>
    <td><input class="mini" value="${esc((s.keterangan || '') === '-' ? '' : s.keterangan)}" placeholder="-" oninput="setKet(${s.id},this.value)" /></td></tr>`;
}
function semuaHadir() {
  ABSENSI.forEach(s => s.status = 'H');
  document.getElementById('tb-absensi').innerHTML = ABSENSI.map(barisAbsen).join('');
}
async function hapusAbsensi() {
  let { kelas, tgl } = F(); if (kelas === 'SEMUA') kelas = 'X-1';
  if (!confirm(`Hapus seluruh absensi kelas ${kelas} tanggal ${tgl}?`)) return;
  const m = document.getElementById('abs-msg'); m.textContent = 'Menghapus…';
  try {
    const r = await jpost(API + '?action=absensi_hapus', { tanggal: tgl, kelas, id_guru: GURU.id });
    m.textContent = r.ok ? `Dihapus ${r.dihapus} baris.` : ('Gagal: ' + r.msg);
    muatAbsensi(); muatDashboard();
  } catch (e) { m.textContent = 'Gagal hubungi server.'; }
}
async function simpanAbsensi() {
  let { kelas, tgl } = F(); if (kelas === 'SEMUA') kelas = 'X-1';
  const m = document.getElementById('abs-msg'); m.textContent = 'Menyimpan…';
  const items = ABSENSI.map(s => ({ id_siswa: s.id, status: s.status || 'H', keterangan: s.keterangan || '-' }));
  try {
    const r = await jpost(API + '?action=absensi_save',
      { tanggal: tgl, kelas, id_guru: GURU.id, items, lokasi: LOKASI || undefined });
    m.textContent = r.ok
      ? `Tersimpan ${r.tersimpan} siswa ke tabel absensi${r.lokasi ? ' + lokasi GPS' : ''}.`
      : ('Gagal: ' + r.msg);
    muatDashboard();
  } catch (e) { m.textContent = 'Gagal hubungi server.'; }
}

async function muatSiswa() {
  const { kelas } = F(); const q = document.getElementById('siswa-q').value || '';
  try {
    const r = await jget(`${API}?action=siswa&kelas=${encodeURIComponent(kelas)}&q=${encodeURIComponent(q)}`);
    document.getElementById('siswa-sub').textContent = `${(r.data || []).length} siswa • Kelas ${kelas}`;
    document.getElementById('tb-siswa').innerHTML = (r.data || []).map((s, i) =>
      `<tr><td>${i + 1}</td><td><b>${titleCase(s.nama_siswa)}</b></td><td>${s.nis}</td><td>${s.jenis_kelamin}</td><td>${s.no_hp_ortu || '-'}</td><td>${s.nama_kelas}</td><td><button class="b-ghost" style="padding:6px 10px;font-size:12px" onclick="hapusSiswa(${s.id},'${esc(s.nama_siswa).replace(/'/g, '')}')">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="7">Tidak ada data.</td></tr>';
  } catch (e) {}
}

async function hapusSiswa(id, nama) {
  if (!confirm(`Hapus ${nama}? Riwayat absensinya ikut terhapus.`)) return;
  try {
    const r = await jpost(API + '?action=siswa_hapus', { id });
    if (!r.ok) { alert(r.msg || 'Gagal menghapus'); return; }
    muatSiswa(); muatDashboard();
  } catch (e) { alert('Gagal hubungi server.'); }
}

let REKAP = []; // isi tabel rekap terakhir (untuk filter pencarian)
async function muatRekap() {
  const { kelas, tgl } = F(); const bl = document.getElementById('rekap-bulan').value || tgl.slice(0, 7);
  try {
    const r = await jget(`${API}?action=rekap&bulan=${bl}&kelas=${encodeURIComponent(kelas)}`);
    REKAP = r.data || [];
    renderRekap();
  } catch (e) {
    document.getElementById('rekap-sub').textContent = 'Gagal memuat data dari server.';
    document.getElementById('tb-rekap').innerHTML = '<tr><td colspan="7" class="muted2">Gagal memuat.</td></tr>';
  }
}
function renderRekap() {
  const { kelas, tgl } = F();
  const bl = document.getElementById('rekap-bulan').value || tgl.slice(0, 7);
  const q = (document.getElementById('rekap-q').value || '').trim().toLowerCase();
  const data = REKAP.filter(x => !q
    || String(x.nama_siswa || '').toLowerCase().includes(q)
    || String(x.nis || '').includes(q));

  document.getElementById('rekap-sub').textContent =
    `${data.length} siswa • Periode ${fmtBulan(bl)} • Kelas ${kelas}` + (q ? ` • cari "${q}"` : '');

  document.getElementById('tb-rekap').innerHTML = data.map(x => {
    const nama = `<td><b>${titleCase(x.nama_siswa)}</b></td>`;
    if (!Number(x.tot)) {
      // baris tanpa data: dibuat redup + tombol langsung ke input absensi
      return `<tr class="row-empty">${nama}`
        + '<td class="muted2">–</td><td class="muted2">–</td><td class="muted2">–</td><td class="muted2">–</td><td class="muted2">–</td>'
        + `<td>${badge('Belum ada data')}<button class="link-aksi" data-noexport title="Buka halaman Absensi" onclick="pindah('absensi')">Isi absensi</button></td></tr>`;
    }
    return `<tr>${nama}<td>${x.H || 0}</td><td>${x.I || 0}</td><td>${x.S || 0}</td><td>${x.A || 0}</td>`
      + `<td>${x.pct}%</td><td>${badge(labelRekap(x))}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="muted2">${q ? 'Tidak ada nama yang cocok dengan pencarian.' : 'Belum ada data.'}</td></tr>`;
}

async function muatPengaturan() {
  try {
    const r = await jget(API + '?action=pengaturan_get');
    if (r.ok) {
      SEKOLAH = r.data || SEKOLAH; DEMO = r.demo !== false;
      document.getElementById('pg-sek').value = r.data.nama_sekolah;
      document.getElementById('pg-alm').value = r.data.alamat_sekolah;
      document.getElementById('pg-thn').value = r.data.tahun_ajaran;
      document.getElementById('pg-sem').value = r.data.semester || 'Ganjil';
      document.getElementById('pg-logo').value = r.data.logo_sekolah || '';
      SEMESTER = r.data.semester || SEMESTER;
      isiKop(); syncJudul();
    }
  } catch (e) {}
}
async function simpanPengaturan() {
  const m = document.getElementById('pg-msg');
  m.className = 'note';
  try {
    const r = await jpost(API + '?action=pengaturan_save', {
      nama_sekolah: document.getElementById('pg-sek').value, alamat_sekolah: document.getElementById('pg-alm').value,
      tahun_ajaran: document.getElementById('pg-thn').value, semester: document.getElementById('pg-sem').value,
      batas: '10:00:00', logo_sekolah: document.getElementById('pg-logo').value.trim()
    });
    if (!r.ok) { m.textContent = r.msg || 'Gagal menyimpan.'; m.className = 'note err'; return; }
    m.textContent = 'Tersimpan — nama, alamat, tahun ajaran & logo langsung dipakai di login, sidebar, footer, dan kop cetak.';
    await muatIdentitas(); // segarkan identitas di seluruh halaman
  } catch (e) { m.textContent = 'Gagal hubungi server.'; m.className = 'note err'; }
}

function exportExcel() {
  const { kelas, tgl } = F();
  const bulan = document.getElementById('rekap-bulan').value || tgl.slice(0, 7);
  const table = document.getElementById('tbl-rekap');

  // kumpulkan isi tabel apa adanya (baris judul, lalu header, lalu data)
  const rows = [[`Rekap Absensi ${fmtBulan(bulan)} — Kelas ${kelas}`], [], []];
  const bold = [0];
  table.querySelectorAll('tr').forEach(tr => {
    const isHead = !!tr.querySelector('th');
    const cells = [...tr.querySelectorAll('th, td')].map(td => {
      // buang elemen bertanda data-noexport (mis. tombol aksi) agar tidak ikut ke Excel
      const c = td.cloneNode(true);
      c.querySelectorAll('[data-noexport]').forEach(n => n.remove());
      return c.textContent.replace(/\s+/g, ' ').trim();
    });
    if (!cells.some(c => c !== '')) return;
    if (isHead) bold.push(rows.length);
    rows.push(cells);
  });

  // hasilnya .xlsx asli, jadi Excel membuka tanpa peringatan format/ekstensi
  const blob = XlsxMini.build(rows, { sheetName: 'Rekap', boldRows: bold });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rekap-${bulan}-kelas-${kelas.replace(/\s+/g, '')}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Manajemen Guru (khusus Admin/TU) ----------
let GURU_LIST = [];
function toggleFormGuru() { document.getElementById('form-guru').classList.toggle('hidden'); }
function resetFormGuru() {
  const f = document.getElementById('form-guru');
  f.classList.add('hidden'); f.dataset.id = '';
  ['gr-nip', 'gr-nama', 'gr-inis', 'gr-sandi'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('gr-sandi').placeholder = 'Sandi';
  document.getElementById('gr-peran').value = 'guru';
  document.getElementById('gr-msg').textContent = '';
}
async function muatGuru() {
  try {
    const r = await jget(API + '?action=guru_list');
    const tb = document.getElementById('tb-guru');
    if (!r.ok) { tb.innerHTML = `<tr><td colspan="6" class="muted2">${esc(r.msg || 'Gagal memuat.')}</td></tr>`; return; }
    GURU_LIST = r.data || [];
    document.getElementById('gr-sub').textContent =
      `${GURU_LIST.length} akun • ${GURU_LIST.filter(g => g.peran === 'admin').length} Admin/TU`;
    tb.innerHTML = GURU_LIST.map((g, i) =>
      `<tr><td>${i + 1}</td><td>${esc(g.nip_username)}</td><td><b>${titleCase(g.nama_guru)}</b></td><td>${esc(g.inisial || '—')}</td>`
      + `<td>${g.peran === 'admin' ? '<span class="badge b-h">Admin / TU</span>' : '<span class="badge">Guru</span>'}</td>`
      + `<td><button class="link-aksi" onclick="ubahGuru(${g.id})">Ubah</button>`
      + `<button class="link-aksi danger" onclick="hapusGuru(${g.id},'${esc(g.nama_guru).replace(/'/g, '')}')">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="6" class="muted2">Belum ada akun guru.</td></tr>';
  } catch (e) {}
}
function ubahGuru(id) {
  const g = GURU_LIST.find(x => x.id == id); if (!g) return;
  const f = document.getElementById('form-guru');
  f.classList.remove('hidden'); f.dataset.id = g.id;
  document.getElementById('gr-nip').value = g.nip_username;
  document.getElementById('gr-nama').value = titleCase(g.nama_guru);
  document.getElementById('gr-inis').value = g.inisial || '';
  document.getElementById('gr-sandi').value = '';
  document.getElementById('gr-sandi').placeholder = 'Sandi baru (kosong = tetap)';
  document.getElementById('gr-peran').value = g.peran === 'admin' ? 'admin' : 'guru';
  const m = document.getElementById('gr-msg'); m.className = 'sub2'; m.textContent = `Mengubah akun: ${titleCase(g.nama_guru)} (sandi hanya diganti bila diisi)`;
  document.getElementById('gr-nama').focus();
}
async function simpanGuru() {
  const m = document.getElementById('gr-msg'); m.className = 'sub2';
  const f = document.getElementById('form-guru');
  const payload = {
    id: f.dataset.id || null,
    nip: document.getElementById('gr-nip').value.trim(),
    nama: document.getElementById('gr-nama').value.trim(),
    inisial: document.getElementById('gr-inis').value.trim(),
    sandi: document.getElementById('gr-sandi').value,
    peran: document.getElementById('gr-peran').value
  };
  if (!payload.nip || !payload.nama) { m.textContent = 'NIP dan nama wajib diisi.'; m.className = 'sub2 err'; return; }
  if (!payload.id && payload.sandi.length < 6) { m.textContent = 'Sandi awal minimal 6 karakter.'; m.className = 'sub2 err'; return; }
  m.textContent = 'Menyimpan…';
  try {
    const r = await jpost(API + '?action=guru_simpan', payload);
    if (!r.ok) { m.textContent = r.msg || 'Gagal menyimpan.'; m.className = 'sub2 err'; return; }
    resetFormGuru(); muatGuru();
    document.getElementById('gr-msg').textContent = 'Tersimpan.';
  } catch (e) { m.textContent = 'Gagal hubungi server.'; m.className = 'sub2 err'; }
}
async function hapusGuru(id, nama) {
  if (!confirm(`Hapus akun ${nama}?\n\nRiwayat absensi yang ia catat akan dialihkan ke akun Anda (tidak ikut terhapus).`)) return;
  try {
    const r = await jpost(API + '?action=guru_hapus', { id });
    if (!r.ok) { alert(r.msg || 'Gagal menghapus'); return; }
    muatGuru();
  } catch (e) { alert('Gagal hubungi server.'); }
}

setTanggalHariIni();
muatIdentitas(); // ambil identitas sekolah + izin demo (tanpa token)
if (GURU && !TOKEN) { sessionStorage.removeItem('guru'); GURU = null; } // sesi lama sebelum ada token → login ulang
if (GURU) enterApp();
['in-nip', 'in-pass'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') masuk(); }));

function toggleFormSiswa() { document.getElementById('form-siswa').classList.toggle('hidden'); }
async function tambahSiswa() {
  const m = document.getElementById('ns-msg'); m.textContent = 'Menyimpan…';
  const { kelas } = F();
  const payload = {
    nama: titleCase(document.getElementById('ns-nama').value.trim()),
    nis: document.getElementById('ns-nis').value.trim(),
    jk: document.getElementById('ns-jk').value,
    hp: document.getElementById('ns-hp').value.trim(),
    kelas: kelas === 'SEMUA' ? 'X-1' : kelas
  };
  try {
    const r = await jpost(API + '?action=siswa_save', payload);
    if (!r.ok) { m.textContent = r.msg || 'Gagal menyimpan'; return; }
    m.textContent = 'Siswa tersimpan.';
    document.getElementById('ns-nama').value = ''; document.getElementById('ns-nis').value = ''; document.getElementById('ns-hp').value = '';
    muatSiswa(); muatDashboard();
  } catch (e) { m.textContent = 'Gagal hubungi server.'; }
}

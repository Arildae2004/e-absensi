// Frontend terhubung ke backend PHP + MySQL (api.php).
const API = 'api.php';
let GURU = JSON.parse(sessionStorage.getItem('guru') || 'null');
let ABSENSI = []; // baris absensi aktif

async function jget(url) { const r = await fetch(url); return r.json(); }
async function jpost(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return r.json();
}
const pill = s => ({ H: '<span class="pill h">Hadir</span>', I: '<span class="pill i">Izin</span>', S: '<span class="pill s">Sakit</span>', A: '<span class="pill a">Alpa</span>' }[s] || '<span class="pill">-</span>');
const nmStatus = s => ({ H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' }[s] || '-');

async function masuk() {
  const u = document.getElementById('in-nip').value.trim();
  const p = document.getElementById('in-pass').value;
  const msg = document.getElementById('login-msg');
  msg.classList.add('hidden');
  try {
    const r = await jpost(API + '?action=login', { username: u, password: p });
    if (!r.ok) { msg.textContent = r.msg || 'Login gagal'; msg.classList.remove('hidden'); return; }
    GURU = r.guru; sessionStorage.setItem('guru', JSON.stringify(GURU));
    enterApp();
  } catch (e) {
    msg.textContent = 'Tidak bisa hubungi server. Pastikan php -S localhost:8001 jalan & MySQL Start.';
    msg.classList.remove('hidden');
  }
}
function keluar() { sessionStorage.removeItem('guru'); location.reload(); }

function enterApp() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('u-nama').textContent = GURU.nama_guru;
  document.getElementById('u-ava').textContent = (GURU.inisial || GURU.nama_guru.slice(0, 2)).toUpperCase();
  muatSemua(); muatPengaturan();
}
function pindah(nama) {
  document.querySelectorAll('.sidebar nav button').forEach(b => b.classList.toggle('active', b.dataset.p === nama));
  document.querySelectorAll('.pg').forEach(p => p.classList.add('hidden'));
  document.getElementById('pg-' + nama).classList.remove('hidden');
  document.getElementById('judul').textContent = { dashboard: 'Dashboard', absensi: 'Absensi', siswa: 'Data Siswa', rekap: 'Rekap', pengaturan: 'Pengaturan' }[nama] || nama;
}
const F = () => ({ kelas: document.getElementById('flt-kelas').value, tgl: document.getElementById('flt-tgl').value });
function muatSemua() { muatDashboard(); muatAbsensi(); muatSiswa(); muatRekap(); }

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
    const wb = document.querySelector('#alert-absen b');
    if (d.terisi === 0) { wb.textContent = `Absensi ${tgl} belum diisi.`; }
    else { wb.textContent = `Absensi ${tgl} sudah terisi ${d.terisi} siswa.`; }
    document.querySelector('#alert-absen span').textContent = `Kelas ${kelas} • ${d.total} siswa`;
    // tabel absensi hari itu (kelas spesifik; kalau SEMUA tampilkan X-1)
    const kShow = kelas === 'SEMUA' ? 'X-1' : kelas;
    document.getElementById('dash-tabel-judul').textContent = `Absensi ${tgl} — ${kShow}`;
    const a = await jget(`${API}?action=absensi_get&tanggal=${tgl}&kelas=${encodeURIComponent(kShow)}`);
    document.getElementById('tb-dash').innerHTML = (a.data || []).slice(0, 6).map(r =>
      `<tr><td>${r.nis}</td><td>${r.nama_siswa}</td><td>${r.status ? pill(r.status) : '<span class="pill">Belum</span>'}</td><td>${r.keterangan || '-'}</td></tr>`).join('')
      || '<tr><td colspan="4">Tidak ada siswa.</td></tr>';
    // mini rekap bulan berjalan
    const bl = tgl.slice(0, 7);
    const rk = await jget(`${API}?action=rekap&bulan=${bl}&kelas=${encodeURIComponent(kShow)}`);
    document.getElementById('tb-mini-rekap').innerHTML = (rk.data || []).slice(0, 5).map(r =>
      `<tr><td><b>${r.nama_siswa}</b></td><td>${r.pct}%</td><td>${pill(r.A > 0 && r.pct < 75 ? 'A' : r.tot == 0 ? '' : 'H')} ${r.status}</td></tr>`).join('')
      || '<tr><td colspan="3">Belum ada data.</td></tr>';
  } catch (e) { /* server belum siap */ }
}

async function muatAbsensi() {
  let { kelas, tgl } = F();
  if (kelas === 'SEMUA') kelas = 'X-1'; // absensi input per kelas
  document.getElementById('abs-judul').textContent = `Absensi Kelas ${kelas}`;
  document.getElementById('abs-sub').textContent = `${tgl} • Jam ke-1`;
  try {
    const r = await jget(`${API}?action=absensi_get&tanggal=${tgl}&kelas=${encodeURIComponent(kelas)}`);
    ABSENSI = r.data || [];
    document.getElementById('tb-absensi').innerHTML = ABSENSI.map(barisAbsen).join('');
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
  return `<tr><td>${i + 1}</td><td><b>${s.nama_siswa}</b></td><td>${s.nis}</td>
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
    const r = await jpost(API + '?action=absensi_save', { tanggal: tgl, kelas, id_guru: GURU.id, items });
    m.textContent = r.ok ? `Tersimpan ${r.tersimpan} siswa ke tabel absensi.` : ('Gagal: ' + r.msg);
    muatDashboard();
  } catch (e) { m.textContent = 'Gagal hubungi server.'; }
}

async function muatSiswa() {
  const { kelas } = F(); const q = document.getElementById('siswa-q').value || '';
  try {
    const r = await jget(`${API}?action=siswa&kelas=${encodeURIComponent(kelas)}&q=${encodeURIComponent(q)}`);
    document.getElementById('siswa-sub').textContent = `${(r.data || []).length} siswa • Kelas ${kelas}`;
    document.getElementById('tb-siswa').innerHTML = (r.data || []).map((s, i) =>
      `<tr><td>${i + 1}</td><td><b>${s.nama_siswa}</b></td><td>${s.nis}</td><td>${s.jenis_kelamin}</td><td>${s.no_hp_ortu || '-'}</td><td>${s.nama_kelas}</td><td><button class="b-ghost" style="padding:6px 10px;font-size:12px" onclick="hapusSiswa(${s.id},'${s.nama_siswa.replace(/'/g, '')}')">Hapus</button></td></tr>`).join('')
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

async function muatRekap() {
  const { kelas, tgl } = F(); const bl = document.getElementById('rekap-bulan').value || tgl.slice(0, 7);
  try {
    const r = await jget(`${API}?action=rekap&bulan=${bl}&kelas=${encodeURIComponent(kelas)}`);
    document.getElementById('rekap-sub').textContent = `${(r.data || []).length} siswa • Periode ${bl} • Kelas ${kelas}`;
    document.getElementById('tb-rekap').innerHTML = (r.data || []).map(x =>
      `<tr><td><b>${x.nama_siswa}</b></td><td>${x.H || 0}</td><td>${x.I || 0}</td><td>${x.S || 0}</td><td>${x.A || 0}</td><td>${x.pct}%</td><td>${nmStatus(x.A > 0 && x.pct < 75 ? 'A' : x.tot == 0 ? '' : 'H')} ${x.status}</td></tr>`).join('')
      || '<tr><td colspan="7">Belum ada data.</td></tr>';
  } catch (e) {}
}

async function muatPengaturan() {
  try {
    const r = await jget(API + '?action=pengaturan_get');
    if (r.ok) { document.getElementById('pg-sek').value = r.data.nama_sekolah; document.getElementById('pg-alm').value = r.data.alamat_sekolah; document.getElementById('pg-thn').value = r.data.tahun_ajaran; }
  } catch (e) {}
}
async function simpanPengaturan() {
  const m = document.getElementById('pg-msg');
  const r = await jpost(API + '?action=pengaturan_save', {
    nama_sekolah: document.getElementById('pg-sek').value, alamat_sekolah: document.getElementById('pg-alm').value,
    tahun_ajaran: document.getElementById('pg-thn').value, semester: 'Ganjil', batas: '10:00:00'
  });
  m.textContent = r.ok ? 'Pengaturan tersimpan ke tabel sekolah.' : 'Gagal menyimpan.';
}

function exportExcel() {
  const { kelas, tgl } = F();
  const bulan = document.getElementById('rekap-bulan').value || tgl.slice(0, 7);
  const table = document.getElementById('tbl-rekap').outerHTML;
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">'
    + '<head><meta charset="UTF-8"></head><body>'
    + `<h3>Rekap Absensi ${bulan} — Kelas ${kelas}</h3>` + table + '</body></html>';
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rekap-${bulan}-kelas-${kelas.replace(/\s+/g, '')}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

if (GURU) enterApp();
['in-nip', 'in-pass'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') masuk(); }));

function toggleFormSiswa() { document.getElementById('form-siswa').classList.toggle('hidden'); }
async function tambahSiswa() {
  const m = document.getElementById('ns-msg'); m.textContent = 'Menyimpan…';
  const { kelas } = F();
  const payload = {
    nama: document.getElementById('ns-nama').value.trim(),
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

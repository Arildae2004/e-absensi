# Panduan Website E-Absensi — SMAN 1 Jakarta

Sistem Informasi Absensi Siswa untuk guru / wali kelas.
Stack: **HTML + CSS + JS (frontend)** → **PHP (api.php)** → **MySQL/MariaDB `db_eabsensi`**.

---

## 1. Cara Menjalankan

### Syarat
- PHP 8+ (`php --version`)
- MySQL/MariaDB jalan (Laragon: tekan **Start**, atau `mysqld.exe` sudah berjalan di port 3306)

### Langkah pertama (sekali saja)
```bash
# 1. Buat database + tabel + data contoh
php absensi-siswa/setup_db.php

# 2. Jalankan server (satu perintah ini menyajikan frontend + API)
php -S localhost:8001 -t absensi-siswa
```

### Buka website
- **http://localhost:8001** ← alamat utama (frontend + API)
- Akun demo: NIP **`19870512`** / sandi **`admin123`** (nama: Ratna Wijaya)

> Catatan: server lama `localhost:8000` (python) hanya file statis tanpa API — pakai port **8001**.

### File proyek
| File | Fungsi |
|---|---|
| `index.html` | Semua tampilan (login, sidebar, 5 halaman) |
| `style.css` | Desain bersih ala admin sekolah (putih + navy `#173a5e`) |
| `app.js` | Menghubungkan tampilan ke API via `fetch()` |
| `api.php` | 10 endpoint JSON (login, dashboard, siswa, absensi, rekap, pengaturan, kelas) |
| `koneksi.php` | Koneksi MySQL (host `127.0.0.1`, user `root`, tanpa password) |
| `setup_db.php` | Membuat DB + tabel + seed data contoh |
| `database.sql` | Skema SQL referensi (struktur tabel) |

---

## 2. Cara Penggunaan (Alur Guru)

### a. Login
1. Buka `http://localhost:8001`.
2. Isi **NIP / Username** dan **Kata Sandi**, klik **Masuk**.
3. Sistem memanggil `api.php?action=login` → mencocokkan `nip_username` di tabel `guru` dan verifikasi `password` (hash). Gagal → pesan merah; berhasil → masuk dashboard, data guru disimpan di `sessionStorage`.

### b. Dashboard (halaman utama)
- **Filter atas**: pilih Kelas (`X-1 / XI IPA 1 / XII IPS 1 / SEMUA`) + Tanggal → semua angka & tabel ikut berubah.
- **Kotak peringatan kuning**: status absensi tanggal itu — "belum diisi" atau "sudah terisi N siswa", tombol **Isi Sekarang** lompat ke halaman Absensi.
- **4 kartu angka** (dari `action=dashboard`):
  - Total Siswa (beserta "N/M sudah diisi"),
  - Hadir Hari Ini, Izin/Sakit (rincian "x izin • y sakit"), Alpa.
- **Tabel kiri**: 6 baris absensi hari itu (NIS, nama, pil status, keterangan).
- **Tabel kanan**: 5 baris rekap bulan berjalan (nama, %, status).

### c. Absensi (input harian)
1. Pastikan filter Kelas (spesifik, bukan SEMUA) dan Tanggal benar — judul menyesuaikan, mis. "Absensi Kelas X-1 • 2026-09-25 • Jam ke-1".
2. Tiap baris siswa: pilih radio **H / I / S / A** (warna hijau/kuning/oranye/merah) + isi **Keterangan** bila perlu (mis. "Surat dokter").
3. **Semua Hadir** = tandai H sekaligus. **Simpan Absensi** = kirim ke `action=absensi_save` → tersimpan ke tabel `absensi` (`INSERT ... ON DUPLICATE KEY UPDATE`, jadi simpan ulang di tanggal sama hanya menimpa, tidak dobel).
4. Pesan hijau "Tersimpan N siswa" = sukses; dashboard otomatis refresh.

### d. Data Siswa
- Menampilkan daftar sesuai filter kelas + kotak **Cari nama** (filter NIS/nama via `action=siswa&q=`).
- Kolom: No, Nama, NIS, L/P, No. HP Ortu, Kelas.
- Data berasal dari `JOIN siswa + kelas`.

### e. Rekap (laporan bulanan)
1. Pilih bulan (`input type=month`) + filter kelas.
2. Tabel agregat dari `action=rekap`: per siswa kolom **H, I, S, A, % (hadir/total), Status** (Baik ≥90%, Pantau 75–89%, Bermasalah <75%).
3. Tombol **Cetak** memakai print browser.

### f. Pengaturan
- Form Nama Sekolah, Alamat, Tahun Ajaran — dibaca dari (`pengaturan_get`) dan disimpan ke (`pengaturan_save`) tabel `sekolah` baris `id=1`.

---

## 3. Fungsi Tiap Fitur (Ringkas)

| Fitur | Tombol / Aksi | API | Tabel DB |
|---|---|---|---|
| Login | Masuk | `login` | `guru` (baca + verifikasi hash) |
| Statistik dashboard | Ganti filter | `dashboard` | `siswa` (hitung) + `absensi` (grup by status) |
| Lihat absensi harian | Buka Absensi | `absensi_get` | `siswa LEFT JOIN absensi` per tanggal & kelas |
| Tandai Semua Hadir | Semua Hadir | — (lokal di browser) | — |
| Simpan absensi | Simpan Absensi | `absensi_save` | `absensi` (upsert) |
| Cari siswa | Ketik di Cari | `siswa` | `siswa` (LIKE nama/NIS) |
| Rekap bulan | Ganti bulan/kelas | `rekap` | `absensi` (SUM per status) |
| Pengaturan sekolah | Simpan | `pengaturan_get/save` | `sekolah` |
| Data kelas | Filter dropdown | `kelas` | `kelas + COUNT(siswa)` |

---

## 4. Database `db_eabsensi`

### Diagram relasi (teks)
```
sekolah (1) ── info umum, 1 baris (id=1)

guru (1) ───< kelas (N)  via kelas.id_wali_kelas
guru (1) ───< absensi (N) via absensi.id_guru  (siapa menginput)

kelas (1) ───< siswa (N)   via siswa.id_kelas
kelas (1) ───< absensi (N) via absensi.id_kelas

siswa (1) ───< absensi (N) via absensi.id_siswa
siswa (1) ───< pemanggilan_siswa (N)
```

### Tabel-tabel
**`sekolah`** — profil, 1 baris: `nama_sekolah, alamat_sekolah, tahun_ajaran, semester (Ganjil/Genap), batas_waktu_absensi (TIME, default 10:00:00)`.

**`guru`** — akun login: `nip_username (UNIQUE), nama_guru, password (hash bcrypt), inisial`. Seed: `19870512 / admin123 / Ratna Wijaya / RW`.

**`kelas`** — `nama_kelas (UNIQUE: X-1, XI IPA 1, XII IPS 1), id_wali_kelas → guru`.

**`siswa`** — `nis (UNIQUE), nama_siswa, jenis_kelamin (L/P), no_hp_ortu, id_kelas → kelas`. Seed: 8 nama × 3 kelas = 24 siswa (NIS 2024001 dst).

**`absensi`** — inti: `id_siswa → siswa, id_kelas → kelas, id_guru → guru, tanggal (DATE), jam_ke (default 1), status (H/I/S/A), keterangan`. Kunci `UNIQUE(id_siswa, tanggal, jam_ke)` mencegah input ganda.

**`pemanggilan_siswa`** — tindak lanjut alpa: `id_siswa, id_kelas, jumlah_alpa, status (Pending/Diproses/Selesai)`. (Tabel siap; UI tombol "Panggil" tahap berikutnya.)

---

## 5. Tampilan (Deskripsi Visual)

- **Login**: kartu putih 400px di atas latar abu; kop logo + "SMAN 1 JAKARTA"; field NIP & sandi; tombol navy; catatan akun demo.
- **Kerangka app**: sidebar putih 232px (logo S1, grup MENU UTAMA: Dashboard/Absensi/Data Siswa/Rekap, grup LAINNYA: Pengaturan/Keluar, kartu user RW di bawah) + area konten abu muda, topbar (judul + sub tanggal, filter kelas & tanggal kanan).
- **Dashboard**: alert kuning + 4 kartu statistik + 2 panel tabel (kiri: absensi hari itu; kanan: rekap mini).
- **Absensi**: satu panel tabel besar; kolom Kehadiran berupa radio tersegmentasi berwarna; kolom Keterangan input mini.
- **Data Siswa / Rekap / Pengaturan**: panel tabel/form standar; pil status berwarna (Hadir hijau, Izin kuning, Sakit oranye, Alpa/Bermasalah merah).

---

## 6. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| "Koneksi DB gagal" / tabel kosong | MySQL belum Start → Start via Laragon; lalu `php absensi-siswa/setup_db.php` |
| "Tidak bisa hubungi server" saat login | Server PHP mati → jalankan `php -S localhost:8001 -t absensi-siswa` dan buka port 8001 (bukan 8000) |
| "NIP / sandi salah" | Gunakan `19870512` / `admin123` (seed). Cek `SELECT nip_username FROM guru;` |
| Absensi tidak tersimpan | Pastikan login dulu (butuh `id_guru`) dan pilih kelas spesifik |
| Port 8001 dipakai | Ganti mis. `php -S localhost:8002 -t absensi-siswa`, tapi `app.js` tetap `api.php` relatif jadi ikut benar |

---

## 7. Alur Data (Contoh Nyata)
Guru Ratna (id=1) mengabsen X-1 (id=1) tanggal 2026-09-25: Budi (id=3) Hadir, Siti (id=2) Izin "Acara keluarga" → `POST action=absensi_save` → 2 baris di `absensi` → Dashboard tanggal itu menampilkan Hadir=1, Izin=1 → Rekap bulan `2026-09` menambah H+1 untuk Budi, I+1 untuk Siti.

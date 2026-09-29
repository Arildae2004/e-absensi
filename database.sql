-- Buat database baru
CREATE DATABASE IF NOT EXISTS db_eabsensi 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE db_eabsensi;

-- 1. TABEL PENGATURAN SEKOLAH
CREATE TABLE IF NOT EXISTS sekolah (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nama_sekolah VARCHAR(100) NOT NULL DEFAULT 'SMAN 1 Jakarta',
    alamat_sekolah VARCHAR(255) DEFAULT 'Jl. Merdeka No. 10',
    tahun_ajaran VARCHAR(20) NOT NULL DEFAULT '2025/2026',
    semester ENUM('Ganjil', 'Genap') NOT NULL DEFAULT 'Ganjil',
    batas_waktu_absensi TIME NOT NULL DEFAULT '10:00:00',
    logo_sekolah VARCHAR(255) NOT NULL DEFAULT '', -- URL logo (kosong = logo bawaan)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. TABEL GURU / PENGGUNA (LOGIN)
CREATE TABLE IF NOT EXISTS guru (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nip_username VARCHAR(30) UNIQUE NOT NULL,
    nama_guru VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    inisial VARCHAR(10),
    peran ENUM('guru', 'admin') NOT NULL DEFAULT 'guru', -- admin = Admin/TU (buka Pengaturan & Manajemen Guru)
    token VARCHAR(64) DEFAULT NULL,      -- token sesi login (berlaku 30 hari)
    token_exp DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL KELAS
CREATE TABLE IF NOT EXISTS kelas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nama_kelas VARCHAR(20) NOT NULL UNIQUE, -- Contoh: 'X-1', 'XI IPA 1', 'XII IPS 1'
    id_wali_kelas INT NULL,
    FOREIGN KEY (id_wali_kelas) REFERENCES guru(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. TABEL SISWA
CREATE TABLE IF NOT EXISTS siswa (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nis VARCHAR(20) UNIQUE NOT NULL,
    nama_siswa VARCHAR(100) NOT NULL,
    jenis_kelamin ENUM('L', 'P') NOT NULL,
    no_hp_ortu VARCHAR(20),
    id_kelas INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. TABEL ABSENSI (PRESENSI HARIAN)
CREATE TABLE IF NOT EXISTS absensi (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_siswa INT NOT NULL,
    id_kelas INT NOT NULL,
    id_guru INT NOT NULL, -- Guru / Wali kelas yang menginput absensi
    tanggal DATE NOT NULL,
    jam_ke INT DEFAULT 1,
    status ENUM('H', 'I', 'S', 'A') NOT NULL, -- H: Hadir, I: Izin, S: Sakit, A: Alpa
    keterangan VARCHAR(255) DEFAULT '-',
    lokasi_lat DECIMAL(10,7) DEFAULT NULL,   -- GPS guru saat mengisi absensi
    lokasi_lng DECIMAL(10,7) DEFAULT NULL,
    lokasi_akurasi DECIMAL(10,1) DEFAULT NULL, -- akurasi GPS dalam meter
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_siswa) REFERENCES siswa(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_guru) REFERENCES guru(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT unique_absensi_siswa UNIQUE (id_siswa, tanggal, jam_ke)
);

-- 6. TABEL PEMANGGILAN SISWA (FITUR SISWA BERMASALAH / ALPA)
CREATE TABLE IF NOT EXISTS pemanggilan_siswa (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_siswa INT NOT NULL,
    id_kelas INT NOT NULL,
    jumlah_alpa INT DEFAULT 0,
    status ENUM('Pending', 'Diproses', 'Selesai') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_siswa) REFERENCES siswa(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. TABEL FOTO BUKTI KEGIATAN (1 per kelas per tanggal)
CREATE TABLE IF NOT EXISTS bukti_absensi (
    id_kelas INT NOT NULL,
    tanggal DATE NOT NULL,
    id_guru INT NULL,
    mime VARCHAR(50) DEFAULT 'image/jpeg',
    foto LONGBLOB NOT NULL,               -- JPEG hasil kompresi (maks 3 MB)
    diambil_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_kelas, tanggal),
    FOREIGN KEY (id_kelas) REFERENCES kelas(id) ON DELETE CASCADE,
    FOREIGN KEY (id_guru) REFERENCES guru(id) ON DELETE SET NULL
);
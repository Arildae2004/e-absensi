/* Service worker E-Absensi (PWA offline).
   - Berkas aplikasi (HTML/CSS/JS/gambar) disimpan di cache: aplikasi tetap terbuka saat sinyal lemah.
   - Data absensi (api.php) SELALU diambil dari jaringan — tidak pernah disimpan di cache,
     supaya rekap tidak pernah menampilkan data basi.
   - Setiap aset tetap diperbarui diam-diam di belakang (stale-while-revalidate). */
const CACHE = 'eabsensi-v1';
const SHELL = ['./', './index.html', './style.css?v=4', './app.js?v=5', './xlsx-mini.js?v=1',
  './manifest.json', './favicon.svg', './logo-192.png', './logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))) // satu berkas gagal bukan akhir dunia
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // font/pihak ketiga: biarkan browser

  // API: jaringan dulu; offline balas JSON ramah, bukan halaman error
  if (url.pathname.endsWith('.php')) {
    e.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ ok: false, msg: 'Tidak ada koneksi internet. Data belum bisa dimuat.' }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }))
    );
    return;
  }

  // aset statis: sajikan dari cache bila ada, lalu perbarui di belakang
  e.respondWith(
    caches.match(req).then(cached => {
      const segar = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
      if (cached) return cached;
      // navigasi (buka aplikasi) saat offline → halaman utama dari cache
      if (req.mode === 'navigate') return caches.match('./index.html').then(r => r || segar);
      return segar;
    })
  );
});

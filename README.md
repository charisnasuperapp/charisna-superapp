# CHARISNA SuperApp — Fokus Perhatian

Prototipe lokal v2.2. Seluruh data sintetis. Bukan aplikasi produksi dan bukan kontrol akses owner yang sudah siap dipakai.

## Jalankan

Node.js >=22, tanpa dependency npm atau instalasi paket:

```bash
cd C:/Users/ZENNITH/Documents/GitHub/charisna-superapp
npm start
```

Buka **http://127.0.0.1:4173**. Server hanya mendengarkan loopback dan menolak Host selain `127.0.0.1`. Hentikan dengan Ctrl+C. Jika port terpakai: `PORT=4174 npm start` (Git Bash), lalu buka port tersebut. Jangan membuka melalui hostname `localhost`, LAN, tunnel atau hosting publik.

```bash
npm test        # assertion Node: projection, HTTP, presentation
npm run check  # syntax dan pemeriksaan bundle publik
npm run lab    # lab rekonsiliasi terpisah, tidak mengubah dashboard
```

Pemeriksaan browser opsional menggunakan Python yang sudah memiliki Playwright dan Microsoft Edge. Jalankan `scripts/browser_smoke.py` melalui interpreter tersebut saat server hidup; port test tetap 4173. Tidak memerlukan unduhan browser baru. Runtime aplikasi tidak memakai Python.

## Batas yang disengaja

- Beranda pemilik, rincian POS, rincian Kost, saldo pribadi tertutup saat dibuka.
- Nilai dihitung dari fixture baris sumber melalui mesin demo, pembanding bukan sumber nominal proyeksi.
- Simulator hanya CLI `lab/`. Tidak ada impor, tambah usaha, perbaikan struk, consent atau diagnostik teknis di navigasi pemilik.
- Frontend hanya membaca `/demo/overview.json`; saldo contoh diminta terpisah saat tombol ditekan. HTTP GET saja; cache no-store.
- Data demo tidak disimpan ke localStorage, database atau cloud. Tidak ada koneksi Firebase/Supabase/SDK produksi.
- **Tidak ada autentikasi atau otorisasi produksi.** Semua endpoint hanya untuk data sintetis lokal. Saldo tersembunyi bukan keamanan. Jangan mengganti fixture dengan data nyata. Uji 401/403 owner, ingest nyata, durability database dan pemulihan belum dilakukan.
- Teaching Pay Audit hanya inventaris. Kartu belum tersambung adalah **Usaha contoh**, bukan keputusan daftar usaha owner.

## Struktur

- `public/`: HTML, CSS dan JS tampilan owner.
- `server.mjs`: server HTTP loopback dengan allowlist aset.
- `demo/`: fixture dan proyeksi sintetis, tidak untuk ingest produksi.
- `lab/`: simulasi rekonsiliasi terpisah.
- `tests/`: test Node tanpa dependency.
- `scripts/`: syntax check dan browser smoke.
- `docs/`: keputusan dan kontrak demo.
- `artifacts/`: screenshot dan hasil pemeriksaan lokal.

Sumber keputusan, inventaris, hasil eksekusi dan pekerjaan berikutnya ada di `PROJECT_STATUS.md`. Tidak ada deploy, SQL atau billing pada tahap ini.

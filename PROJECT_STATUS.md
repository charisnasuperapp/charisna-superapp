# CHARISNA SuperApp — Project Status

## Tahap dan workspace

- Tahap: prototipe lokal **Fokus Perhatian v2.2**, data sintetis; validasi selesai dan kode sudah di-push ke repo private. Commit implementasi `4b79d57c1a95a3725735dd85225d6c6c4f5ff9c6` diverifikasi identik melalui Git lokal dan GitHub API.
- Workspace: `C:/Users/ZENNITH/Documents/GitHub/charisna-superapp`.
- Remote: `https://github.com/charisnasuperapp/charisna-superapp` (private). Commit awal remote `2387834` diperiksa; fetch Git berhasil dengan credential helper per perintah, tanpa perubahan konfigurasi global.
- Awalnya tidak ada aplikasi/checkout SuperApp lokal di path ini. Remote hanya README. Dibuat aplikasi minimal Node stdlib + HTML/CSS/JS tanpa dependency npm. Git lokal diinisialisasi di workspace baru; tidak memodifikasi checkout sumber.
- Owner kemudian mengizinkan push kode ke repo private setelah tes. Ini bukan izin mengaktifkan layanan berbayar atau menghubungkan data nyata.

## Sumber yang diperiksa read-only

1. `I:/My Drive/Charisna SuperApp/GPT/CHARISNA_SuperApp_Handoff_Hermes_v2.2.md`: acuan keputusan/kontrak UI, fixture dan tujuh skenario acceptance lokal.
2. `C:/Users/ZENNITH/Documents/CHARISNA_SuperApp_Hermes_Review/CHARISNA_SuperApp_Blueprint_v2.1_Handoff_Reference.md`: konteks arsitektur, keputusan owner, isolasi aplikasi, personal terpisah, read-only, biaya dan privasi. Usulan arsitektur tidak dianggap implementasi. Paket implementasi historis tidak dijalankan/disalin.
3. Homestay lokal `Documents/GitHub/charisna-homestay`: HEAD `964ddb436b99d688a295e3cadb0608d5f822311b`, package 1.0.3, status Git bersih saat diperiksa. README: localStorage per browser, unggah/unduh cloud snapshot manual; bukan jaminan cloud terkini.
4. Money Management lokal `Documents/GitHub/charisna-money-management`: HEAD `7d78ed24c25bdc0545b430cdc98dffa5d864246e`, package 14.1.1, status Git bersih. README-V14.1: runtime www/web/windows, transfer bukan omzet/pengeluaran operasional; dependency Supabase ditemukan dalam package.
5. POS lokal `Documents/GitHub/Bumi-Makmur-POS-Ultimate`: HEAD `162ef2b0f553429c8e3d7727f64f37a4a31d4529`, package 6.5.1, status Git bersih. docs/FIRESTORE-DATA-MODEL.md: stores/{storeId}, sales, purchases, stockMovements, auditLogs dan antrean lokal. Dokumentasi bukan tes transaksi cloud.
6. Piola_Salary lokal: HEAD `4ca90e5b7521cef055073c760285b17b39d2c299`, package 1.8.0, bersih. Teaching Pay Audit remote: HEAD `06b0b390e53c501c4d137bd8625f3cc5013e4e87`, package 2.3.1. Perbedaan lineage dicatat; tidak dianggap source sama/deployment aktif. Teaching Pay Audit tetap inventaris, bukan kartu usaha terdaftar.

Tidak mengakses database, runtime produksi, backup pribadi, kredensial produksi atau menjalankan script aplikasi sumber. Versi/deployment aktif sumber belum diverifikasi.

## Perubahan

- Beranda pemilik: periode WIB, Data contoh, mismatch sebelum incomplete, tiga kartu usaha termasuk usaha contoh belum terhubung dengan nilai `—`.
- Dialog POS: Rp12.400.000 pembanding, Rp12.150.000 proyeksi, Rp250.000 selisih, 121/123 struk; batas sumber 10.00 vs diterima 10.05.
- Dialog Kost: Rp4.200.000 sewa tercatat, 17/20 kamar; batas 09.30 vs diterima 09.42; dana titipan terpisah.
- Pribadi: Rp8.750.000 sintetis, tertutup saat pemuatan/reload, diminta lewat endpoint demo terpisah hanya setelah tombol. Bukan kontrol akses.
- Fixture dan mesin demo terisolasi di `demo/`; lab CLI `lab/` tidak berada dalam navigasi pemilik dan tidak mengubah baseline dashboard.
- Mesin menghitung BigInt dari baris, normalized scope key, replacement snapshot, retry idempotent, penolakan revisi lama/konflik, validasi manifest/identitas/cakupan/batas waktu sebelum verified. Penyimpanan Map dilabeli **in-memory, not durable**.
- Server loopback 127.0.0.1, Host allowlist, GET saja, aset allowlist, no-store, CSP same-origin, tanpa SDK cloud/browser storage. Tidak ada endpoint ingest produksi.
- Native dialog dengan Escape, tombol tutup, focus restoration dan explicit Tab loop. Text reason code dibuat kompatibel dengan fixture CONNECTOR_NOT_CONNECTED setelah review.

## Pemeriksaan yang benar-benar dijalankan

Tooling: Node `v24.22.1`, npm `11.19.1`, Git `2.53.0.windows.3`. Browser Playwright Python tersedia; bundled headless Chromium tidak tersedia, diganti Microsoft Edge terpasang `156.0.4314.58` tanpa download/install baru.

- TDD server: test pertama RED (server.mjs belum ada), lalu GREEN. TDD presentation: RED (app.mjs belum ada), lalu GREEN. Mesin demo memiliki suite tes terpisah.
- `npm test`: **52 tests PASS, 0 failed** saat pemeriksaan integrasi.
- `npm run check`: **11 modul syntax OK**, public bundle tanpa URL eksternal/SDK cloud/browser storage.
- `npm run lab`: benar-benar menjalankan mismatch -> complete -> retry; hasil hitung `12150000`/121 struk, lalu `12400000`/123 struk, retry tetap `12400000`; satu snapshot aktif. Tidak menyalin total pembanding ke proyeksi.
- Browser awal menemukan Tab bisa meninggalkan dialog; explicit keyboard loop ditambahkan. Rerun **94 assertions PASS**: 320/768/1440 px, angka/status, no horizontal overflow, dialog POS/Kost, Tab, Escape, focus return, saldo reveal/hide/reload, halaman gagal muat berbeda dari status sumber, seluruh request browser loopback, tanpa JS error.
- Screenshot desktop/mobile diperiksa visual: tidak ada clipping/overflow, personal terpisah; teks waktu/disclaimer kemudian diperbesar. Rerun final setelah polish: **94 assertions PASS**, Edge `156.0.4314.58`, tanpa JS error; seluruh request loopback.
- Review source independen menemukan reason-code casing pada unavailable; diperbaiki dan ditambah test integrasi dengan getDemoOverview.
- Review precommit mesin menemukan bug canonical retry: `localeCompare` menyamakan urutan kolasi ID Unicode berbeda (`é` dan `e\u0301`), sehingga retry dengan urutan baris dibalik bisa ditolak sebagai `REVISION_CONFLICT`. Comparator diganti dengan perbandingan code-unit tanpa normalisasi identitas. Regression Unicode ditambahkan; parent menjalankan ulang **53 tests PASS, 0 failed**, syntax 11 modul PASS dan diff whitespace bersih. Review independen ulang fix **PASS**, tanpa security concern atau logic error tersisa dalam cakupan demo; reviewer menjalankan 46 tes rekonsiliasi lulus. Siap commit/push private.
- `git fetch origin main` dan push `main` berhasil memakai helper per perintah tanpa perubahan konfigurasi Hermes/Git global. Akun aktif `charisnasuperapp`; private flag dibaca ulang true. SHA implementasi lokal dan GitHub API sama: `4b79d57c1a95a3725735dd85225d6c6c4f5ff9c6`. Tidak melakukan deploy hosting.

Bukti lokal: `artifacts/browser-results.json`, `artifacts/home-1440.png`, `home-768.png`, `home-320.png`, `pos-mobile.png`. Artifacts tidak masuk Git; laporan status ini dan test reproduktif masuk repo.

## Batas keamanan dan readiness

**Tidak ada autentikasi/otorisasi produksi.** Label Pemilik hanya konteks UI. API personal demo bisa diakses caller lokal. Uji 401/403, izin server-side/sesi/cache per pengguna, MFA, restore database, durability, connector nyata dan kuota produksi **NOT RUN / NOT IMPLEMENTED**. Jangan mengganti fixture dengan data nyata. Naskah penjelasan rincian untuk baseline fixture; skenario tambahan memerlukan copy status/reason-driven, bukan klaim baseline permanen.

Tidak ada SQL, migrasi, deploy hosting, billing, perubahan aplikasi sumber atau konfigurasi Hermes global. Owner melaporkan sudah mendaftar Supabase via GitHub dan berencana mendaftar Vercel; project DB/hosting belum dipakai/diverifikasi dan tidak diperlukan untuk prototipe ini.

## Cara menjalankan

```bash
cd C:/Users/ZENNITH/Documents/GitHub/charisna-superapp
npm start
```

Buka `http://127.0.0.1:4173`. Tes: `npm test`; syntax: `npm run check`; lab: `npm run lab`. Tidak perlu npm install. Stop Ctrl+C pada terminal server. Server yang dipakai pemeriksaan diluncurkan sebagai proses lokal selama sesi.

## Berikutnya

1. Review mesin dan final Node/browser selesai. Pertahankan tes regresi Unicode dan kontrak fixture pada perubahan berikutnya.
2. Kode implementasi sudah di repo private; dokumentasi status push diperbarui terpisah. Push bukan deploy online.
3. Owner meninjau UI lokal dan menentukan daftar usaha/akun/metrik pribadi; Teaching Pay tetap kandidat sampai disetujui.
4. Rancang autentikasi server + kontrol akses dan pengujian 401/403 sebelum hosting/data nyata. Pilih kebutuhan Vercel/Supabase setelah itu; jangan aktifkan billing tanpa persetujuan.

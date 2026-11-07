# CHARISNA SuperApp — Project Status

> Revisi login sandi + PIN/biometrik: `docs/AUTH_HERMES_REVISION_2026-11-07.md`. Dokumen ini mempertahankan riwayat; baca revisi sebelum memakai klaim auth/status lama.

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

## Verifikasi cloud — 7 November 2026

- Owner mengizinkan demo sintetis online melalui layanan gratis dan akses browser; tidak mengizinkan billing atau data nyata.
- Supabase diperiksa pada browser owner: organisasi `charisnasuperapp`, **FREE**, project `fepsonesdfuyycdlbsav`, status Healthy, Nano/Tokyo, repo tertaut `charisnasuperapp/charisna-superapp`. Dashboard menunjukkan No migrations dan No backups. Integrasi repo bukan konfigurasi Supabase Auth aplikasi.
- Owner melaporkan Vercel terhubung GitHub. Browser menunjukkan project `charisna-superapp` di akun `charisnasuperapp-2452`, **Hobby**, source `main`, commit berlabel `Import docs: record verified private repository push`, deployment **Ready**. Koneksi auto-deploy belum diuji dengan push baru.
- Domain produksi `https://charisna-superapp.vercel.app`; deployment `https://charisna-superapp-8035pgs66-charisnasuperapp-2452.vercel.app`.
- Probe HTTP tanpa sesi pada domain produksi: `/`, `/demo/overview.json`, `/demo/personal.json`, `/server.mjs`, `/demo/overview.mjs` semuanya **500**. Probe ulang `/` mengembalikan `FUNCTION_INVOCATION_FAILED` pada header `x-vercel-error` dan body. Status Ready bukan bukti aplikasi berjalan; penyebab runtime belum diperiksa melalui log.
- Autentikasi owner aplikasi belum diimplementasikan. Respons 500 bukan bukti proteksi akses. Jangan unggah data nyata.
- Sumber resmi diperiksa: Vercel Hobby dibatasi penggunaan personal/non-komersial; kelayakan dashboard usaha perlu diselesaikan sebelum penggunaan operasional. Supabase Free memiliki batas kuota dan pause setelah satu minggu tidak aktif. Tidak mengaktifkan trial atau paket berbayar.

## Integrasi Cloudflare dan akses owner — 7 November 2026 (belum rilis)

- Owner memilih Cloudflare untuk menjaga target Rp0 setelah batas personal/non-komersial Vercel Hobby dijelaskan. Akun browser dan `wrangler@4.158.0 whoami` terverifikasi sebagai `charisna.superapp@gmail.com`, account `307d7e4cb04ddb16d01cfbaefbb98cdf`. OAuth memakai scope terbatas untuk Worker; warning scope layanan lain tidak dijadikan alasan memperluas akses.
- Handler cloud menggunakan Web Request/Response dan assetLoader terinjeksi, bukan filesystem runtime. Beranda/API dilindungi otorisasi, origin canonical, mutasi JSON same-origin dengan body <=2048 byte, cooldown dan budget verifikasi instance-local, no-store dan security headers. Hanya login, skrip login dan CSS publik. Tes handler **13 PASS** pada run gabungan terbaru.
- Login/logout UI dan pembersihan saldo saat 401/pagehide sudah ada; **10 tes UI PASS** pada run gabungan terbaru. Belum merupakan bukti login Supabase nyata.
- Run integrasi `npm test`: **85 tests, 83 PASS, 2 FAIL**. Auth happy path gagal karena modul autentikasi masih stub; tes Worker redirect juga menerima 503, bukan 303, akibat auth belum lengkap. `npm run check` tidak dijalankan pada rangkaian tersebut karena `&&` berhenti saat tes gagal.
- Delegasi auth awal berhenti karena error batas context auxiliary compression; bukan error provider Supabase. File aktual diperiksa: `verifyCode` dan `authorize` masih mengembalikan 503. Penyelesaian auth ditugaskan ulang dalam cakupan file yang sama; konfigurasi Hermes global tidak diubah.
- Adapter Worker/aset terkemas selesai; parent memverifikasi `node scripts/build-worker.mjs && npx --yes wrangler@4.158.0 deploy --dry-run` exit 0: tepat 5 aset UI, 34.824 byte sumber aset, bundle 56,83 KiB / gzip 16,95 KiB, No bindings found. Dry-run bukan deployment. Tidak memakai static assets bypass; preview URLs dinonaktifkan. Review keamanan dan auth masih berjalan.
- Auth pengganti selesai. Parent menjalankan ulang `npm test && npm run check && git diff --check`: exit 0, **97/97 tes PASS**, syntax **21 modul PASS**. Ini menggantikan hasil integrasi 83/85 sebelumnya; validasi provider pada tes menggunakan stub, bukan Supabase online. Review independen auth selesai PASS: tidak ada security_concerns/logic_errors; reviewer menjalankan 16/16 tes dan lima probe offline tambahan. Review handler/UI menemukan bug HEAD body pada early-return; fix TDD selesai dan parent memverifikasi ulang **110/110 tes PASS**, syntax21 modul PASS, `git diff --check` PASS, dry-run PASS (61,89 KiB / gzip17,96 KiB). Respons HEAD kini dinormalisasi sesudah seluruh cabang/catch tanpa body; status/header dipertahankan. Review adapter independen PASS (110/110 tes pada salinan terisolasi, tanpa bypass aset/auth atau binding berbayar). Re-review HEAD independen PASS (26/26 tes focused; semua cabang/catch tanpa body, status/header tetap, non-HEAD tidak berubah). Seluruh gerbang review kode selesai. Dashboard akun Cloudflare menunjukkan Free $0 sebagai Current plan, batas 100.000 request/hari dan 10 ms CPU/request; akun Wrangler diperiksa ulang sesuai owner. Konfigurasi provider dan deployment tetap belum terverifikasi.
- Belum ada deploy Cloudflare, secret aplikasi cloud, penerimaan OTP, sesi owner online, atau uji logout online yang terverifikasi. Data tetap sintetis; SQL, billing dan aplikasi sumber tidak disentuh.
- Pemeriksaan provider aktual: dashboard Supabase Free menampilkan template Magic link or OTP bawaan berjudul `Your sign-in link`, dengan tautan `Sign in`, tanpa kode numerik. Banner menyatakan custom SMTP diperlukan untuk mengubah template; menu alternatif menawarkan Upgrade to Pro. Tidak memilih upgrade atau mengubah provider. Alur OTP numerik aplikasi belum kompatibel dengan konfigurasi email aktual; deployment ditahan sampai jalur login gratis diputuskan/disiapkan.
- Pemeriksaan ulang parent `npm test && npm run check && git diff --check`: exit 0, 110/110 tes PASS, syntax 21 modul PASS. GitHub API mengonfirmasi akun aktif `charisnasuperapp` dan repository tetap private. `wrangler whoami` mengonfirmasi email/account owner; akses API manual `/workers/subdomain` menghasilkan HTTP 401, sehingga hostname final belum diketahui. Secret/token tidak dicetak.

## Berikutnya

1. Review mesin dan final Node/browser selesai. Pertahankan tes regresi Unicode dan kontrak fixture pada perubahan berikutnya.
2. Kode implementasi sudah di repo private; dokumentasi status push diperbarui terpisah. Push bukan deploy online.
3. Owner meninjau UI lokal dan menentukan daftar usaha/akun/metrik pribadi; Teaching Pay tetap kandidat sampai disetujui.
4. Autentikasi server, kontrol akses dan regresi 401/403/HEAD sudah selesai serta direview. Implementasi cloud didorong sebagai `9f2028554fc000e4b3e882c7173f240ee2133f09`; parent mencocokkan SHA lokal dengan GitHub API, memastikan repo private dan worktree bersih. Deployment ditahan karena template email aktual hanya magic link, sedangkan aplikasi menerima OTP numerik. Tentukan alur magic link gratis atau custom SMTP yang memenuhi target Rp0, kemudian implementasikan/uji/review perubahan sebelum deployment dan acceptance online. Jangan aktifkan billing tanpa persetujuan.

## Update 2026-11-07: login magic link (PKCE)
- Login OTP kode diganti magic link Supabase (PKCE). Endpoint: POST /auth/send-link, GET /auth/callback. Tautan harus dibuka di peramban yang sama dengan yang meminta (verifier PKCE ada di cookie __Host-charisna-pkce).
- Worker live: https://zen.charisna-superapp.workers.dev. Secret Wrangler sudah diset (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OWNER_EMAIL, SESSION_SECRET, SITE_ORIGIN).
- ~~Manual: tambahkan https://zen.charisna-superapp.workers.dev/auth/callback ke Supabase Auth > URL Configuration (Redirect URLs) dan set Site URL ke origin yang sama.~~ **Selesai 7 Nov 2026**: Site URL dan Redirect URLs Supabase (project `fepsonesdfuyycdlbsav`) sudah diupdate via dashboard — Site URL = `https://zen.charisna-superapp.workers.dev`, Redirect URLs memuat callback `zen` (callback lama worker lama dipertahankan, Total URLs: 2). Magic-link pemulihan sandi dari `zen` kini valid.
- Pilihan magic link adalah asumsi agen; batas email Supabase Free 2/jam.

> Handoff terbaru dan hasil verifikasi live 7 Nov 2026: `docs/HANDOFF_OPENAI_2026-11-07.md`.

## Status terkini (7 November 2026)

> Bagian di bawah blok ini adalah sejarah prototipe lokal (data sintetis, tanpa D1). Yang berlaku sekarang:
>
> - **Runtime nyata**: Cloudflare Worker `https://zen.charisna-superapp.workers.dev/`, login owner via Supabase magic link. Demo lokal (`server.mjs`, `demo/`) tetap terpisah dan tidak disajikan oleh Worker.
> - **Konektor MySalary**: token Firebase disimpan **terenkripsi** (AES-256-GCM, kunci dari `SESSION_SECRET`) di D1 `charisna-teaching-state`. Kontrak: `docs/TEACHING_PAY_CONNECTOR.md`.
> - **Sinkron**: Cron `0 */6 * * *` UTC sebagai cadangan; pemicu cepat `POST /connector/signal` aktif hanya setelah patch MySalary (`patches/mysalary-superapp-signal.patch`) diterapkan dan dideploy oleh pemilik repo sumber.
> - **Vercel lama** (`charisna-superapp.vercel.app`) mengembalikan HTTP 500 dan **bukan** aplikasi aktif. Jangan dipakai.
> - Bukti live koneksi MySalary nyata, Cron nyata, dan sinyal cepat nyata: koneksi nyata **TERVERIFIKASI 7 Nov 2026** (lihat bagian verifikasi live di bawah); Cron dan sinyal cepat masih belum ada buktinya.


## 7 November 2026: handoff MySalary nyata

- P0 race disconnect/sync diperbaiki dengan compare-and-swap D1; tes interleaving disconnect, reconnect, Cron, rotasi refresh token lulus.
- P1 endpoint `/connector/signal` dibangun dan diuji unit. Patch MySalary tersimpan di `patches/`; hak repo sumber hanya READ, jadi belum dideploy.
- Tes: 128/128, syntax 24 modul. MySalary dengan patch: 42/42 tes.
- **Belum terbukti**: koneksi MySalary nyata, kecocokan bulan/tahun, Cron nyata, sinyal cepat nyata, pengukuran CPU/subrequest Free.

## 7 November 2026 (malam): rilis auth sandi + WebAuthn, verifikasi live koneksi MySalary

- Rilis login sandi Supabase (sesi 30 hari, refresh single-flight, logout revokasi jujur), buka kunci WebAuthn (PIN/biometrik) via `@simplewebauthn/server`, gate lock rute HTML (303 → `/unlock`), error JSON presisi di client. Fix dari dua review keamanan independen + hardening TDD `cloud/auth.mjs`. Tes akhir: **188/188 PASS** (`npm test`), syntax `scripts/check.mjs` PASS.
- Commit `00cb349` push ke `main`; Worker live Version `690849db-c7d9-4826-b526-c73f0e443e33` (`npx wrangler deploy`, Cron `0 */6 * * *`).
- **Verifikasi live pertama (bukti nyata)**: Owner login sandi baru di Chrome profil sendiri; dashboard `Ringkasan penghasilan` menampilkan badge `• Dibaca dari sumber`, `Dibaca 7 Nov 2026, 19.00 WIB`, bulan terbaru $345,00 / 34,5 jam / 8 hari, tahun 2026 $3.510,00 / 351 jam — angka cocok dengan MySalary (bandingkan snapshot 7 Nov: 351 jam, 94 hari, $3.510). Tidak ada error. Diverifikasi via screenshot desktop owner (bukan sesi otomasi).
- **Masih belum terbukti**: WebAuthn unlock di perangkat fisik owner (baru virtual authenticator), tabel D1 `passkeys` remote (CLI tanpa scope D1, error 7403), Cron nyata, sinyal cepat nyata.

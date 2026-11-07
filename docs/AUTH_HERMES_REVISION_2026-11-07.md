# Revisi Hermes — login sandi dan buka kunci perangkat

Dokumen tambahan; dokumen sebelumnya dipertahankan sebagai sejarah. URL resmi: https://zen.charisna-superapp.workers.dev/ . Status awal dokumen: implementasi lokal selesai, belum deploy revisi ini.

## Cara memakai

1. Buka `/login`. Email owner tetap `charisna.superapp@gmail.com`; masukkan sandi Supabase akun tersebut.
2. Jika belum pernah memiliki sandi SuperApp, gunakan tautan pemulihan satu kali pada halaman login. Buka pada peramban yang meminta tautan, lalu buka **Keamanan**, isi sandi baru dan konfirmasi, lalu **Simpan sandi**. Sandi ini milik SuperApp, tidak otomatis sama dengan MySalary atau sandi Gmail.
3. Di **Keamanan**, pada perangkat pribadi pilih **Aktifkan PIN / biometrik**. Ikuti dialog Windows Hello / autentikator platform. Pilihan PIN, sidik jari, atau wajah bergantung pada OS, peramban dan perangkat. SuperApp tidak membuat PIN sendiri dan tidak menyimpan biometrik.
4. Setelah 15 menit sejak aktivasi atau buka kunci terakhir, akses data terkunci di server. Pilih **Buka dengan PIN / biometrik**. Sesi owner tetap wajib valid.
5. Jika cookie dihapus, sesi dicabut/habis, atau pengguna keluar, masuk lagi dengan sandi. Ini bukan login passkey mandiri dan bukan jaminan tidak pernah membutuhkan sandi lagi.

Jangan kirim sandi/PIN/token di chat. Masukkan hanya melalui formulir HTTPS dan dialog OS. Jangan aktifkan pada perangkat bersama.

## Kontrak autentikasi

- Login: Supabase `grant_type=password`, email owner dikunci server, bukan email bebas dari request.
- Sesi: access + refresh token dalam cookie AES-256-GCM HttpOnly Secure SameSite=Strict; tidak di localStorage, JS atau URL. `SESSION_SECRET` tidak diubah.
- Jendela cookie maksimum 30 hari, diperpanjang saat refresh access token. Jika tidak dipakai hingga kedaluwarsa, wajib masuk lagi. Supabase dapat mencabut/membatasi sesi lebih awal.
- Server memeriksa `/auth/v1/user` untuk identitas owner; refresh dilakukan menjelang access token kedaluwarsa. Klaim penguncian tetap ada setelah refresh.
- Buka kunci berlaku 15 menit, bukan timer idle frontend. Batas berlaku meskipun halaman masih terbuka.
- WebAuthn memakai `@simplewebauthn/server`, exact HTTPS origin / RP ID, user verification wajib, challenge 5 menit sekali pakai, owner + purpose binding, cookie challenge tersegel terpisah.
- D1 yang sudah ada memakai tabel tambahan `charisna_passkeys` dan `charisna_passkey_challenges`, dibuat saat permintaan passkey pertama. Tidak membuat database/layanan/paket baru. Yang disimpan: public key, ID kredensial, counter, metadata dan challenge sementara; bukan private key, PIN/wajah/sidik jari, sandi atau token Supabase.
- Maksimal lima kredensial owner. Passkey platform dapat tersinkron antardevice; attachment bukan hardware attestation.
- Revoke menghapus seluruh public key owner. Sesi perangkat lain mungkin masih memiliki klaim terkunci dan harus login sandi lagi.
- Pembatas percobaan sandi di Worker bersifat per-isolate, bukan limiter global; batas Supabase tetap berlaku.

## Implementasi dan bukti lokal

- `cloud/auth.mjs`: password, refresh cookie, penguncian server dan pengaturan sandi.
- `cloud/passkeys.mjs`: verifikasi kriptografi WebAuthn, D1, challenge sekali pakai dan counter CAS.
- `cloud/handler.mjs`, `cloud/worker.mjs`: integrasi route, origin, cookie dan gate owner.
- `cloud/login.*`, `cloud/device.mjs`, `cloud/security.html`, `cloud/unlock.html`: UI.
- 179/179 tes lulus; syntax 32 modul; `npm audit --omit=dev`: 0 vulnerabilities; `git diff --check`: exit 0 (warning normalisasi LF/CRLF).
- Chromium nyata + CDP virtual platform authenticator, data/provider sintetis dan SQLite in-memory: login sandi, ganti sandi, register passkey, gate server setelah 16 menit, verifikasi assertion dan unlock berhasil; 320/768/1440 px tanpa overflow dan tanpa JS error. Ini bukan uji akun produksi atau sensor fisik.
- Wrangler 4.158.0 dry-run: 8 aset, bundle 805.85 KiB / gzip 154.59 KiB, D1 binding yang sudah disetujui. Dry-run bukan bukti CPU atau WebAuthn produksi.
- Node 24 memberi warning eksperimental Web Crypto supports/ML-DSA dari pemeriksaan algoritma pustaka; bukan kegagalan tes.

## Gerbang review sebelum rilis

Review auth menemukan revokasi upstream logout dapat gagal ketika access token lama kedaluwarsa, mapping sesi dicabut kurang tepat, refresh paralel belum single-flight, token baru kedaluwarsa belum ditolak eksplisit, dan cookie ter-escape dapat terlalu besar. Perbaikan beserta regresi sedang dikerjakan; hasil 179 tes di atas adalah sebelum hardening ini. Rilis ditahan sampai perbaikan dan review ulang selesai. Single-flight lokal tidak menjanjikan koordinasi refresh lintas isolate atau revokasi cookie segera di seluruh perangkat.

## Belum terbukti / jangan diklaim selesai

- Password owner aktual dan registrasi PIN/biometrik fisik harus diuji lewat form aman oleh owner.
- D1 production passkey table/ceremony, refresh produksi, dan CPU Free (10 ms) belum terukur.
- Jangan aktifkan billing, trial, atau memperluas scope token tanpa izin. Kesalahan layanan tetap dilaporkan, bukan diubah menjadi data contoh.
- Status MySalary terpisah: PR #1 benar-benar merged `de253ee976e57574c266d628566f7886147eeacb`; daftar lama yang menyebut READ/pending deploy sudah usang. Kecocokan data nyata pernah diverifikasi pada handoff sebelumnya. Sinyal simpan nyata, Cron nyata dan inspeksi ciphertext D1 tetap belum terbukti.

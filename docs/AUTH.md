# Autentikasi khusus pemilik

## Status terkini (7 November 2026)

> Bagian di bawah blok ini adalah sejarah prototipe lokal (data sintetis, tanpa D1). Yang berlaku sekarang:
>
> - **Runtime nyata**: Cloudflare Worker `https://charisna-superapp.charisna-superapp.workers.dev/`, login owner via Supabase magic link. Demo lokal (`server.mjs`, `demo/`) tetap terpisah dan tidak disajikan oleh Worker.
> - **Konektor MySalary**: token Firebase disimpan **terenkripsi** (AES-256-GCM, kunci dari `SESSION_SECRET`) di D1 `charisna-teaching-state`. Kontrak: `docs/TEACHING_PAY_CONNECTOR.md`.
> - **Sinkron**: Cron `0 */6 * * *` UTC sebagai cadangan; pemicu cepat `POST /connector/signal` aktif hanya setelah patch MySalary (`patches/mysalary-superapp-signal.patch`) diterapkan dan dideploy oleh pemilik repo sumber.
> - **Vercel lama** (`charisna-superapp.vercel.app`) mengembalikan HTTP 500 dan **bukan** aplikasi aktif. Jangan dipakai.
> - Bukti live koneksi MySalary nyata, Cron nyata, dan sinyal cepat nyata: **belum ada** (lihat PROJECT_STATUS.md).


> Status terkini: login SuperApp memakai magic link PKCE melalui email pemilik.

## Alur aktif (7 November 2026)

1. Pemilik membuka `/login` dan menekan **Kirim tautan masuk** sekali.
2. `POST /auth/send-link` meminta magic link Supabase untuk email pemilik tetap.
3. Browser menyimpan verifier PKCE dalam cookie `__Host-charisna-pkce`, `HttpOnly`, `Secure`, `SameSite=Lax`, maksimum 1 jam.
4. Pemilik membuka email dan tautannya **di browser yang sama**. Callback `/auth/callback` menukar kode dengan verifier.
5. Worker membaca `/auth/v1/user`, memeriksa email terverifikasi dan UUID pemilik, lalu membuat cookie sesi `__Host-charisna`, `HttpOnly`, `Secure`, `SameSite=Strict`, maksimum 15 menit.
6. Setiap permintaan terlindungi memeriksa ulang user Supabase. Logout menghapus cookie lokal dan mencoba mencabut sesi upstream.

Magic link PKCE adalah pilihan agen pada tahap implementasi sebelumnya; pemilik tidak memilih metode itu secara eksplisit. Pemilik telah melaporkan login email berhasil pada 7 November 2026. Pemeriksaan agen membuktikan permintaan tautan dari Chrome mendapat respons sukses, tetapi tidak menyaksikan layar dashboard setelah tautan dibuka.

Cloudflare Workers tidak mendukung `fetch` dengan `redirect: 'error'`. Semua panggilan keluar memakai `redirect: 'manual'`; respons 3xx ditolak sebagai respons tidak sukses. Perubahan ini memperbaiki 503 pada pengiriman tautan dan mempertahankan larangan mengikuti pengalihan bersama header autentikasi.

Bagian di bawah mencatat rancangan OTP numerik lama. `sendCode()` dan `verifyCode()` tidak ada pada kode aktif; gunakan `sendLink()` dan `exchangeCode()`.

Modul `cloud/auth.mjs` hanya mengizinkan email terverifikasi
`charisna.superapp@gmail.com`. Ini akses dashboard data sintetis, bukan koneksi
sumber produksi, SQL, sinkronisasi transaksi, atau penyimpanan data bisnis.
Tidak perlu service-role key, paket berbayar, atau binding penyimpanan berbayar.
Tidak ada deploy, pengiriman email nyata, perubahan akun, atau secret yang dilakukan
oleh pengujian lokal ini.

## Konfigurasi server

- `SITE_ORIGIN`: origin HTTPS kanonis, tanpa path, trailing slash, kredensial,
  atau port default eksplisit. Gunakan origin deployment sebenarnya.
- `SUPABASE_URL`: `https://<project-ref>.supabase.co`, tanpa path.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key `sb_publishable_...` atau legacy
  anon JWT. Service-role, secret key, dan role JWT lain ditolak.
- `OWNER_EMAIL`: wajib persis `charisna.superapp@gmail.com`.
- `OWNER_USER_ID`: UUID pemilik opsional; jika disetel, ID hasil `/user` harus cocok.
- `SESSION_SECRET`: secret acak berentropi tinggi, minimal 32 byte, maksimal
  1024 byte. Pemeriksaan panjang/keragaman bukan bukti entropi. Simpan sebagai
  secret server, jangan masukkan Git, HTML, log, atau balasan API.

Konfigurasi tidak aman menghasilkan `configured: false`. Login dan otorisasi
mengembalikan 503 tanpa akses jaringan. Logout tetap menghapus cookie lokal.
Cloudflare Workers memerlukan `nodejs_compat` untuk `node:crypto` dan Buffer.

## Riwayat OTP numerik (tidak aktif)

`createOwnerAuth({ env, fetchImpl, now })` menerima snapshot konfigurasi,
implementasi fetch, dan jam milidetik; default memakai environment, fetch, Date.now.

- `sendCode()`: POST `/auth/v1/otp` hanya untuk email tetap, dengan
  `create_user: true`. Bootstrap akun Auth hanya mungkin ketika operator benar-benar
  menjalankan alur ini; bukan bagian dari tes sintetis. Input email dari browser
  tidak digunakan. Sukses mengembalikan `{ status: 200, body: { ok: true } }`.
- `verifyCode(code)`: menerima 6–10 digit ASCII sesuai panjang OTP Supabase yang
  dikonfigurasi; spasi, newline, tipe non-string ditolak 400. POST
  `/auth/v1/verify` dengan `type: 'email'`, token dan email tetap. User dari respons
  verify tidak dipercaya. Token dipakai GET `/auth/v1/user` untuk memastikan UUID,
  email setelah trim/lowercase, serta `email_confirmed_at` yang valid. Salah
  pemilik, ID tidak cocok, atau email belum terverifikasi menghasilkan 403.
- `authorize({ headers: { cookie } })`: mendekripsi dan memvalidasi cookie,
  memeriksa expiry lokal/token, lalu GET `/auth/v1/user` pada **setiap** permintaan
  terlindungi. Sukses hanya `{ status: 200, user: { id, email } }`.
- `clearCookie()`: mengembalikan string Set-Cookie penghapusan.
- `logout(request)`: jika sesi lokal valid, POST `/auth/v1/logout?scope=global`
  dengan bearer token secara best effort. Selalu 200 dan cookie penghapusan,
  termasuk saat konfigurasi/cookie tidak valid atau provider gagal.

Cookie `__Host-charisna` dienkripsi AES-256-GCM dengan IV acak 12 byte, tag 16 byte,
kunci SHA-256 dari SESSION_SECRET, dan SITE_ORIGIN sebagai authenticated additional
data. Isinya hanya access token dan expiry; refresh token tidak disimpan. Cookie
memakai `Path=/; HttpOnly; Secure; SameSite=Strict`, tanpa Domain. Max-Age maksimal
900 detik atau expiry JWT lebih pendek. Penghapusan memakai Max-Age=0 dan Expires
Unix epoch. Perubahan origin atau secret menolak cookie lama. Cookie duplikat,
rusak, tidak kanonis, terlalu panjang, atau kedaluwarsa menghasilkan 401 sebelum
akses provider. Total header cookie dibatasi 8192 karakter, nilai sesi 4096;
JWT dibatasi 2048 karakter dengan tiga segmen base64url dan `exp` integer aman.
Parser JWT hanya membaca expiry; validasi token otoritatif tetap `/user`, bukan
klaim JWT atau role dari browser.

Tidak ada access token, refresh token, API key, atau pesan error provider dalam
body publik. Token hanya keluar sebagai ciphertext cookie dan bearer request
server-ke-server. Respons provider dibatasi 64 KiB, redirect ditolak, dan tiap
request fetch memiliki abort timeout 5 detik. 401 provider menghasilkan 401;
penolakan OTP 400/403/422 juga menjadi 401 generik. 429/5xx, respons rusak, dan
exception jaringan menghasilkan 503 generik. Pengiriman kode yang gagal selalu
503 generik. Respons error tidak diteruskan mentah ke klien.

## Batas Rp0 dan email

Supabase default SMTP adalah layanan terbatas, bukan email produksi: umumnya
hanya alamat anggota organisasi/tim proyek yang diizinkan dan batas default
pengiriman email Auth **2 email per jam per proyek**. Menyetel OWNER_EMAIL tidak
membuat alamat itu otomatis menjadi anggota organisasi. Periksa konfigurasi dan
limit proyek di dashboard sebelum menguji email nyata. Jangan mengaktifkan layanan
berbayar untuk melewati batas tanpa persetujuan. Jika email pemilik tidak diizinkan
oleh default SMTP, pengiriman dapat gagal; tes lokal tidak membuktikan pengiriman.

Catatan historis: rancangan OTP numerik sempat memerlukan template `{{ .Token }}`.
Alur aktif memakai magic link bawaan; tidak memerlukan perubahan SMTP atau template.

Pemeriksaan dashboard proyek pada 2026-11-07 menemukan template bawaan `Your sign-in link`
yang hanya menampilkan tautan `Sign in`, tanpa kode numerik. Dashboard mewajibkan
custom SMTP untuk menyunting template; alternatif menu adalah Upgrade to Pro.
Paket tetap Free dan tidak diubah. Hambatan OTP numerik selesai setelah alur
magic link PKCE aktif. Jangan aktifkan Pro untuk kebutuhan ini.

Handler menerapkan cooldown pengiriman 60 detik dan anggaran verifikasi 9 percobaan
per 15 menit **per instance**. Anggaran lokal ini bukan rate limiter global,
bukan batas biaya global, dan dapat ter-reset saat restart atau berbeda antar
isolate/region. Provider tetap menjadi pembatas email; gunakan free tier dan
pantau kuota. Tidak ada jaminan bebas biaya jika operator mengubah paket/konfigurasi.

## Batas keamanan

Logout global meminta pencabutan sesi upstream, tetapi access JWT yang sudah
terbit dapat tetap valid sampai expiry. Salinan cookie curian juga tidak memiliki
denylist server lokal. GET `/user` tiap request bukan jaminan pencabutan JWT
seketika. Batas sesi 15 menit/expiry token memperpendek risiko, bukan menghapusnya.
Rotasi SESSION_SECRET membatalkan seluruh cookie aplikasi lama. Tidak ada refresh
otomatis; login ulang diperlukan sesudah expiry. SameSite bukan pengganti
pemeriksaan origin: handler harus menjaga origin kanonis, POST JSON same-origin,
header keamanan, dan no-store untuk halaman/data terlindungi.

## Verifikasi lokal

```sh
node --test tests/cloud-auth.test.mjs
npm test
```

Tes memakai fetch fixture, token sintetis, dan jam injeksi. Tidak memanggil
Supabase nyata, tidak mengirim email, tidak membuat akun, tidak deploy, tidak
menjalankan SQL, dan tidak mengubah konfigurasi Hermes global. Jalur RED lalu
GREEN dijalankan bertahap untuk happy path dan kasus penolakan utama.

# Cloudflare Workers Free — adapter lokal

## Status terkini (7 November 2026)

> Bagian di bawah blok ini adalah sejarah prototipe lokal (data sintetis, tanpa D1). Yang berlaku sekarang:
>
> - **Runtime nyata**: Cloudflare Worker `https://charisna-superapp.charisna-superapp.workers.dev/`, login owner via Supabase magic link. Demo lokal (`server.mjs`, `demo/`) tetap terpisah dan tidak disajikan oleh Worker.
> - **Konektor MySalary**: token Firebase disimpan **terenkripsi** (AES-256-GCM, kunci dari `SESSION_SECRET`) di D1 `charisna-teaching-state`. Kontrak: `docs/TEACHING_PAY_CONNECTOR.md`.
> - **Sinkron**: Cron `0 */6 * * *` UTC sebagai cadangan; pemicu cepat `POST /connector/signal` aktif hanya setelah patch MySalary (`patches/mysalary-superapp-signal.patch`) diterapkan dan dideploy oleh pemilik repo sumber.
> - **Vercel lama** (`charisna-superapp.vercel.app`) mengembalikan HTTP 500 dan **bukan** aplikasi aktif. Jangan dipakai.
> - Bukti live koneksi MySalary nyata, Cron nyata, dan sinyal cepat nyata: **belum ada** (lihat PROJECT_STATUS.md).


## Batas biaya

Target hanya **Workers Free**, bukan trial atau Workers Paid. Cloudflare menyatakan Workers Free tersedia secara default, dengan 100.000 permintaan/hari dan 10 ms CPU per pemanggilan.[1] Jangan aktifkan pembayaran, upgrade paket, domain berbayar, atau produk tambahan untuk menjalankan adapter ini. Konfigurasi repository tidak dapat mengubah akun Paid menjadi Free: status paket tetap harus diperiksa pemilik sebelum deployment.

Adapter tidak membuat D1, KV, R2, Durable Objects, atau resource lain. Supabase Auth tetap dependensi terpisah milik pemilik; adapter tidak membuat proyek, memasang SQL, atau menyimpan kredensial database. Integrasi sumber SQL nyata belum dibangun dan data dashboard masih contoh sintetis.

## Arsitektur dan keamanan

- `cloud/worker.mjs` mengekspor `default.fetch(request, env)` menggunakan Web Request/Response.
- `createOwnerAuth({env})` dan `createCloudHandler({env, auth, assetLoader})` dibuat sekali per objek binding `env` dan disimpan dalam `WeakMap`. Ini mempertahankan throttle dalam isolate yang sama, **bukan** pembatas terdistribusi; isolate lain/restart memiliki penghitung sendiri. Gunakan juga pembatas provider Auth.
- `nodejs_compat` diperlukan untuk API Node milik modul auth; tanggal kompatibilitas `2026-11-06`.
- Tidak ada Workers Static Assets, Pages public directory, atau binding `ASSETS`. Semua URL melewati handler yang sama sehingga berkas dashboard tidak dapat melewati autentikasi lewat hosting statis.
- Build membaca **hanya** lima sumber UI berikut, lalu menulis `cloud/assets.mjs` sebagai modul JavaScript berisi string. Modul hasil generator sengaja dilacak bersama sumbernya; jalankan generator lagi setelah perubahan UI. Tidak ada glob, pembacaan `.env`, dump database, atau penyalinan fixture ke objek aset.

| Kunci `assetLoader(file)` | Sumber |
| --- | --- |
| `../public/index.html` | `public/index.html` |
| `../public/app.mjs` | `public/app.mjs` |
| `../public/styles.css` | `public/styles.css` |
| `./login.html` | `cloud/login.html` |
| `./login.mjs` | `cloud/login.mjs` |

Kode pembuat demo tetap dependensi handler dan ikut bundle JavaScript server, tetapi tidak diterbitkan sebagai aset publik. Kunci di luar daftar ditolak. Jangan meletakkan rahasia pada berkas UI: seluruh isinya memang akan masuk bundle.

## Build dan verifikasi tanpa akun

Dari direktori repository, dengan Node.js 22 atau lebih baru:

```sh
node scripts/build-worker.mjs
node --test tests/worker.test.mjs
npx --yes wrangler@4.158.0 deploy --dry-run --outdir dist/worker-dry-run
```

`deploy --dry-run` hanya menghasilkan bundle lokal; jangan hilangkan `--dry-run`. Tidak perlu login, mengubah akun, atau membuat resource. `npx` menggunakan cache npm, bukan instalasi global dan tidak menambahkan dependency ke `package.json`. Wrangler otomatis menjalankan generator lewat `build.command`.

Untuk menjalankan runtime lokal saja:

```sh
npx --yes wrangler@4.158.0 dev --local --ip 127.0.0.1 --port 8788
```

Tanpa konfigurasi, permintaan aplikasi mengembalikan 503 dan `Cache-Control: ... no-store`. Ini perilaku fail-closed yang diharapkan, bukan halaman publik cadangan. Origin HTTP localhost juga bukan origin HTTPS sah untuk auth produksi. Jangan mengendurkan validasi origin atau cookie Secure demi pengujian lokal.

## Konfigurasi pemilik — belum diisi

Hostname akhir `workers.dev` **masih pending**. Login GitHub tidak berarti otorisasi akun Cloudflare atau Supabase sudah tersedia. Tidak ada hostname/account ID, token, atau secret aktual pada konfigurasi ini.

Setelah pemilik secara terpisah mengizinkan deployment dan memastikan Workers Free, isi binding pada pengaturan Worker Cloudflare. Jangan menaruh nilai rahasia di Git, percakapan, argumen command line, atau log.

| Binding | Ketentuan |
| --- | --- |
| `SITE_ORIGIN` | Origin HTTPS hostname `workers.dev` final, tanpa path, query, atau trailing slash. Harus cocok dengan URL permintaan. |
| `SUPABASE_URL` | Origin HTTPS proyek Supabase pemilik, format `https://<project-ref>.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key atau legacy `anon` key proyek. Bukan secret/service-role key. Simpan sebagai binding secret walau key ini bersifat publishable. |
| `OWNER_EMAIL` | Email pemilik tetap yang diizinkan modul auth. Bukan daftar pendaftaran publik. |
| `SESSION_SECRET` | Secret acak kriptografis unik minimal 32 byte sesuai validator auth. Simpan sebagai secret; jangan gunakan nilai contoh test. |
| `OWNER_USER_ID` | Opsional: UUID user pemilik terverifikasi untuk penguncian identitas tambahan. |

Binding hilang/tidak valid membuat auth tidak tersedia. `wrangler.jsonc` sengaja tidak mempunyai `vars`, account ID, atau resource bindings. File `.dev.vars`/`.env` lokal harus diabaikan Git dan tidak diperlukan untuk dry-run ini. Konfigurasi log observability dinonaktifkan; adapter tidak mencetak cookie, token, atau environment.

## CPU: ukur sebelum mengklaim siap produksi

Batas Free adalah CPU, bukan waktu menunggu jaringan; melebihi batas berulang dapat menghentikan eksekusi.[2] Handler saat ini menghitung ulang `getDemoOverview()` untuk setiap permintaan endpoint demo. Ukuran bundle atau dry-run berhasil **tidak membuktikan** semua alur login/dashboard memenuhi 10 ms CPU di Cloudflare.

Pengukuran kasar lokal Node.js v24.22.1, 12 panggilan `getDemoOverview()`: panggilan pertama 4,86 ms wall time; 11 panggilan berikutnya rata-rata 0,94 ms, rentang 0,64–1,68 ms. Ini bukan CPU Worker dan tidak termasuk jaringan Auth, enkripsi sesi, startup Worker, atau keseluruhan request. Angka lokal ini tidak menjamin batas produksi.

Jika profil runtime menunjukkan kalkulasi demo mahal, optimasi terpisah dapat membentuk snapshot read-only sekali per isolate atau saat build. Jangan embed data nyata/rahasia, jangan membagikan hasil yang termutasi antar pengguna, dan tetap uji isolasi lab/demo. Tidak perlu upgrade berbayar untuk menutupi masalah performa.

## Hasil verifikasi lokal

- Siklus RED/GREEN dijalankan untuk generator aset, fetch fail-closed, cache handler/throttle, dan konfigurasi tanpa hosting statis/resource berbayar.
- Wrangler `4.158.0 deploy --dry-run` berhasil: bundle 54,66 KiB, gzip 16,34 KiB; `No bindings found`; tidak ada deployment. Ukuran dapat berubah setelah edit UI/auth berikutnya.
- `wrangler dev --local` berhasil menjalankan workerd; `/`, `/app.mjs`, `/cloud/assets.mjs`, dan `/demo/overview.json` semuanya 503 dengan no-store tanpa binding.
- Setelah auth dan perbaikan HEAD selesai: parent menjalankan `npm test && npm run check && npx --yes wrangler@4.158.0 deploy --dry-run && git diff --check`: exit 0, 110/110 tes lulus, syntax 21 modul valid, bundle 61,89 KiB / gzip 17,96 KiB. Ini menggantikan hasil sementara 83/85 saat auth belum lengkap. Reviewer adapter independen juga menjalankan 110/110 tes dan syntax check pada salinan terisolasi; tidak menemukan bypass aset/auth, secret tersemat, atau binding berbayar. Dry-run bukan deployment.
- Belum diverifikasi di Cloudflare produksi: hostname final, konfigurasi provider, pengiriman OTP nyata, atau CPU produksi. Tidak ada akun/resource yang diubah oleh pekerjaan adapter ini.

## Sources

[1] https://developers.cloudflare.com/workers/platform/pricing
[2] https://developers.cloudflare.com/workers/platform/limits

## Konektor MySalary: D1, Cron, sinyal

- D1 `charisna-teaching-state` (binding `TEACHING_STATE`), tabel `connector_state`; skema di `cloud/teaching.sql`. Payload hanya ciphertext.
- Penulisan latar (sync, Cron, sinyal) memakai compare-and-swap `UPDATE ... WHERE id=? AND payload=?` dan memeriksa `meta.changes`; setelah putus koneksi atau sambung ulang, proses lama tidak dapat menulis token atau snapshot kembali.
- Cron `0 */6 * * *` UTC. Satu sync membaca 1 manifest + N bulan Firestore dengan konkurensi terbatas. Batas Free (10 ms CPU, 50 subrequest) **belum diukur di Cloudflare**; jika jumlah bulan mendekati ~40, sinkron bertahap diperlukan.
- `POST /connector/signal`: hanya origin `https://www.mysalary.my.id` (override: env `TEACHING_SIGNAL_ORIGIN`), body `{idToken}` saja, UID dicocokkan dengan D1, cooldown 10 detik, batas 30/menit per isolate. CORS bukan autentikasi; token Firebase yang menentukan.

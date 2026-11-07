# Konektor MySalary / Teaching Pay Audit

Status: implementasi sumber nyata pertama, 7 November 2026. Pemilik mengizinkan D1 Free dan sinkron otomatis. Sumber: `cocoyiyi88/teaching-pay-audit` v2.3.1, bukan checkout lama `Piola_Salary` v1.8.0.

## Arti angka

- SuperApp menampilkan jam, hari mengajar, dan gaji **per bulan** serta total **per tahun** dari bulan yang tercatat. Mata uang sumber **USD**. Gaji mengajar adalah penghasilan pribadi, bukan omzet usaha, saldo, atau laba.
- Sumber otoritatif tetap MySalary Firebase. Firestore `users/{uid}/salaryAudit/database` memuat `monthKeys`. `users/{uid}/salaryAuditMonths/{YYYY-MM}` memuat `hourlyRate`, `entries`, dan `updatedAt`.
- Rumus mengikuti sumber: `totalHours = round2(sum(normalizeHours(entry.hours)))`, `totalPay = round2(totalHours * hourlyRate)`. Hari mengajar adalah entri dengan jam positif. Simpan total uang sebagai string satuan cent dan `scale=2`.
- Konektor membaca maksimal dua tahun terakhir yang tercatat. Jumlah tahunan hanya mencakup bulan yang ada di manifest pada dua tahun itu. Jangan menyebutnya total sepanjang masa.
- Data MySalary tidak digabung dengan IDR POS/Kost dan tidak dikonversi tanpa kurs dan tanggal. Nama kelas, catatan harian, profil, sandi, dan backup penuh tidak disalin.
- Dokumen bulan hilang/rusak menghasilkan kegagalan sumber, bukan nol. Keadaan `not_connected`, `no_records`, `stale`, dan `source_error` dibedakan. Angka lama berlabel tertunda.

## Akses dan penyimpanan

1. Pemilik masuk SuperApp melalui magic link email.
2. Di halaman terlindungi, pemilik memasukkan email dan sandi MySalary sekali. Browser mengirim sandi langsung ke Firebase Auth. Worker dan D1 tidak menerima sandi.
3. Browser mengirim ID token dan refresh token Firebase melalui HTTPS ke Worker. Worker memeriksa sesi pemilik dan origin, memvalidasi ID token ke Firebase Auth, lalu menguji akses Firestore UID itu.
4. Worker menyimpan UID, refresh token, dan ringkasan dalam **satu baris D1**. Payload dienkripsi AES-256-GCM dengan kunci turunan `SESSION_SECRET`; ciphertext terikat pada origin dan project Firebase. D1 tidak menyimpan plaintext token. Browser lain tetap dapat membaca ringkasan melalui sesi pemilik.
5. Worker menukar refresh token menjadi ID token baru, membaca hanya dokumen yang diperlukan melalui Firestore REST dengan token pengguna, lalu menyimpan ringkasan. Tidak ada service account yang melewati Firestore Rules. Jika Firebase merotasi refresh token, Worker menyimpan token baru terenkripsi.
6. `GET /overview.json` membaca cache sampai satu jam. Saat cache lebih lama, Worker menyinkron ulang. Cron setiap **6 jam UTC** menyinkron meski browser MySalary ditutup. Tombol putus koneksi menghapus baris D1, termasuk token dan ringkasan.

**Batas waktu:** Cron enam jam dan pembukaan dashboard bukan sinkron seketika setelah tombol Sync MySalary. Pemicu langsung dari MySalary memerlukan perubahan di aplikasi sumber dan pengamanan endpoint terpisah. Jangan mengklaim sinkron seketika sebelum itu diuji dan dipasang.

Refresh token memberi akses sesuai akun MySalary selama masih berlaku. Kode konektor hanya membaca Firestore, tetapi token yang bocor dapat dipakai di luar SuperApp. Jangan tampilkan token di UI, respons, log, Git, atau dokumen. Rotasi `SESSION_SECRET` memutus seluruh koneksi; pemilik harus menghubungkan ulang. Setelah putus koneksi, token di D1 dihapus, tetapi token Firebase itu sendiri baru dicabut oleh Firebase ketika sesi dicabut dari sisi sumber.

Jika `SESSION_SECRET` atau `SITE_ORIGIN` berubah, ciphertext lama tidak dapat dibuka. `GET /overview.json` menghapus **hanya baris dengan ciphertext yang sama** lalu mengembalikan `200 needs_reconnect`; kegagalan baca D1 tetap `503` dan tidak menghapus baris. Pemilik menghubungkan MySalary lagi di origin baru. Login baru menimpa state lama dan ringkasan dihitung ulang dari Firestore; snapshot terenkripsi lama tidak bisa dipulihkan tanpa kunci asal. Jika dua Worker memakai D1 yang sama, koneksi ulang pada Worker baru membuat Worker lama tidak dapat membuka baris baru. Jangan pakai Worker lama sesudah migrasi.

## Biaya dan batas gratis

- D1 `charisna-teaching-state` memakai Workers Free. Tabelnya ada di `cloud/teaching.sql`. Binding dan jadwal ada di `wrangler.jsonc`.
- Firestore Free memberi 50.000 document reads/hari. D1 Free memberi 5 juta rows read/hari, 100.000 rows written/hari, dan 5 GB storage. Worker Free memberi 100.000 requests/hari, 50 subrequests/request, dan batas CPU 10 ms untuk Cron. Angka ini harus dicek ulang saat rilis.
- Dengan maksimal 24 dokumen bulan, satu sinkron kira-kira membaca metadata + 24 dokumen. Empat Cron/hari kira-kira 100 document reads/hari, di luar buka dashboard dan pemakaian MySalary sendiri. Pantau kuota dan kegagalan CPU sebelum memperpendek interval.
- Tidak ada aktivasi billing berbayar dalam perubahan ini.

## Tes penerimaan

- Tanpa sesi SuperApp, endpoint konektor menolak. Tanpa binding/kunci, 503.
- Token salah tidak membuat koneksi. UID refresh harus sama dengan UID saat sambung.
- Hanya GET Firestore. Redirect, 401/403, dokumen hilang, angka tidak aman, dan timeout gagal tertutup.
- Ciphertext D1 tidak memuat token/UID plaintext. Putus koneksi menghapus baris. Cache usang diberi label `stale` saat sumber gagal.
- Bandingkan bulan dan tahun yang sama di MySalary dan SuperApp. Uji Cron nyata, mobile, serta pembukaan setelah MySalary ditutup. Sampai verifikasi live ini selesai, status sinkron produksi belum terkonfirmasi.

Sumber: [repo MySalary](https://github.com/cocoyiyi88/teaching-pay-audit), [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth), [Firestore REST](https://firebase.google.com/docs/firestore/use-rest-api), [D1 Free](https://developers.cloudflare.com/d1/platform/pricing/), [Firestore Free](https://firebase.google.com/docs/firestore/quotas), [Workers Free](https://developers.cloudflare.com/workers/platform/limits/).

## Pemicu cepat (sinyal)

Setelah commit Firestore MySalary sukses, sumber mengirim `POST /connector/signal` dengan `{idToken}` (tanpa data gaji). Worker memvalidasi token ke Firebase, mencocokkan UID dengan akun terhubung, lalu menarik ulang Firestore sendiri. Sinyal gagal tidak menggagalkan simpan; Cron tetap cadangan. Pengiriman saat `pagehide` hanya best effort. Pemicu belum aktif sebelum patch `patches/mysalary-superapp-signal.patch` diterapkan ke MySalary; sampai itu, batas sinkron nyata ialah interval Cron (hingga sekitar 6 jam) plus cache 1 jam saat halaman dibuka.

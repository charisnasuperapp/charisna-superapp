# Handoff ke OpenAI/ChatGPT — CHARISNA SuperApp (7 November 2026)

Dokumen baru, tidak menimpa handoff lama. Isi: kondisi nyata, bukti, yang belum terbukti, langkah berikut.
Tanpa sandi, token, atau nilai secret. Jangan tambahkan ke dokumen ini.

## Kondisi nyata
- Repo: `charisnasuperapp/charisna-superapp` (private), branch `main`. Workspace lokal: `C:/Users/ZENNITH/Documents/GitHub/charisna-superapp`.
- Live: `https://charisna-superapp.charisna-superapp.workers.dev/` (Cloudflare Worker Free, Cron `0 */6 * * *` UTC, D1 `charisna-teaching-state`, tabel `connector_state`). Vercel `charisna-superapp.vercel.app` HTTP 500 dan bukan target.
- Worker deploy terakhir: Version ID `f9242cfe-3813-4a1e-9a62-746a42ddd69b` (commit kode `d98a703`).
- Login owner: Supabase magic link ke `charisna.superapp@gmail.com`. Cookie `__Host-charisna`, 15 menit.
- Tes: 128/128 lulus, 24 modul valid (`npm test`, `npm run check`).

## Bukti verifikasi live (7 Nov 2026, dibaca dari layar Chrome Raja)
SuperApp vs MySalary, sama persis:
- Bulan terbaru (Nov 2026): $345.00, 34,5 jam, 8 hari.
- Rekap: Agu 103,5 jam/28 hari/$1.035; Sep 100,5/27/$1.005; Okt 112,5/31/$1.125; Nov 34,5/8/$345.
- Tahun 2026: 351 jam, 94 hari, $3.510.00. Sama dengan kartu Annual Summary MySalary.
- Label USD, tanpa konversi IDR. Badge "Dibaca dari sumber", bukan fixture.
- Catatan: tabel bulanan Annual Summary MySalary menampilkan Jan-Jul 0 dan SuperApp juga 0 untuk Januari. Konsisten, perilaku sumber.

## Belum terbukti
1. D1 menyimpan ciphertext, bukan token plaintext. Hanya terbukti oleh tes unit. Token Wrangler ditolak Cloudflare error 7403 (tanpa scope D1). Cara: Console D1 dashboard, query `SELECT COUNT(*) FROM connector_state` (jangan `SELECT payload`), atau API token baru dengan izin `D1: Read` saja.
2. Cron nyata dan batas Free (CPU 10 ms, 50 subrequest): lihat log Worker setelah Cron 00/06/12/18 UTC.
3. Pemicu cepat end-to-end: butuh PR #1 di-merge dan dideploy pemilik repo sumber.
4. Logout dan putus koneksi di browser nyata: hanya terbukti tes otomatis (CAS, race). Putus koneksi memaksa sambung ulang dan sandi MySalary diketik owner sendiri.
5. Uji tampilan HP.

## Langkah berikut
1. Merge PR https://github.com/cocoyiyi88/teaching-pay-audit/pull/1 (hak agen hanya READ), deploy MySalary, lalu simpan data di MySalary dan cek SuperApp berubah dalam hitungan detik. Patch cadangan: `patches/mysalary-superapp-signal.patch`.
2. Selesaikan butir 1 dan 2 di atas, catat hasilnya di dokumen ini.
3. Uji logout live, lalu putus koneksi plus sambung ulang bila owner siap.
4. Perbaiki Vercel 500 hanya bila dibutuhkan; bukan prioritas.

## Aturan yang harus dipertahankan
- Dashboard read-only, owner saja. Keuangan pribadi terpisah dan jangan digabung. Gaji mengajar dalam USD, bukan omzet usaha.
- Sandi dan token tidak masuk chat, terminal, Git, log, atau dokumen. Jangan ubah `SESSION_SECRET` tanpa rencana sambung ulang (juga mengenkripsi payload D1).
- Jangan aktifkan layanan berbayar (Workers Paid, Supabase Pro). Jangan overwrite dokumen lama; buat file revisi baru.
- Jangan ubah proyek `Piola_Salary` lama. Jangan deploy MySalary tanpa pemilik repo.
- Desain: sinyal MySalary hanya membawa Firebase ID token. Worker menarik ulang Firestore sendiri. Cron 6 jam jadi cadangan.

## File kunci
`cloud/teaching.mjs` (CAS, signal), `cloud/handler.mjs` (route `/connector/signal`), `cloud/overview.mjs`, `wrangler.jsonc`, `docs/TEACHING_PAY_CONNECTOR.md`, `docs/AUTH.md`, `docs/CLOUDFLARE.md`, `PROJECT_STATUS.md` (blok "Status terkini").

# Kontrak UI lokal — Fokus Perhatian

Acuan produk: handoff v2.2, bukan kode paket implementasi v2.1. Semua status dinilai pada batas data sumber fixture 6 November 2026, bukan terhadap jam mesin sekarang. Jadwal sinkron sumber nyata belum diputuskan.

## Hierarki

1. Header identitas CHARISNA, label Data contoh dan peran Pemilik (bukan klaim login).
2. Periode 1–6 November 2026 WIB.
3. Perlu perhatian: mismatch dahulu, kemudian incomplete/stale/provisional. Kondisi kosong punya pesan eksplisit.
4. Semua usaha: satu metrik per kartu; nilai null tetap em dash, bukan nol.
5. Pribadi: saldo tertutup pada setiap pemuatan; meminta nilai hanya saat dibuka. Tidak digabungkan dengan usaha.

Tidak ada agregat penjualan+sewa, laba grup, simulator, impor, consent, tambah usaha, backfill atau diagnostik di beranda. Semua tombol dashboard hanya membaca atau membuka/menutup rincian. Teaching Pay Audit tetap kandidat inventaris.

## Status dan waktu

Status per metrik, bukan cap seluruh bisnis. `mismatch` = Ada selisih; `incomplete` = Belum lengkap; `stale` = Data tertunda; `provisional` = Sementara; `verified` = Terverifikasi; `unavailable` = Belum tersedia, atau Belum terhubung jika reason_code connector_not_connected. Nilai 0 bukan fallback untuk null.

Waktu **Diterima** di kartu berbeda dari **Data sumber sampai** di rincian. Semua diformat id-ID dan Asia/Jakarta. Rincian mismatch menampilkan pembanding, nilai proyeksi, selisih dan coverage. Rincian Kost menegaskan dana titipan terpisah serta nominal parsial bukan total properti.

## Interaksi dan privasi demo

Dialog native dengan judul, tombol tutup, Escape, focus trap browser dan pengembalian fokus. Dua kolom perhatian pada desktop, satu kolom HP. Tombol dan status punya teks; warna bukan satu-satunya indikator. Uji lebar 320, 768 dan 1440.

Server hanya melayani allowlist aset dan dua endpoint GET demo. Tidak menyajikan file lab, fixture mentah, status proyek atau dokumen lokal. `Cache-Control: no-store`, CSP same-origin, no localStorage. Tidak ada sistem akun: data sintetis ini bukan pembuktian 401/403, izin server-side, MFA, cache per sesi atau keamanan deployment.

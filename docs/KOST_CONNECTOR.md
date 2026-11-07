# CHARISNA KOST → SuperApp

## Cakupan

Kartu `/kost` menampilkan setiap properti: kamar terisi/total, pembayaran diterima bulan berjalan, dan tagihan belum lunas. Ini ringkasan **snapshot lokal Owner**, bukan pembacaan Firestore langsung. Waktu penerimaan dan status data tertunda ditampilkan. Sinkronisasi terjadi setelah perubahan lokal tersimpan, saat Owner masuk, dan setiap 15 menit selama aplikasi sumber terbuka. Saat aplikasi KOST tertutup, kartu terakhir tetap terlihat dan menjadi `stale` setelah 24 jam.

## Arti angka

- Kamar terisi: kamar dengan `status === 'TERISI'`; total: semua kamar di properti.
- Pembayaran diterima bulan ini: jumlah `amount` tagihan `LUNAS` yang `paidDate` berada di bulan Asia/Jakarta saat snapshot dibuat. Pembayaran parsial dari tagihan bertahap belum dihitung.
- Tagihan belum lunas: jumlah `amount` seluruh tagihan `BELUM_LUNAS` tanpa batas periode. Ini nilai tagihan, bukan piutang akuntansi yang direkonsiliasi.
- Tagihan tanpa `propertyId` dipetakan hanya jika nomor kamar cocok tepat satu kamar. Tagihan ambigu dikecualikan dari kartu dan dihitung sebagai `unassigned_bills`.
- Data contoh bawaan boleh dikirim dengan `is_demo: true` dan label jelas di kartu. Setelah semua contoh bawaan diganti, snapshot berikutnya memakai `is_demo: false` dan label hilang. Identitas penghuni, nomor telepon, foto, dan rincian tagihan tidak dikirim.

## Hubungkan

1. Masuk SuperApp sebagai pemilik. Buka `/kost`, lalu pilih **Buat kode penghubung**.
2. Masuk aplikasi CHARISNA KOST sebagai Owner pada perangkat yang memiliki data nyata tersimpan.
3. Buka **Cloud & Akun**, isi kode, lalu pilih **Hubungkan dan kirim ringkasan** dalam 10 menit.
4. Muat ulang `/kost` dan periksa nama properti, bulan, serta waktu snapshot.

Kode hanya sekali pakai. Kunci sinkron tersimpan di localStorage perangkat Owner, dan hash kunci serta ringkasan terenkripsi tersimpan di D1 SuperApp. **Putuskan KOST dan hapus ringkasan** menghapus keduanya di sisi server; kunci lama tidak dapat mengirim ulang. Jika sumber masih menyimpan kunci lama, buat kode baru dan hubungkan lagi. Tidak perlu menyalin kunci ke chat.

## Kontrak v1

`POST /kost/push` hanya menerima origin situs KOST yang diizinkan, pasangan kode sekali pakai atau kunci sinkron, dan `snapshot` berikut:

```json
{"schema":1,"month":"2026-11","source":"local_snapshot","is_demo":false,"properties":[{"id":"P-1","name":"Kost Utama","occupied_rooms":2,"total_rooms":3,"paid_this_month_idr":"1200000","unpaid_bills_idr":"200000"}],"unassigned_bills":0}
```

Nilai IDR dikirim sebagai string bilangan bulat agar tidak memakai pecahan float. Endpoint overview hanya dapat dibaca sesi Owner SuperApp. Tidak ada D1 baru atau biaya layanan tambahan yang dipasang oleh konektor ini.

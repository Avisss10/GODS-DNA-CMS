/**
 * STUB SEMENTARA — Modul Notification lengkap dijadwalkan di Step 17.
 *
 * BAGIAN 10 dokumen mensyaratkan notifikasi in-app ke Leader untuk
 * berbagai event (login gagal berulang, dst), disimpan di tabel
 * `notifications`. Tabel tersebut belum dibuat (di luar 15 tabel
 * Step 6, sesuai urutan kerja: Notification = Step 17).
 *
 * Sampai Step 17 selesai, fungsi ini hanya mencatat ke console.log
 * sebagai jejak bahwa notifikasi SEHARUSNYA terkirim. Tidak ada
 * data yang hilang secara permanen karena setiap pemicu notifikasi
 * (misal rate-limit lockout) tetap tercatat lengkap di audit_logs.
 *
 * TODO (Step 17): ganti implementasi notifyLeaders() agar benar-benar
 * INSERT ke tabel notifications, query semua user peran=LEADER aktif,
 * dan (opsional) kirim email sesuai BAGIAN 10.
 *
 * @param {{ jenis: string, pesan: string, meta?: object }} params
 */
function notifyLeaders({ jenis, pesan, meta = {} }) {
  console.log(`[STUB NOTIFIKASI LEADER] jenis=${jenis} | ${pesan}`, meta);
}

module.exports = { notifyLeaders };
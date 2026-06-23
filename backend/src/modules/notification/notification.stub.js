const notificationService = require('./notification.service');

/**
 * Kirim notifikasi ke semua Leader aktif.
 * Support dua signature:
 *   - Lama: notifyLeaders(jenis, pesan, metadata)  ← dari auth.service
 *   - Baru: notifyLeaders({ jenis, judul, pesan })  ← dari modul lain
 */
async function notifyLeaders(jenisOrObj, pesan, metadata = {}) {
  let jenis, pesanFinal;

  if (typeof jenisOrObj === 'object' && jenisOrObj !== null) {
    jenis = jenisOrObj.jenis;
    pesanFinal = jenisOrObj.pesan;
  } else {
    jenis = jenisOrObj;
    pesanFinal = pesan;
  }

  const judulMap = {
    LOGIN_GAGAL_BERULANG: 'Peringatan: Login Gagal Berulang',
    LOGIN_IP_BARU: 'Peringatan: Login dari IP Tidak Dikenal',
    EKSPOR_DATA_MALAM: 'Peringatan: Ekspor Data di Luar Jam Operasional',
    LEADER_TINGGAL_SATU: 'Peringatan: Jumlah Leader Tinggal 1',
    EVENT_SELESAI: 'Ringkasan Event Selesai',
    SCORING_SELESAI: 'Cron Scoring Selesai',
    AUDIT_TAMPERED: 'PERINGATAN KRITIS: Integritas Audit Log Terancam',
  };

  const judul = judulMap[jenis] ?? `Notifikasi: ${jenis}`;

  try {
    await notificationService.notifyLeaders({ jenis, judul, pesan: pesanFinal });
    console.log(`[NOTIFIKASI LEADER] jenis=${jenis} | ${pesanFinal}`, metadata);
  } catch (err) {
    console.error(`[NOTIFIKASI LEADER ERROR] jenis=${jenis}:`, err.message);
  }
}

module.exports = { notifyLeaders };
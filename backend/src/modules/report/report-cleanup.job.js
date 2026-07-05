const fs = require('fs');
const path = require('path');

// Job berkala penghapus file laporan kedaluwarsa di uploads/reports.
// Signed URL hanya berlaku 15 menit, jadi file berumur > 30 menit
// dipastikan tidak bisa diunduh lagi dan aman dihapus.

const REPORT_DIR = path.join(__dirname, '../../../uploads/reports');
const MAX_FILE_AGE_MS = 30 * 60 * 1000; // 30 menit
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // tiap 1 jam

let intervalHandle = null;

/**
 * Hapus semua file di uploads/reports yang berumur lebih dari 30 menit.
 * Diekspor terpisah agar bisa diuji tanpa menunggu interval.
 *
 * @param {Date} now - injeksi waktu untuk testing
 * @returns {number} jumlah file yang dihapus
 */
function cleanupExpiredReportFiles(now = new Date()) {
  if (!fs.existsSync(REPORT_DIR)) return 0;

  let deleted = 0;
  for (const entry of fs.readdirSync(REPORT_DIR)) {
    if (entry === '.gitkeep') continue;

    const filePath = path.join(REPORT_DIR, entry);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (now.getTime() - stat.mtimeMs > MAX_FILE_AGE_MS) {
        fs.unlinkSync(filePath);
        deleted += 1;
      }
    } catch (err) {
      // File bisa saja sudah dihapus oleh proses download — jangan
      // gagalkan seluruh siklus cleanup karena satu file.
      console.error(`[REPORT CLEANUP] Gagal memproses ${entry}:`, err.message);
    }
  }

  console.log(`[REPORT CLEANUP] ${deleted} file laporan kedaluwarsa dihapus.`);
  return deleted;
}

/**
 * Pasang job cleanup tiap 1 jam (dipanggil dari src/server.js).
 * Idempotent, dan tidak menahan proses tetap hidup (unref).
 */
function startReportCleanupJob() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => cleanupExpiredReportFiles(), CLEANUP_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
}

/**
 * Hentikan job cleanup (dipakai saat shutdown / test).
 */
function stopReportCleanupJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  cleanupExpiredReportFiles,
  startReportCleanupJob,
  stopReportCleanupJob,
  MAX_FILE_AGE_MS,
  CLEANUP_INTERVAL_MS,
  REPORT_DIR,
};

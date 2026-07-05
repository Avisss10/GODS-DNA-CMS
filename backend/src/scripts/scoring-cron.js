const { runScoringBatch } = require('../modules/scoring/scoring.service');
const { notifyLeaders } = require('../modules/notification/notification.stub');

// Scheduler internal tanpa dependency baru: hitung selisih ke pukul
// 02:00 berikutnya (waktu server), setTimeout ke sana, lalu jadwalkan
// ulang setelah tiap run. Guard `isRunning` mencegah dobel eksekusi
// jika run sebelumnya belum selesai saat jadwal berikutnya tiba.

const SCORING_HOUR = 2; // 02:00 waktu server

let timer = null;
let isRunning = false;

/**
 * Hitung delay (ms) dari `now` ke pukul 02:00 berikutnya.
 * @param {Date} now
 * @returns {number}
 */
function msUntilNextRun(now = new Date()) {
  const next = new Date(now);
  next.setHours(SCORING_HOUR, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/**
 * Jalankan satu siklus scoring dengan guard anti dobel-jalan.
 * Diekspor agar bisa diuji tanpa menunggu jadwal.
 * @returns {Promise<{ processed: number, skipped: number } | null>} null jika run sebelumnya masih berjalan
 */
async function runScheduledScoring() {
  if (isRunning) {
    console.warn('[SCORING CRON] Run sebelumnya masih berjalan, siklus ini dilewati.');
    return null;
  }

  isRunning = true;
  try {
    console.log('[SCORING CRON] Mulai scoring batch...');
    const result = await runScoringBatch({ actorUserId: null });
    console.log(`[SCORING CRON] Selesai: ${result.processed} diproses, ${result.skipped} dilewati.`);

    await notifyLeaders({
      jenis: 'SCORING_SELESAI',
      pesan: `Cron scoring malam selesai: ${result.processed} jemaat diproses, ${result.skipped} dilewati.`,
    });

    return result;
  } catch (err) {
    console.error('[SCORING CRON] Gagal:', err.message);
    return null;
  } finally {
    isRunning = false;
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();
  timer = setTimeout(async () => {
    await runScheduledScoring();
    scheduleNext();
  }, delay);
  // Jangan tahan proses tetap hidup hanya karena timer cron
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Pasang scheduler scoring malam (dipanggil dari src/server.js).
 * Idempotent: pemanggilan kedua tidak membuat timer ganda.
 */
function startScoringCron() {
  if (timer) return;
  scheduleNext();
  console.log(`[SCORING CRON] Terjadwal, run berikutnya dalam ${Math.round(msUntilNextRun() / 60000)} menit.`);
}

/**
 * Hentikan scheduler (dipakai saat shutdown / test).
 */
function stopScoringCron() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

module.exports = {
  startScoringCron,
  stopScoringCron,
  runScheduledScoring,
  msUntilNextRun,
};

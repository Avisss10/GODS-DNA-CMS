require('dotenv').config();
const app = require('./app');
const { testConnection, closePool } = require('./config/database');
const { testRedisConnection, closeRedis } = require('./config/redis');
const { validateEnv } = require('./config/validate-env');
const { startScoringCron, stopScoringCron } = require('./scripts/scoring-cron');
const { startReportCleanupJob, stopReportCleanupJob } = require('./modules/report/report-cleanup.job');

const PORT = process.env.PORT || 3000;

function startServer(port = PORT) {
  return app.listen(port);
}

/**
 * Fail-fast boot sequence: server tidak akan listen di port jika env var
 * wajib tidak lengkap, atau koneksi database/Redis gagal.
 */
async function bootstrap() {
  // Paling awal — sebelum menyentuh DB/Redis (audit item 10).
  validateEnv();

  try {
    await testConnection();
    console.log('Koneksi database berhasil.');
  } catch (err) {
    console.error('Gagal terhubung ke database:', err.message);
    process.exit(1);
  }

  try {
    await testRedisConnection();
    console.log('Koneksi Redis berhasil.');
  } catch (err) {
    console.error('Gagal terhubung ke Redis:', err.message);
    process.exit(1);
  }

  const server = startServer();
  console.log(`GODS DNA CMS backend running on port ${PORT}`);

  // Job berkala — tidak dipasang saat test:
  // scoring malam (02:00) + cleanup file laporan kedaluwarsa (tiap 1 jam)
  if (process.env.NODE_ENV !== 'test') {
    startScoringCron();
    startReportCleanupJob();
  }

  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    stopScoringCron();
    stopReportCleanupJob();

    // Timeout paksa: jika server.close (menunggu koneksi aktif selesai)
    // belum tuntas dalam 10 detik, hentikan proses secara paksa agar
    // deploy/restart tidak menggantung tanpa batas.
    const forceExitTimer = setTimeout(() => {
      console.error('Graceful shutdown melewati 10 detik, proses dihentikan paksa.');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close(async () => {
      await closePool();
      await closeRedis();   // ← TAMBAH
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, startServer, bootstrap };
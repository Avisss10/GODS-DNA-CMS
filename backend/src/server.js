require('dotenv').config();
const app = require('./app');
const { testConnection, closePool } = require('./config/database');

const PORT = process.env.PORT || 3000;

function startServer(port = PORT) {
  return app.listen(port);
}

/**
 * Fail-fast boot sequence: server tidak akan listen di port jika
 * koneksi database gagal. Ini mencegah server "kelihatan jalan"
 * padahal tidak bisa melayani request apapun yang butuh DB.
 */
async function bootstrap() {
  try {
    await testConnection();
    console.log('Koneksi database berhasil.');
  } catch (err) {
    console.error('Gagal terhubung ke database:', err.message);
    process.exit(1);
  }

  const server = startServer();
  console.log(`GODS DNA CMS backend running on port ${PORT}`);

  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close(async () => {
      await closePool();
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
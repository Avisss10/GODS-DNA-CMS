/**
 * Validasi environment variable wajib saat boot (audit item 10).
 *
 * Dipanggil PALING AWAL di bootstrap — sebelum mencoba connect DB/Redis —
 * sehingga kalau ada konfigurasi yang hilang, pesan error langsung
 * actionable (menyebut var mana yang kosong) dan proses berhenti cepat
 * dengan exit code 1, bukan gagal misterius saat request pertama.
 */
const REQUIRED_ENV_VARS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'AES_ENCRYPTION_KEY',
  'AUDIT_HMAC_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'REDIS_HOST',
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(
    (v) => process.env[v] === undefined || String(process.env[v]).trim() === ''
  );

  if (missing.length > 0) {
    console.error('Environment variable wajib berikut kosong atau belum diset:');
    missing.forEach((v) => console.error(`  - ${v}`));
    console.error('Lengkapi file .env (lihat .env.example) lalu jalankan ulang.');
    process.exit(1);
  }
}

module.exports = { validateEnv, REQUIRED_ENV_VARS };

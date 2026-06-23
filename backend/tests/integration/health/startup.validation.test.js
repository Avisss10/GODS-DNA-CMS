require('dotenv').config();
const { validateEnvVars } = require('../../../src/utils/validation.util');

describe('startup.validation — Environment Variables (Integration Test)', () => {
  it('semua env var wajib backend harus tersedia di environment test', () => {
    const requiredVars = [
      'DB_HOST',
      'DB_USER',
      'DB_NAME',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'AES_ENCRYPTION_KEY',
      'AUDIT_HMAC_SECRET',
    ];

    // Di environment test semua ini harus sudah ada di .env
    // Jika ada yang missing, ini adalah bug konfigurasi, bukan bug kode
    const missing = requiredVars.filter((v) => !process.env[v]);
    expect(missing).toHaveLength(0);
  });

  it('validateEnvVars harus throw dengan pesan yang jelas jika ada yang missing', () => {
    expect(() => validateEnvVars(['ENV_YANG_PASTI_TIDAK_ADA_XYZ123']))
      .toThrow('Environment variables wajib tidak ditemukan');
  });

  it('AES_ENCRYPTION_KEY harus memiliki panjang yang benar (32 bytes = 64 hex chars atau 32 chars)', () => {
    const key = process.env.AES_ENCRYPTION_KEY;
    if (!key) return; // skip jika tidak ada
    // Key bisa berupa string 32 char atau hex 64 char
    expect([32, 64]).toContain(key.length);
  });
});
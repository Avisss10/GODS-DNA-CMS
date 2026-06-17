const crypto = require('crypto');

/**
 * Menghasilkan recovery code acak (format: XXXX-XXXX-XXXX-XXXX,
 * base32-like alphanumeric uppercase agar mudah ditulis/dibaca manual
 * saat proses recovery offline oleh developer — BAGIAN 1.3).
 */
function generateRecoveryCode() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa karakter ambigu (0/O, 1/I)
  const segments = [];

  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let i = 0; i < 4; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      segment += charset[randomIndex];
    }
    segments.push(segment);
  }

  return segments.join('-');
}

/**
 * Membuat hash SHA-256 dari recovery code, untuk disimpan di
 * environment variable (RECOVERY_CODE_HASH). Recovery code asli
 * (plaintext) TIDAK disimpan di sistem mana pun — sesuai sifat
 * "offline" pada BAGIAN 1.3.
 */
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function main() {
  const code = generateRecoveryCode();
  const hash = hashRecoveryCode(code);

  console.log('============================================');
  console.log('RECOVERY CODE (SIMPAN SECARA OFFLINE, JANGAN DI GIT/DB):');
  console.log(code);
  console.log('============================================');
  console.log('Tambahkan baris berikut ke file .env Anda:');
  console.log(`RECOVERY_CODE_HASH=${hash}`);
  console.log('============================================');
}

if (require.main === module) {
  main();
}

module.exports = { generateRecoveryCode, hashRecoveryCode };
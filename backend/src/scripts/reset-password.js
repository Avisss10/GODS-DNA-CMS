require('dotenv').config();
const readline = require('readline');
const { hashPassword } = require('../utils/password.util');
const { findByUsername, updatePassword } = require('../modules/auth/auth.repository');
const { recordAuditLog } = require('../modules/auditlog/auditlog.repository');
const { hashRecoveryCode } = require('./generate-recovery-code');
const { closePool } = require('../config/database');

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (hidden) {
    // Sembunyikan input password dari terminal
    process.stdout.write(question);
    return new Promise((resolve) => {
      let password = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function handler(ch) {
        if (ch === '\n' || ch === '\r' || ch === '') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          rl.close();
          resolve(password);
        } else if (ch === '') {
          password = password.slice(0, -1);
        } else {
          password += ch;
        }
      });
    });
  }

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Verifikasi recovery code terhadap RECOVERY_CODE_HASH di environment
 * (mekanisme hash sama dengan src/scripts/generate-recovery-code.js).
 * Reset password TANPA verifikasi ini adalah lubang keamanan — script
 * bisa dijalankan siapa pun yang punya akses shell.
 *
 * @param {string} inputCode - recovery code yang diketik user
 * @param {string|undefined} storedHash - process.env.RECOVERY_CODE_HASH
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyRecoveryCode(inputCode, storedHash) {
  if (!storedHash) {
    return {
      valid: false,
      reason: 'RECOVERY_CODE_HASH belum diset di .env. Jalankan "node src/scripts/generate-recovery-code.js" terlebih dahulu.',
    };
  }
  if (!inputCode) {
    return { valid: false, reason: 'Recovery code wajib diisi.' };
  }
  if (hashRecoveryCode(inputCode.trim()) !== storedHash) {
    return { valid: false, reason: 'Recovery code salah.' };
  }
  return { valid: true };
}

async function main() {
  console.log('=== Reset Password GODS DNA CMS ===');
  console.log('Script ini hanya untuk reset password LEADER via terminal.');
  console.log('Butuh recovery code yang dibuat via generate-recovery-code.js.\n');

  // Verifikasi recovery code SEBELUM menyentuh data user
  const recoveryCode = await ask('Recovery code: ', true);
  const verification = verifyRecoveryCode(recoveryCode, process.env.RECOVERY_CODE_HASH);
  if (!verification.valid) {
    console.error(`Error: ${verification.reason}`);
    process.exitCode = 1;
    await closePool();
    return;
  }

  const username = await ask('Username: ');

  const user = await findByUsername(username);
  if (!user) {
    console.error(`Error: Username "${username}" tidak ditemukan.`);
    process.exitCode = 1;
    await closePool();
    return;
  }

  console.log(`Ditemukan: username="${user.username}", peran=${user.peran}, aktif=${user.aktif}`);

  const newPassword = await ask('Password baru: ', true);
  if (!newPassword || newPassword.length < 8) {
    console.error('Error: Password minimal 8 karakter.');
    process.exitCode = 1;
    await closePool();
    return;
  }

  const confirm = await ask('Konfirmasi password baru: ', true);
  if (newPassword !== confirm) {
    console.error('Error: Konfirmasi password tidak cocok.');
    process.exitCode = 1;
    await closePool();
    return;
  }

  try {
    const newHash = await hashPassword(newPassword);
    await updatePassword(user.id, newHash);

    // Jejak recovery wajib tercatat: aksi khusus RESET_PASSWORD_RECOVERY
    // (userId null — dilakukan via terminal, bukan sesi login).
    await recordAuditLog({
      userId: null,
      aksi: 'RESET_PASSWORD_RECOVERY',
      modul: 'AUTH',
      objectId: user.id,
      dataSebelum: { username: user.username },
      dataSesudah: { username: user.username, passwordReset: true, via: 'recovery-code' },
    });

    console.log(`\nPassword "${user.username}" (${user.peran}) berhasil direset.`);
    console.log('Sesi aktif di Redis perlu dihapus manual jika user sedang login:');
    console.log(`  redis-cli DEL active_session:${user.id} refresh_token:${user.id}`);
  } catch (err) {
    console.error('Gagal reset password:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { ask, verifyRecoveryCode, main };

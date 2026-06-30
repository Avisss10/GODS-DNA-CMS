require('dotenv').config();
const readline = require('readline');
const { hashPassword } = require('../utils/password.util');
const { findByUsername, updatePassword } = require('../modules/auth/auth.repository');
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
        if (ch === '\n' || ch === '\r' || ch === '') {
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

async function main() {
  console.log('=== Reset Password GODS DNA CMS ===');
  console.log('Script ini hanya untuk reset password LEADER via terminal.\n');

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

main();

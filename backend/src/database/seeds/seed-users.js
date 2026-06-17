require('dotenv').config();
const readline = require('readline');
const { hashPassword } = require('../../utils/password.util');
const { findByUsername, createUser } = require('../../modules/auth/auth.repository');
const { closePool } = require('../../config/database');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Script CLI interaktif untuk membuat user LEADER/ADMIN pertama.
 * Dijalankan manual oleh developer saat setup awal sistem —
 * BAGIAN 11: "Setup minimal 2 akun Leader + simpan Recovery Code offline".
 *
 * Dipisah dari logic inti (createSeedUser) agar logic bisa diuji
 * tanpa perlu mensimulasikan input interaktif CLI.
 */
async function createSeedUser({ username, password, peran }) {
  const existing = await findByUsername(username);
  if (existing) {
    throw new Error(`Username "${username}" sudah terdaftar`);
  }

  if (!['LEADER', 'ADMIN'].includes(peran)) {
    throw new Error('Peran harus LEADER atau ADMIN');
  }

  const passwordHash = await hashPassword(password);
  const id = await createUser({ username, passwordHash, peran });
  return { id, username, peran };
}

async function main() {
  console.log('=== Seed User GODS DNA CMS ===');
  const username = await ask('Username: ');
  const password = await ask('Password: ');
  const peran = (await ask('Peran (LEADER/ADMIN): ')).toUpperCase().trim();

  try {
    const user = await createSeedUser({ username, password, peran });
    console.log(`User berhasil dibuat: id=${user.id}, username=${user.username}, peran=${user.peran}`);
  } catch (err) {
    console.error('Gagal membuat user:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { createSeedUser };
require('dotenv').config();
const { getPool, closePool } = require('../config/database');
const { decrypt } = require('../utils/encryption.util');
const { hashPhone } = require('../utils/hash.util');

/**
 * Backfill satu-kali untuk mengisi kolom jemaat.no_hp_hash (audit item 5).
 *
 * Idempotent: hanya memproses baris yang punya no_hp terenkripsi TAPI
 * belum punya no_hp_hash (no_hp_hash IS NULL). Aman dijalankan berkali-kali.
 *
 * Untuk tiap baris: dekripsi no_hp dengan no_hp_iv, hitung hashPhone
 * (normalisasi + SHA-256), lalu UPDATE no_hp_hash. Baris yang gagal
 * didekripsi (IV korup) dilewati dan dicatat sebagai warning.
 *
 * Jalankan SETELAH migration 004_add_jemaat_no_hp_hash.sql diterapkan:
 *   node src/scripts/backfill-no-hp-hash.js
 */
async function main() {
  const pool = getPool();
  console.log('=== Backfill jemaat.no_hp_hash ===');

  const [rows] = await pool.query(
    `SELECT id, no_hp, no_hp_iv FROM jemaat
     WHERE no_hp IS NOT NULL AND no_hp_iv IS NOT NULL AND no_hp_hash IS NULL`
  );

  console.log(`Ditemukan ${rows.length} baris yang perlu di-backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    let plaintext;
    try {
      plaintext = decrypt(row.no_hp, row.no_hp_iv);
    } catch (err) {
      console.warn(`  [SKIP] id=${row.id}: gagal dekripsi no_hp (${err.message})`);
      skipped += 1;
      continue;
    }

    await pool.query(
      'UPDATE jemaat SET no_hp_hash = :hash WHERE id = :id',
      { hash: hashPhone(plaintext), id: row.id }
    );
    updated += 1;
  }

  console.log(`Selesai. ${updated} baris di-update, ${skipped} dilewati.`);
}

main()
  .catch((err) => {
    console.error('Backfill gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

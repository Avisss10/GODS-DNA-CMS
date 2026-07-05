require('dotenv').config();
const { getPool, closePool } = require('../config/database');
const { encrypt } = require('../utils/encryption.util');

/**
 * Backfill satu-kali untuk mengenkripsi kolom identitas jemaat
 * (nama, tgl_lahir, jenis_kelamin) pada baris lama yang masih
 * plaintext, setelah migration 005_encrypt_jemaat_identity.sql
 * mengubah tipe kolom ke TEXT dan menambah kolom _iv.
 *
 * Idempotent: sebuah field hanya diproses jika kolom _iv-nya masih
 * NULL (baris lama, plaintext). Baris yang _iv-nya sudah terisi
 * dilewati — aman dijalankan berkali-kali tanpa dobel-enkripsi.
 *
 * Setiap baris diproses dalam SATU transaksi: ketiga field
 * dienkripsi (masing-masing dengan IV baru) dan di-UPDATE bersama
 * kolom _iv-nya secara atomik, sehingga tidak mungkin ada baris
 * setengah-terenkripsi jika proses terputus di tengah.
 *
 * Jalankan SETELAH migration 005 diterapkan:
 *   node src/scripts/backfill-encrypt-jemaat-identity.js
 */

const IDENTITY_COLUMNS = [
  { column: 'nama', ivColumn: 'nama_iv' },
  { column: 'tgl_lahir', ivColumn: 'tgl_lahir_iv' },
  { column: 'jenis_kelamin', ivColumn: 'jenis_kelamin_iv' },
];

/**
 * Nilai tgl_lahir plaintext bisa berupa string 'YYYY-MM-DD' (hasil
 * konversi DATE->TEXT migration 005) — pastikan hanya bagian tanggal
 * yang dienkripsi, konsisten dengan format yang ditulis create().
 */
function normalizePlaintext(column, value) {
  const str = String(value);
  if (column === 'tgl_lahir') {
    const match = str.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  return str;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<{ updated: number, skipped: number }>}
 */
async function backfillEncryptJemaatIdentity(pool) {
  const [rows] = await pool.query(
    `SELECT id, nama, nama_iv, tgl_lahir, tgl_lahir_iv,
            jenis_kelamin, jenis_kelamin_iv
     FROM jemaat
     WHERE nama_iv IS NULL OR tgl_lahir_iv IS NULL OR jenis_kelamin_iv IS NULL`
  );

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const setClauses = [];
    const params = { id: row.id };

    // Idempotent per field: hanya enkripsi field yang _iv-nya masih
    // NULL — field yang sudah terenkripsi tidak disentuh.
    for (const { column, ivColumn } of IDENTITY_COLUMNS) {
      if (row[ivColumn] !== null) continue;
      if (row[column] === null || row[column] === undefined) continue;

      const enc = encrypt(normalizePlaintext(column, row[column]));
      setClauses.push(`${column} = :${column}`, `${ivColumn} = :${ivColumn}`);
      params[column] = enc.ciphertext;
      params[ivColumn] = enc.iv;
    }

    if (setClauses.length === 0) {
      skipped += 1;
      continue;
    }

    // Satu transaksi per baris: UPDATE nilai + IV secara atomik.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `UPDATE jemaat SET ${setClauses.join(', ')} WHERE id = :id`,
        params
      );
      await connection.commit();
      updated += 1;
    } catch (err) {
      await connection.rollback();
      console.warn(`  [SKIP] id=${row.id}: gagal backfill (${err.message})`);
      skipped += 1;
    } finally {
      connection.release();
    }
  }

  return { updated, skipped };
}

async function main() {
  const pool = getPool();
  console.log('=== Backfill enkripsi identitas jemaat (nama, tgl_lahir, jenis_kelamin) ===');

  const { updated, skipped } = await backfillEncryptJemaatIdentity(pool);

  console.log(`Selesai. ${updated} baris di-update, ${skipped} dilewati.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Backfill gagal:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool();
    });
}

module.exports = { backfillEncryptJemaatIdentity };

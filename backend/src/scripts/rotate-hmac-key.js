require('dotenv').config();
const crypto = require('crypto');
const { getPool, closePool } = require('../config/database');
const { verifyHmac } = require('../modules/auditlog/auditlog.service');

/**
 * Rotasi AUDIT_HMAC_SECRET: hitung ulang hmac_signature semua baris
 * audit_logs dengan secret BARU, per batch dalam transaksi.
 *
 * Baris yang signature-nya TIDAK valid terhadap secret lama
 * (POTENTIALLY_TAMPERED) TIDAK di-re-sign — me-re-sign baris seperti
 * itu sama saja melegitimasi manipulasi. Baris tersebut dilaporkan dan
 * dibiarkan apa adanya (tetap terdeteksi tampered setelah rotasi).
 *
 * Pemakaian:
 *   Dry-run (default, tidak menulis apa pun):
 *     AUDIT_HMAC_SECRET_NEW=<hex64> node src/scripts/rotate-hmac-key.js
 *   Eksekusi nyata:
 *     AUDIT_HMAC_SECRET_NEW=<hex64> node src/scripts/rotate-hmac-key.js --execute
 *
 * Setelah eksekusi sukses: ganti AUDIT_HMAC_SECRET di .env dengan
 * nilai AUDIT_HMAC_SECRET_NEW, lalu HAPUS AUDIT_HMAC_SECRET_NEW.
 */

const BATCH_SIZE = 100;
const VERIFY_SAMPLE_SIZE = 10;

/**
 * Message HMAC — formula HARUS identik dengan verifyHmac di
 * auditlog.service.js (dan computeHmac di repository), dihitung dari
 * baris sebagaimana dibaca dari database.
 */
function buildMessage(row) {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  return [
    String(row.id),
    String(row.user_id ?? ''),
    String(row.aksi ?? ''),
    String(row.modul ?? ''),
    String(row.object_id ?? ''),
    JSON.stringify(row.data_sebelum ?? null),
    JSON.stringify(row.data_sesudah ?? null),
    createdAt,
  ].join('');
}

function sign(secret, row) {
  return crypto.createHmac('sha256', secret).update(buildMessage(row)).digest('hex');
}

function loadSecret(envName) {
  const secret = process.env[envName];
  if (!secret) throw new Error(`${envName} belum diset di environment`);
  if (secret.length < 32) throw new Error(`${envName} terlalu pendek (< 32 karakter)`);
  return secret;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const oldSecret = loadSecret('AUDIT_HMAC_SECRET');
  const newSecret = loadSecret('AUDIT_HMAC_SECRET_NEW');
  if (oldSecret === newSecret) {
    throw new Error('AUDIT_HMAC_SECRET_NEW sama dengan secret lama — generate secret baru dulu');
  }

  const pool = getPool();
  console.log(`=== Rotasi HMAC audit log — mode: ${execute ? 'EXECUTE (menulis!)' : 'DRY-RUN (tidak menulis)'} ===`);

  const stats = {
    rowsScanned: 0,
    rowsResigned: 0,
    tampered: [], // id baris yang gagal verifikasi dengan secret lama
  };
  const sampleIds = [];

  let lastId = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT id, user_id, aksi, modul, object_id,
              data_sebelum, data_sesudah, hmac_signature, created_at
       FROM audit_logs
       WHERE id > :lastId ORDER BY id LIMIT :batch`,
      { lastId, batch: BATCH_SIZE }
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    const updates = []; // { id, hmac }
    for (const row of rows) {
      stats.rowsScanned += 1;

      // Validasi terhadap secret LAMA memakai verifyHmac milik service
      // (process.env.AUDIT_HMAC_SECRET masih berisi secret lama).
      const { valid } = verifyHmac(row);
      if (!valid) {
        stats.tampered.push(row.id);
        continue; // jangan re-sign baris yang terindikasi tampered
      }

      if (execute) {
        updates.push({ id: row.id, hmac: sign(newSecret, row) });
      }
    }

    if (execute && updates.length > 0) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const u of updates) {
          await connection.query(
            'UPDATE audit_logs SET hmac_signature = :hmac WHERE id = :id',
            u
          );
        }
        await connection.commit();
        stats.rowsResigned += updates.length;
        for (const u of updates) {
          if (sampleIds.length < VERIFY_SAMPLE_SIZE) sampleIds.push(u.id);
          else if (Math.random() < VERIFY_SAMPLE_SIZE / stats.rowsResigned) {
            sampleIds[Math.floor(Math.random() * VERIFY_SAMPLE_SIZE)] = u.id;
          }
        }
      } catch (err) {
        await connection.rollback();
        throw new Error(`Batch gagal (id s/d ${lastId}), transaksi di-rollback: ${err.message}`);
      } finally {
        connection.release();
      }
    }

    process.stdout.write(`  ...${stats.rowsScanned} baris diproses\r`);
  }

  console.log(`\nBaris dipindai   : ${stats.rowsScanned}`);
  console.log(`Terindikasi tampered (skip): ${stats.tampered.length}${stats.tampered.length ? ` (id: ${stats.tampered.join(', ')})` : ''}`);

  if (!execute) {
    console.log(
      stats.tampered.length === 0
        ? '\nDRY-RUN OK: semua signature valid dengan secret lama. Jalankan ulang dengan --execute untuk re-sign dengan secret baru.'
        : '\nDRY-RUN: ada baris tampered — baris itu TIDAK akan di-re-sign saat --execute. Investigasi dulu bila perlu.'
    );
    return;
  }

  console.log(`Baris di-re-sign : ${stats.rowsResigned}`);

  // Verifikasi sampel memakai verifyHmac dari service dengan secret BARU.
  console.log(`\nVerifikasi sampel acak (${sampleIds.length} baris) dengan verifyHmac...`);
  const originalSecret = process.env.AUDIT_HMAC_SECRET;
  process.env.AUDIT_HMAC_SECRET = newSecret;
  let verifyFailed = 0;
  try {
    for (const id of sampleIds) {
      const [rows] = await pool.query(
        `SELECT id, user_id, aksi, modul, object_id,
                data_sebelum, data_sesudah, hmac_signature, created_at
         FROM audit_logs WHERE id = :id`,
        { id }
      );
      const { valid, status } = verifyHmac(rows[0]);
      if (!valid) {
        verifyFailed += 1;
        console.log(`  [GAGAL] id=${id}: ${status}`);
      }
    }
  } finally {
    process.env.AUDIT_HMAC_SECRET = originalSecret;
  }

  if (verifyFailed === 0) {
    console.log('Verifikasi sampel OK — semua signature valid dengan secret baru.');
    console.log('\nLANGKAH SELANJUTNYA (manual):');
    console.log('  1. Ganti nilai AUDIT_HMAC_SECRET di .env dengan nilai AUDIT_HMAC_SECRET_NEW.');
    console.log('  2. HAPUS baris AUDIT_HMAC_SECRET_NEW dari .env / environment.');
    console.log('  3. Restart server.');
  } else {
    console.log(`VERIFIKASI GAGAL pada ${verifyFailed} baris — JANGAN ganti .env; investigasi dulu.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Rotasi HMAC gagal:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool();
    });
}

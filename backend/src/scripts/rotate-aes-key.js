require('dotenv').config();
const crypto = require('crypto');
const { getPool, closePool } = require('../config/database');
const { hashPhone } = require('../utils/hash.util');

/**
 * Rotasi AES_ENCRYPTION_KEY: dekripsi semua kolom terenkripsi dengan
 * key LAMA, enkripsi ulang dengan key BARU (IV baru per field), lalu
 * UPDATE per batch dalam transaksi.
 *
 * Daftar kolom ditentukan dari penelusuran pemakaian encryption.util
 * di seluruh repository (jemaat.repository create/update adalah
 * satu-satunya titik tulis; repository lain hanya mendekripsi kolom
 * jemaat via JOIN). Saat runtime daftar ini dicocokkan lagi dengan
 * information_schema — jika ada kolom *_iv lain di database yang tidak
 * tercakup, script berhenti sebelum menyentuh apa pun.
 *
 * Kolom no_hp_hash TIDAK ikut dirotasi: hash.util memakai SHA-256
 * murni tanpa key (bukan HMAC), jadi nilainya tidak bergantung pada
 * AES_ENCRYPTION_KEY. Dry-run tetap memverifikasinya sebagai sanity
 * check (hashPhone(no_hp terdekripsi) harus sama dengan no_hp_hash).
 *
 * Pemakaian:
 *   Dry-run (default, tidak menulis apa pun):
 *     AES_ENCRYPTION_KEY_NEW=<hex64> node src/scripts/rotate-aes-key.js
 *   Eksekusi nyata:
 *     AES_ENCRYPTION_KEY_NEW=<hex64> node src/scripts/rotate-aes-key.js --execute
 *
 * Setelah eksekusi sukses: ganti AES_ENCRYPTION_KEY di .env dengan
 * nilai AES_ENCRYPTION_KEY_NEW, lalu HAPUS AES_ENCRYPTION_KEY_NEW.
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH_BYTES = 16;
const BATCH_SIZE = 100;
const VERIFY_SAMPLE_SIZE = 10;

// Hasil penelusuran pemakaian encryption.util (lihat komentar di atas).
// IV NULL berarti baris lama yang masih plaintext (pola decryptOptional)
// — field seperti itu dilewati, tidak didekripsi maupun dienkripsi ulang.
const TARGET_TABLE = 'jemaat';
const ENCRYPTED_COLUMNS = [
  { column: 'nama', ivColumn: 'nama_iv' },
  { column: 'tgl_lahir', ivColumn: 'tgl_lahir_iv' },
  { column: 'jenis_kelamin', ivColumn: 'jenis_kelamin_iv' },
  { column: 'no_hp', ivColumn: 'no_hp_iv' },
  { column: 'alamat', ivColumn: 'alamat_iv' },
  { column: 'media_sosial', ivColumn: 'media_sosial_iv' },
];

function loadKey(envName) {
  const hexKey = process.env[envName];
  if (!hexKey) {
    throw new Error(`${envName} belum diset di environment`);
  }
  const buf = Buffer.from(hexKey, 'hex');
  if (buf.length !== 32) {
    throw new Error(`${envName} harus hex string 64 karakter (32 byte), ditemukan ${buf.length} byte`);
  }
  return buf;
}

function decryptWith(key, ciphertext, ivHex) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

function encryptWith(key, plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  return { ciphertext, iv: iv.toString('hex') };
}

/**
 * Guard runtime: pastikan tidak ada kolom *_iv di database yang tidak
 * tercakup ENCRYPTED_COLUMNS — kalau ada, berarti ada data terenkripsi
 * lain yang akan tertinggal dengan key lama.
 */
async function assertColumnCoverage(pool) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME LIKE '%\\_iv'`
  );

  const known = new Set(
    ENCRYPTED_COLUMNS.map((c) => `${TARGET_TABLE}.${c.ivColumn}`)
  );
  const unknown = rows
    .map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)
    .filter((name) => !known.has(name));

  if (unknown.length > 0) {
    throw new Error(
      `Ditemukan kolom _iv di luar cakupan script: ${unknown.join(', ')}. ` +
      `Perbarui ENCRYPTED_COLUMNS sebelum melanjutkan.`
    );
  }

  const missing = ENCRYPTED_COLUMNS.filter(
    (c) => !rows.some((r) => r.TABLE_NAME === TARGET_TABLE && r.COLUMN_NAME === c.ivColumn)
  );
  if (missing.length > 0) {
    throw new Error(
      `Kolom _iv tidak ditemukan di database: ${missing.map((c) => c.ivColumn).join(', ')}`
    );
  }
}

function selectColumns() {
  const cols = ['id', 'no_hp_hash'];
  for (const { column, ivColumn } of ENCRYPTED_COLUMNS) {
    cols.push(column, ivColumn);
  }
  return cols.join(', ');
}

async function main() {
  const execute = process.argv.includes('--execute');
  const oldKey = loadKey('AES_ENCRYPTION_KEY');
  const newKey = loadKey('AES_ENCRYPTION_KEY_NEW');
  if (oldKey.equals(newKey)) {
    throw new Error('AES_ENCRYPTION_KEY_NEW sama dengan key lama — generate key baru dulu');
  }

  const pool = getPool();
  await assertColumnCoverage(pool);

  console.log(`=== Rotasi AES key — mode: ${execute ? 'EXECUTE (menulis!)' : 'DRY-RUN (tidak menulis)'} ===`);
  console.log(`Tabel: ${TARGET_TABLE}; kolom: ${ENCRYPTED_COLUMNS.map((c) => c.column).join(', ')}`);

  const stats = {
    rowsScanned: 0,
    rowsUpdated: 0,
    fieldsRotated: 0,
    fieldsPlaintextSkipped: 0, // _iv NULL: baris lama plaintext
    fieldsNullSkipped: 0,      // nilai NULL
    decryptFailures: [],       // { id, column, error }
    hashMismatches: [],        // sanity check no_hp_hash
  };

  // Sampel acak (reservoir sampling) untuk verifikasi pasca-eksekusi:
  // simpan plaintext hasil dekripsi key lama, nanti dibandingkan dengan
  // hasil dekripsi key baru setelah UPDATE.
  const sample = [];

  let lastId = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT ${selectColumns()} FROM ${TARGET_TABLE}
       WHERE id > :lastId ORDER BY id LIMIT :batch`,
      { lastId, batch: BATCH_SIZE }
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    const updates = []; // { id, setClauses, params, plaintexts }
    for (const row of rows) {
      stats.rowsScanned += 1;
      const setClauses = [];
      const params = { id: row.id };
      const plaintexts = {};
      let rowFailed = false;

      for (const { column, ivColumn } of ENCRYPTED_COLUMNS) {
        if (row[column] === null || row[column] === undefined) {
          stats.fieldsNullSkipped += 1;
          continue;
        }
        if (!row[ivColumn]) {
          stats.fieldsPlaintextSkipped += 1;
          continue;
        }

        let plaintext;
        try {
          plaintext = decryptWith(oldKey, row[column], row[ivColumn]);
        } catch (err) {
          stats.decryptFailures.push({ id: row.id, column, error: err.message });
          rowFailed = true;
          continue;
        }

        plaintexts[column] = plaintext;
        stats.fieldsRotated += 1;

        if (column === 'no_hp' && row.no_hp_hash && hashPhone(plaintext) !== row.no_hp_hash) {
          stats.hashMismatches.push(row.id);
        }

        if (execute) {
          const enc = encryptWith(newKey, plaintext);
          setClauses.push(`${column} = :${column}`, `${ivColumn} = :${ivColumn}`);
          params[column] = enc.ciphertext;
          params[ivColumn] = enc.iv;
        }
      }

      // Baris yang sebagian field-nya gagal didekripsi tidak di-update
      // sama sekali — hindari baris campur key lama/baru.
      if (execute && !rowFailed && setClauses.length > 0) {
        updates.push({ id: row.id, setClauses, params });
        if (Object.keys(plaintexts).length > 0) {
          if (sample.length < VERIFY_SAMPLE_SIZE) {
            sample.push({ id: row.id, plaintexts });
          } else if (Math.random() < VERIFY_SAMPLE_SIZE / stats.rowsScanned) {
            sample[Math.floor(Math.random() * VERIFY_SAMPLE_SIZE)] = { id: row.id, plaintexts };
          }
        }
      }
    }

    if (execute && updates.length > 0) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const u of updates) {
          await connection.query(
            `UPDATE ${TARGET_TABLE} SET ${u.setClauses.join(', ')} WHERE id = :id`,
            u.params
          );
        }
        await connection.commit();
        stats.rowsUpdated += updates.length;
      } catch (err) {
        await connection.rollback();
        throw new Error(`Batch gagal (id s/d ${lastId}), transaksi di-rollback: ${err.message}`);
      } finally {
        connection.release();
      }
    }

    process.stdout.write(`  ...${stats.rowsScanned} baris diproses\r`);
  }

  console.log(`\nBaris dipindai        : ${stats.rowsScanned}`);
  console.log(`Field dirotasi        : ${stats.fieldsRotated}${execute ? '' : ' (bisa didekripsi dengan key lama)'}`);
  console.log(`Field plaintext (skip): ${stats.fieldsPlaintextSkipped} (_iv NULL, belum pernah dienkripsi)`);
  console.log(`Field NULL (skip)     : ${stats.fieldsNullSkipped}`);
  console.log(`Gagal dekripsi        : ${stats.decryptFailures.length}`);
  for (const f of stats.decryptFailures) {
    console.log(`  [GAGAL] id=${f.id} kolom=${f.column}: ${f.error}`);
  }
  console.log(
    `no_hp_hash: TIDAK terdampak rotasi (SHA-256 tanpa key). ` +
    (stats.hashMismatches.length === 0
      ? 'Sanity check konsisten pada semua baris yang diperiksa.'
      : `PERINGATAN: ${stats.hashMismatches.length} baris hash tidak cocok (id: ${stats.hashMismatches.join(', ')}) — periksa terpisah, bukan akibat rotasi.`)
  );

  if (!execute) {
    if (stats.decryptFailures.length > 0) {
      console.log('\nDRY-RUN GAGAL: ada baris yang tidak bisa didekripsi dengan key lama. JANGAN --execute sebelum ini dibereskan.');
      process.exitCode = 1;
    } else {
      console.log('\nDRY-RUN OK: semua field terenkripsi bisa didekripsi dengan key lama. Jalankan ulang dengan --execute untuk rotasi nyata.');
    }
    return;
  }

  console.log(`Baris di-update       : ${stats.rowsUpdated}`);
  if (stats.decryptFailures.length > 0) {
    console.log('PERINGATAN: baris yang gagal didekripsi TIDAK di-update dan masih memakai key lama.');
    process.exitCode = 1;
  }

  // Verifikasi sampel: baca ulang dari DB, dekripsi dengan key BARU,
  // hasilnya harus identik dengan plaintext yang dibaca pakai key lama.
  console.log(`\nVerifikasi sampel acak (${sample.length} baris)...`);
  let verifyFailed = 0;
  for (const s of sample) {
    const [rows] = await pool.query(
      `SELECT ${selectColumns()} FROM ${TARGET_TABLE} WHERE id = :id`,
      { id: s.id }
    );
    const row = rows[0];
    for (const [column, expected] of Object.entries(s.plaintexts)) {
      const ivColumn = `${column}_iv`;
      try {
        const actual = decryptWith(newKey, row[column], row[ivColumn]);
        if (actual !== expected) {
          verifyFailed += 1;
          console.log(`  [BEDA] id=${s.id} kolom=${column}: hasil dekripsi key baru tidak sama`);
        }
      } catch (err) {
        verifyFailed += 1;
        console.log(`  [GAGAL] id=${s.id} kolom=${column}: ${err.message}`);
      }
    }
  }

  if (verifyFailed === 0) {
    console.log('Verifikasi sampel OK — semua nilai identik setelah dekripsi dengan key baru.');
    console.log('\nLANGKAH SELANJUTNYA (manual):');
    console.log('  1. Ganti nilai AES_ENCRYPTION_KEY di .env dengan nilai AES_ENCRYPTION_KEY_NEW.');
    console.log('  2. HAPUS baris AES_ENCRYPTION_KEY_NEW dari .env / environment.');
    console.log('  3. Restart server.');
  } else {
    console.log(`VERIFIKASI GAGAL pada ${verifyFailed} field — JANGAN ganti .env; restore dari backup dan investigasi.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Rotasi AES gagal:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePool();
    });
}
